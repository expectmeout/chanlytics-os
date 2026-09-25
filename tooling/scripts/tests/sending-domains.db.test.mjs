/**
 * sending_domains on the database (00175): every state the judge can write is one the table's constraints take,
 * a state they refuse is refused, the host is one workspace's across the platform, and a workspace's sixth domain is
 * refused by the table itself, under the same number contracts says (SENDING_DOMAINS_MAX). The fake database the
 * door tests run over enforces none of this; this file is where it is proved.
 *
 * Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { judgeDomain, SENDING_DOMAINS_MAX } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

let db;
let A;
let B;
const stamp = Date.now().toString(36);
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const add = (tenant, host) =>
  db
    .from("sending_domains")
    .insert({ tenant_id: tenant, host, from_local: "sam", from_name: "Sam", state: "records" })
    .select("*")
    .single();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `domains-a-${stamp}`, name: "Domains A" })
      .select("id")
      .single(),
  ).id;
  B = ok(
    await db
      .from("tenants")
      .insert({ slug: `domains-b-${stamp}`, name: "Domains B" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) await db.from("tenants").delete().eq("id", t);
});

test("every state the judge writes is one the table takes, walked on a real row", { skip }, async () => {
  let row = ok(await add(A, `walk-${stamp}.example`));
  const facts = [
    { provider: "pending", dmarc: "missing" }, // verifying
    { provider: "verified", dmarc: "found" }, // verified
    { provider: "temporary_failure", dmarc: "found" }, // once: stored, waited on
    { provider: "temporary_failure", dmarc: "found" }, // twice: held, verification
    { provider: "verified", dmarc: "found" }, // released
    { provider: "not_found", dmarc: "found" }, // the account answers nothing once: stored, waited on
    { provider: "not_found", dmarc: "found" }, // twice: held, provider (00178)
    { provider: "verified", dmarc: "found" }, // it has it again: released
    { provider: "verified", dmarc: "missing" }, // missing once: stored
    { provider: "verified", dmarc: "missing" }, // missing twice: held, dmarc
    { provider: "verified", dmarc: "found" }, // released
  ];
  const seen = [];
  for (const f of facts) {
    const j = judgeDomain(row, f, new Date().toISOString());
    const { change, ...patch } = j;
    // What the edge writes beside the judgement: the provider's word, which the next read's two-read rule reads.
    row = ok(
      await db
        .from("sending_domains")
        .update({ ...patch, provider_status: f.provider })
        .eq("id", row.id)
        .select("*")
        .single(),
    );
    seen.push(`${row.state}${row.held_why ? `:${row.held_why}` : ""}${change ? ` (${change})` : ""}`);
  }
  assert.deepEqual(seen, [
    "verifying",
    "verified (verified)",
    "verified",
    "held:verification (held)",
    "verified (released)",
    "verified",
    "held:provider (held)",
    "verified (released)",
    "verified",
    "held:dmarc (held)",
    "verified (released)",
  ]);
});

test(
  "a state the table refuses is refused: held without its reason or its time, a reason off a held row, verified without its dates",
  { skip },
  async () => {
    const row = ok(await add(A, `refuse-${stamp}.example`));
    const now = new Date().toISOString();
    for (const patch of [
      { state: "held", held_why: "dmarc", verified_at: now, clean_since: now },
      { state: "held", held_at: now, verified_at: now, clean_since: now },
      { state: "records", held_why: "dmarc" },
      { state: "records", held_at: now },
      { state: "verified" },
      { state: "verified", verified_at: now },
      { state: "sending" },
      { dmarc: "maybe" },
      { held_why: "tired", state: "held", held_at: now, verified_at: now, clean_since: now },
    ]) {
      const r = await db.from("sending_domains").update(patch).eq("id", row.id).select("id");
      assert.equal(r.error?.code, "23514", `${JSON.stringify(patch)}: ${r.error?.message}`);
    }
  },
);

test("a host is one workspace's across the platform", { skip }, async () => {
  const host = `unique-${stamp}.example`;
  ok(await add(A, host));
  const again = await add(B, host);
  assert.equal(again.error?.code, "23505");
});

test("a sixth domain is refused by the table itself, under contracts' own number", { skip }, async () => {
  assert.equal(SENDING_DOMAINS_MAX, 5);
  // B holds none (its insert above was refused); five make the limit, and the sixth is the table's to refuse.
  for (let i = 1; i <= SENDING_DOMAINS_MAX; i++) ok(await add(B, `limit-${i}-${stamp}.example`));
  const sixth = await add(B, `limit-6-${stamp}.example`);
  assert.equal(sixth.error?.code, "P0001");
  assert.equal(sixth.error?.hint, "too_many");
  const { count } = await db.from("sending_domains").select("id", { count: "exact", head: true }).eq("tenant_id", B);
  assert.equal(count, SENDING_DOMAINS_MAX);
  // Another workspace's limit is its own.
  ok(await add(A, `limit-other-${stamp}.example`));
});
