/**
 * scheduleJobOnce writes the row's dedupe key beside its payload (jobs.dedupe_key, 00333, decision 0033 step 2): the
 * three kinds the ledger held once per subject by an index of their own carry the same subject as their key, a kind
 * with no rule carries none, a second schedule of a live key is already_scheduled, and a database the migration has
 * not reached (no column: PGRST204) takes the row without the key, as before. Run over the database in memory, whose
 * unique keys are the migrations' own (jobs_dedupe_live, _unique-keys.generated.json).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { scheduleJobOnce, scheduleJob } from "../../../../packages/jobs/src/schedule.ts";

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
  await scheduleJobOnce(db, { tenantId: T, kind: "inbound_answer", dueAt: at, payload: { message_id: "msg2" } });
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

test("a database without the column takes the row without the key, so the edge and 00333 land in either order", async () => {
  const sent = [];
  let first = true;
  const older = {
    from: () => ({
      insert: async (row) => {
        sent.push(row);
        if (first) {
          first = false;
          return { error: { code: "PGRST204", message: "Could not find the 'dedupe_key' column of 'jobs'" } };
        }
        return { error: null };
      },
    }),
  };
  const out = await scheduleJobOnce(older, {
    tenantId: T,
    kind: "email_ingest",
    dueAt: at,
    payload: { mailbox_id: "m1", received_id: "r1" },
  });
  assert.equal(out, "scheduled");
  assert.deepEqual(
    sent.map((r) => "dedupe_key" in r),
    [true, false],
    "the key first, then the row as an older database knows it",
  );
});
