/**
 * A job's once-only key (jobs.dedupe_key, 00333, decision 0033 step 2) is written by the database from its kind's
 * job_kinds row (jobs_take_their_kind, 00526), whoever inserts it: each once-only kind carries its subject as its key, a
 * kind with no rule carries none, a second schedule of a live key is already_scheduled, and the writer names neither key
 * nor lane. Run over the database in memory, which fills the row as the trigger does and whose unique keys are the
 * migrations' own (jobs_dedupe_live, jobs_dedupe_kept, _unique-keys.generated.json).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { scheduleJobOnce, scheduleJob } from "../../packages/jobs/src/runner/schedule.ts";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const at = new Date("2026-10-06T12:00:00Z");

test("each once-only kind carries its subject as its key; a kind with no rule carries none", async () => {
  const tables = { jobs: [] };
  const db = fakeDb(tables);
  await scheduleJobOnce(db, {
    tenantId: T,
    kind: "email_ingest",
    dueAt: at,
    payload: { mailbox_id: "m1", received_id: "r1" },
  });
  await scheduleJobOnce(db, { tenantId: T, kind: "lead_collect", dueAt: at, payload: { run_id: "run1", seq: "p40" } });
  await scheduleJobOnce(db, { tenantId: T, kind: "reply_read", dueAt: at, payload: { message_id: "msg1" } });
  await scheduleJobOnce(db, {
    tenantId: T,
    kind: "reply_read",
    dueAt: at,
    payload: { message_id: "msg1", stage: "reread-1" },
  });
  await scheduleJobOnce(db, {
    tenantId: T,
    kind: "inbound_answer",
    dueAt: at,
    payload: { message_id: "msg2", conversation_id: "c2" },
  });
  await scheduleJob(db, { tenantId: T, kind: "push_receipts", dueAt: at, payload: { tickets: [] } });
  assert.deepEqual(
    tables.jobs.map((j) => [j.kind, j.dedupe_key ?? null]),
    [
      ["email_ingest", "email_ingest:m1:r1"],
      ["lead_collect", "lead_collect:run1:p40"],
      ["reply_read", "reply_read:msg1:read"],
      ["reply_read", "reply_read:msg1:reread-1"],
      ["inbound_answer", "inbound_answer:msg2"],
      ["push_receipts", null],
    ],
  );
});

test("a second schedule of a live key is already_scheduled; a key whose row failed is scheduled again", async () => {
  const tables = { jobs: [] };
  const db = fakeDb(tables);
  const p = { tenantId: T, kind: "email_ingest", dueAt: at, payload: { mailbox_id: "m1", received_id: "r1" } };
  assert.equal(await scheduleJobOnce(db, p), "scheduled");
  assert.equal(await scheduleJobOnce(db, p), "already_scheduled");
  tables.jobs[0].state = "failed";
  assert.equal(await scheduleJobOnce(db, p), "scheduled", "00135's rule holds for the one key");
  assert.equal(tables.jobs.length, 2);
});

test("a booking notice is read once per delivery in each workspace: one delivery to two workspaces' mailboxes is read in both, and run again in one finds its read on the ledger", async () => {
  // The key is unique across every workspace (jobs_dedupe_live), and one received email is an intake for each mailbox it
  // names (edge resend-event.ts). Keyed by the delivery alone, the second workspace's read was already_scheduled, and its
  // booking was never read into its appointments.
  const U = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const tables = { jobs: [] };
  const db = fakeDb(tables);
  const read = (tenantId, mailbox) =>
    scheduleJobOnce(db, {
      tenantId,
      kind: "booking_read",
      dueAt: at,
      payload: { received_id: "r1", mailbox_id: mailbox, tool: "square" },
    });
  assert.equal(await read(T, "m1"), "scheduled");
  assert.equal(await read(U, "m2"), "scheduled", "the other workspace's notice is read too");
  assert.equal(await read(T, "m1"), "already_scheduled", "the intake run again, or the webhook replayed");
  assert.equal(
    await read(T, "m3"),
    "already_scheduled",
    "a second mailbox of the same workspace on the same delivery: one read, into the one appointments record",
  );
  assert.deepEqual(
    tables.jobs.map((j) => [j.tenant_id, j.dedupe_key]),
    [
      [T, `booking_read:${T}:r1`],
      [U, `booking_read:${U}:r1`],
    ],
  );
});

test("the writer names no key and no lane: the database writes both from the kind's row, whoever the writer is (00526)", async () => {
  const sent = [];
  const recorder = {
    from: () => ({
      insert: async (row) => {
        sent.push(row);
        return { error: null };
      },
    }),
  };
  await scheduleJobOnce(recorder, {
    tenantId: T,
    kind: "email_ingest",
    dueAt: at,
    payload: { mailbox_id: "m1", received_id: "r1" },
  });
  assert.deepEqual(
    sent.map((r) => ["dedupe_key" in r, "lane" in r]),
    [[false, false]],
    "one spelling of the rule: jobs_take_their_kind's, which a SQL function's insert meets too",
  );
});

test("a payload is ids, not people: what its kind never carries is left on its row, and an id it cannot run without is refused at the write", async () => {
  const tables = { jobs: [] };
  const db = fakeDb(tables);
  await scheduleJob(db, {
    tenantId: T,
    kind: "outbound_send",
    dueAt: at,
    payload: { message_id: "m1", conversation_id: "c1", to_phone: "+15550100142", body: "See you at 3" },
  });
  assert.equal(
    "body" in tables.jobs[0].payload,
    false,
    "a reply's words stay on its message, where an erasure finds them",
  );
  assert.equal(tables.jobs[0].payload.message_id, "m1");
  await assert.rejects(
    scheduleJob(db, { tenantId: T, kind: "outbound_send", dueAt: at, payload: { conversation_id: "c1" } }),
    /^Error: schedule_job: outbound_send: the payload names no message_id$/,
    "a send with no message to send is a writer's slip, said where it was made",
  );
  await assert.rejects(
    scheduleJobOnce(db, { tenantId: T, kind: "erasure_finish", dueAt: at, payload: {} }),
    /^Error: schedule_job: erasure_finish: the payload names no contact_id$/,
  );
  assert.equal(tables.jobs.length, 1);
});

test("a lead round's start and its checks are keyed by the writer that asks (00506), and a door's own start is never refused for one waiting", async () => {
  const tables = { jobs: [] };
  const db = fakeDb(tables);
  const R = "11111111-1111-4111-8111-111111111111";
  const start = { tenantId: T, kind: "lead_round_start", dueAt: at, payload: { round_id: R, carry_on: true } };
  assert.equal(await scheduleJobOnce(db, start), "scheduled");
  assert.equal(await scheduleJobOnce(db, start), "already_scheduled", "the sweep carrying the round on starts it once");
  const check = (payload) => scheduleJobOnce(db, { tenantId: T, kind: "lead_check", dueAt: at, payload });
  assert.equal(await check({ round_id: R, batch: 0, carry_on: true }), "scheduled");
  assert.equal(
    await check({ round_id: R, batch: 0 }),
    "already_scheduled",
    "each batch of the round's own checks once",
  );
  assert.equal(await check({ round_id: R, batch: 0, again: "nonce-1" }), "scheduled", "a Check again is its own");
  // A door's insert names no key (lead_round_answer, 00506), and the trigger writes none for these two kinds: it is
  // written beside the sweep's waiting start, as main had it, never refused for it.
  const door = await db.from("jobs").insert({
    tenant_id: T,
    kind: "lead_round_start",
    due_at: at.toISOString(),
    payload: { round_id: R, resume: true },
  });
  assert.equal(door.error, null, door.error?.message);
  assert.deepEqual(
    tables.jobs.map((j) => [j.kind, j.dedupe_key ?? null]),
    [
      ["lead_round_start", `lead_round_start:${R}`],
      ["lead_check", `lead_check:${R}:round:0`],
      ["lead_check", `lead_check:${R}:nonce-1:0`],
      ["lead_round_start", null],
    ],
  );
});
