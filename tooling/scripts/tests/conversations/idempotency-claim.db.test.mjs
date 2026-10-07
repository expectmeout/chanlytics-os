/**
 * The reply's idempotency key, claimed on a real database.
 *
 * Two callers under one key at once used to both read "no receipt yet" and
 * both send (audit 15.1). The claim is now an insert on the table's unique
 * (tenant_id, key), which the fake cannot judge; what is proved here is the
 * part only Postgres can answer: of several claims in the same instant exactly
 * one wins; a claim after it is shown what the winner left; the receipt
 * completes the row; an abandoned hold is taken over by exactly one of two
 * callers who both read it, on the stamp PostgREST returned; and a release
 * removes the claim it names and nothing else. The repositories are called
 * through the committed dist, as the dashboard calls them.
 *
 * Runs the way thread-control.db.test.mjs does, against the database
 * `supabase start` builds on this machine, never production. Skipped without
 * a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes a workspace"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { claimIdempotencyKey, takeIdempotencyKey, releaseIdempotencyKey, keepIdempotencyReceipt } = await import(
  pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href
);

let db;
let tenantId;
const stamp = Date.now().toString(36);
const ROUTE = "reply";
let n = 0;
/** A key of its own per case, scoped the way the reply scopes it: to a made-up caller. */
const key = () => `u-${stamp}:key-${++n}`;
const at = (ms) => new Date(ms).toISOString();
const claim = (k, requestHash, nowIso = at(Date.now())) =>
  claimIdempotencyKey(db, { tenantId, key: k, route: ROUTE, requestHash, nowIso });
const take = (k, requestHash, nowIso, from) => takeIdempotencyKey(db, { tenantId, key: k, requestHash, nowIso, from });
const keep = (k, requestHash, stamp) =>
  keepIdempotencyReceipt(db, { tenantId, key: k, requestHash, response: RECEIPT, stamp });
const rowOf = async (k) => {
  const { data, error } = await db
    .from("idempotency_keys")
    .select("route, request_hash, response, created_at")
    .eq("tenant_id", tenantId)
    .eq("key", k)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};
/** The shape core's reply keeps (ReplyReceipt), with made-up values. */
const RECEIPT = {
  message_id: "m-1",
  status: "queued",
  cancelable_until: at(0),
  window_open: true,
  withdrawn_drafts: 0,
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `idempotency-${stamp}`, name: "idempotency" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip) return;
  // The keys go with the workspace (0004: on delete cascade).
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
});

test(
  "a claim wins once; the next claim under the key is shown the winner's hold, with no receipt yet",
  { skip },
  async () => {
    const k = key();
    const T = at(Date.now());
    assert.deepEqual(await claim(k, "h-first", T), { won: true });
    const second = await claim(k, "h-second");
    assert.equal(second.won, false);
    assert.equal(second.held.response, null, "no receipt yet: the winner is mid-send");
    assert.equal(second.held.request_hash, "h-first", "the winner's words, not the loser's");
    assert.equal(Date.parse(second.held.created_at), Date.parse(T), "the winner's stamp");
    assert.equal((await rowOf(k)).route, ROUTE);
  },
);

test("claims in the same instant: exactly one wins, and every loser is shown the same hold", { skip }, async () => {
  const k = key();
  const claims = await Promise.all([1, 2, 3, 4].map((i) => claim(k, `h-${i}`)));
  assert.equal(claims.filter((c) => c.won).length, 1, "the unique picks one");
  const holder = (await rowOf(k)).request_hash;
  for (const c of claims.filter((c) => !c.won)) {
    assert.equal(c.held.response, null);
    assert.equal(c.held.request_hash, holder);
  }
});

test(
  "the receipt completes the claim on its own stamp, in the verb's spelling of it: a claim after it is shown the receipt; a receipt on a stamp that moved is refused and changes nothing",
  { skip },
  async () => {
    const k = key();
    const T = at(Date.now() - 10_000);
    assert.deepEqual(await claim(k, "h-1", T), { won: true });
    assert.equal(await keep(k, "h-1", T), true, "kept on the claim's stamp");
    const later = await claim(k, "h-1");
    assert.equal(later.won, false);
    assert.deepEqual(later.held.response, RECEIPT);
    assert.equal(later.held.request_hash, "h-1");
    assert.equal(
      Date.parse(later.held.created_at),
      Date.parse(T),
      "the window runs from the claim, which is this send",
    );
    assert.equal(await keep(k, "h-1", T), true, "and again with the decision's id, on the same stamp");
    assert.equal(await keep(k, "h-x", at(Date.parse(T) + 1)), false, "another stamp keeps nothing");
    assert.equal((await rowOf(k)).request_hash, "h-1", "and changed nothing");
  },
);

test(
  "an abandoned hold is taken over on the stamp it was read at, by exactly one of two callers who both read it; a stamp that moved takes nothing",
  { skip },
  async () => {
    const k = key();
    const dead = at(Date.now() - 180_000);
    assert.deepEqual(await claim(k, "h-dead", dead), { won: true });
    // Both callers read this hold, in PostgREST's own spelling of the stamp.
    const seen = (await claim(k, "h-a")).held;
    const takes = await Promise.all([
      take(k, "h-a", at(Date.now()), seen.created_at),
      take(k, "h-b", at(Date.now() + 1), seen.created_at),
    ]);
    assert.equal(takes.filter(Boolean).length, 1, "one took it; the other's stamp had moved under it");
    const row = await rowOf(k);
    assert.equal(row.response, null);
    assert.ok(["h-a", "h-b"].includes(row.request_hash), "the taker's words");
    assert.ok(Date.parse(row.created_at) > Date.parse(seen.created_at), "the taker's stamp");
    assert.equal(await take(k, "h-c", at(Date.now() + 2), seen.created_at), false, "a stamp that moved takes nothing");
    // The caller that was taken over, alive after all, comes to keep its receipt: its stamp is gone.
    assert.equal(await keep(k, "h-dead", dead), false, "the caller taken over cannot complete");
    assert.equal((await rowOf(k)).response, null, "and the taker's hold is untouched");
  },
);

test(
  "a release removes the row the caller stamped, whatever it holds, and nothing else: not another stamp; the key is then free",
  { skip },
  async () => {
    const k = key();
    const T = at(Date.now());
    assert.deepEqual(await claim(k, "h-1", T), { won: true });
    await releaseIdempotencyKey(db, { tenantId, key: k, nowIso: at(Date.parse(T) + 1) });
    assert.ok(await rowOf(k), "another stamp releases nothing");
    await releaseIdempotencyKey(db, { tenantId, key: k, nowIso: T });
    assert.equal(await rowOf(k), null, "the claim is gone");
    const T2 = at(Date.now());
    assert.deepEqual(await claim(k, "h-2", T2), { won: true }, "and the key is free again");
    assert.equal(await keep(k, "h-2", T2), true);
    await releaseIdempotencyKey(db, { tenantId, key: k, nowIso: T2 });
    assert.equal(
      await rowOf(k),
      null,
      "a receipt kept before a job that then could not be scheduled goes with its stamp: a replay sends afresh",
    );
  },
);
