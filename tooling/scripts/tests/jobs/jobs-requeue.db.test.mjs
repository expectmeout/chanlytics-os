/**
 * The ledger's dead letters and kept rows, on a real Postgres: a failed job run again (packages/jobs requeueFailedJob),
 * and a job whose kind the runner does not know kept with its claim given back (deferJob, giveBackClaim). The unit
 * tests (jobs-ledger, job-requeue) run the rules over doubles; this proves the database accepts what they write: a
 * failed row is final (jobs_guard), so a requeue is a fresh row; a claim's count may go back down on a row still
 * fired; and work the ledger holds once per subject answers with the database's own 23505.
 *
 * Every row here is made for a workspace of its own and is never due to a runner (a far due time), so no other suite's
 * claim can take it. Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { deferJob } from "../../../../packages/jobs/src/ledger.ts";
import { requeueFailedJob } from "../../../../packages/jobs/src/schedule.ts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes to the jobs ledger"
      : false;

let db;
let T;
const far = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `requeue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "requeue" })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  T = data.id;
});

after(async () => {
  if (skip) return;
  if (T) {
    await db.from("jobs").delete().eq("tenant_id", T);
    await db.from("tenants").delete().eq("id", T);
  }
});

/** A job of this workspace, taken to the state given the only way the ledger allows: scheduled, fired, then failed. */
async function job(kind, payload, end = "failed") {
  const made = await db.from("jobs").insert({ tenant_id: T, kind, due_at: far(), payload }).select("id").single();
  assert.equal(made.error, null, made.error?.message);
  const id = made.data.id;
  if (end === "scheduled") return id;
  const fired = await db
    .from("jobs")
    .update({ state: "fired", attempts: 1, fired_at: new Date().toISOString(), lease_until: far() })
    .eq("id", id);
  assert.equal(fired.error, null, fired.error?.message);
  if (end === "fired") return id;
  const done = await db.from("jobs").update({ state: end, last_error: "the key was restricted" }).eq("id", id);
  assert.equal(done.error, null, done.error?.message);
  return id;
}
const row = async (id) => (await db.from("jobs").select("*").eq("id", id).single()).data;
const rowsOf = async (kind) => (await db.from("jobs").select("*").eq("tenant_id", T).eq("kind", kind)).data;

test("a failed row is final; run again it is a fresh row of the same kind and payload, and the failed one stays", async (t) => {
  if (skip) return t.skip(skip);
  const id = await job("email_ingest", { email_id: "e-requeue-1" });
  const back = await db.from("jobs").update({ state: "scheduled" }).eq("id", id);
  assert.match(back.error?.message ?? "", /terminal/, "failed is final: the row itself is never moved back");

  const recorded = [];
  const out = await requeueFailedJob(db, T, id, async (kind) => void recorded.push(kind));
  assert.deepEqual(out, { outcome: "requeued", kind: "email_ingest" });
  assert.deepEqual(recorded, ["email_ingest"]);
  const rows = await rowsOf("email_ingest");
  assert.equal(rows.length, 2);
  const again = rows.find((r) => r.id !== id);
  assert.equal(again.state, "scheduled");
  assert.deepEqual(again.payload, { email_id: "e-requeue-1" });
  assert.equal((await row(id)).state, "failed");
  assert.equal((await row(id)).last_error, "the key was restricted", "the record of what went wrong is kept");
});

test("work the ledger holds once per subject: the database's own refusal is 'already on the ledger', and no second row", async (t) => {
  if (skip) return t.skip(skip);
  // jobs_reply_read_once (00222): one live reading per message and stage.
  const failed = await job("reply_read", { message_id: "m-requeue-1", stage: "first" });
  const live = await job("reply_read", { message_id: "m-requeue-1", stage: "first" }, "scheduled");
  assert.ok(live, "a failed row does not hold the subject; a live one made after it does");
  const out = await requeueFailedJob(db, T, failed, async () => {});
  assert.deepEqual(out, { outcome: "already_scheduled" });
  assert.equal((await rowsOf("reply_read")).length, 2, "the failed row and the live one; nothing new");
});

test("work that speaks to a person is refused before anything is recorded, and a job that is not failed is refused with its state", async (t) => {
  if (skip) return t.skip(skip);
  const send = await job("outbound_send", { message_id: "m-requeue-2" });
  const waiting = await job("email_ingest", { email_id: "e-requeue-2" }, "scheduled");
  let recorded = 0;
  const count = async () => void (recorded += 1);
  assert.deepEqual(await requeueFailedJob(db, T, send, count), {
    outcome: "speaks_to_a_person",
    kind: "outbound_send",
  });
  assert.deepEqual(await requeueFailedJob(db, T, waiting, count), { outcome: "not_failed", state: "scheduled" });
  assert.deepEqual(await requeueFailedJob(db, "00000000-0000-4000-8000-000000000000", send, count), {
    outcome: "not_found",
  });
  assert.equal(recorded, 0);
});

test("a kept row whose kind is unknown gives its claim back on a row still fired, and only on the claim that holds it", async (t) => {
  if (skip) return t.skip(skip);
  const id = await job("push_receipts", { ids: ["t-1"] }, "fired");
  const until = new Date(Date.now() + 5 * 60_000).toISOString();
  assert.equal(await deferJob(db, { id, attempts: 2 }, until, "unknown job kind x", true), false, "not the holder");
  assert.equal((await row(id)).attempts, 1);
  assert.equal(await deferJob(db, { id, attempts: 1 }, until, "unknown job kind x", true), true);
  const kept = await row(id);
  assert.deepEqual(
    [kept.state, kept.attempts, Date.parse(kept.lease_until), kept.last_error],
    ["fired", 0, Date.parse(until), "unknown job kind x"],
    "still fired, its lease put off, nothing counted as run",
  );
  // A job that threw keeps its claim: it ran.
  const threw = await job("push_receipts", { ids: ["t-2"] }, "fired");
  assert.equal(await deferJob(db, { id: threw, attempts: 1 }, until, "boom"), true);
  assert.equal((await row(threw)).attempts, 1);
});
