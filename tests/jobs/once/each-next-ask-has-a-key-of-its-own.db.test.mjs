/**
 * Every handler's own next ask (_next-asks.mjs), on a real database: the ledger's own trigger writes each key
 * (jobs_take_their_kind, job_dedupe_key_of) and its own index judges it (jobs_dedupe_live). Written beside the job that
 * asks, fired and holding its key, the ask is taken; the same ask twice is still one. The node suite beside this one
 * holds the same pairs over the database in memory, which cannot say what the real key function does with a payload.
 *
 * And the words the runner reads when an ask is refused: the database names the key it refused, which is how
 * packages/jobs schedule.ts tells a job refused by its own key from work already on the ledger.
 *
 * Never production: it makes a workspace and jobs, and removes them.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { NEXT_ASKS } from "./_next-asks.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace and jobs"
      : false;

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let T;

/** A job written in the state given, due well ahead so no runner claims it: what the ledger said of it. */
async function write(kind, payload, state = "scheduled") {
  const { data, error } = await db
    .from("jobs")
    .insert({ tenant_id: T, kind, due_at: new Date(Date.now() + 3_600_000).toISOString(), payload, state })
    .select("id, dedupe_key")
    .single();
  return {
    id: data?.id ?? null,
    key: data?.dedupe_key ?? null,
    refused: error?.code ?? null,
    details: error?.details ?? null,
  };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const made = await db
    .from("tenants")
    .insert({ name: `Next asks ${RUN}`, slug: `next-asks-${RUN}` })
    .select("id")
    .single();
  assert.equal(made.error, null, made.error?.message);
  T = made.data.id;
});

after(async () => {
  if (skip || !T) return;
  await db.from("jobs").delete().eq("tenant_id", T);
  await db.from("events").delete().eq("tenant_id", T);
  await db.from("tenants").delete().eq("id", T);
});

/** Each pair on subjects of its own, so no pair meets another's rows: every id in a payload carries the pair's number. */
const own = (payload, n) =>
  Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, /_id$|^handle$/.test(k) ? `${v}-${RUN}-${n}` : v]));

for (const [n, ask] of NEXT_ASKS.entries()) {
  test(`${ask.kind}: ${ask.what}`, { skip }, async () => {
    const running = await write(ask.kind, own(ask.running, n), "fired");
    assert.equal(running.refused, null);
    assert.ok(running.key, "the kind is held once per subject: the running job has a key");
    const next = await write(ask.kind, own(ask.next, n));
    assert.equal(next.refused, null, "the ledger takes the ask while the job that wrote it still runs");
    assert.notEqual(next.key, running.key);
    const twice = await write(ask.kind, own(ask.next, n));
    assert.equal(twice.refused, "23505", "the same ask twice is still one");
    assert.match(
      twice.details ?? "",
      new RegExp(`\\(dedupe_key\\)=\\(${next.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\) already exists`),
      "and the database names the key it refused, which the runner reads",
    );
  });
}
