/**
 * A job runs as the request that scheduled it (packages/jobs schedule.ts, handlers.ts dispatchJob).
 *
 * A customer's click, a webhook's delivery and the send it queued used to be three unrelated stretches of the log: the
 * request that scheduled a job ended long before the tick ran it. Now `scheduleJob` writes the request's name into the
 * job's payload (`request_id`), and the runner runs the job under it, so the lines the job writes, the events it
 * records and the jobs it schedules in turn carry the name of the request that started the chain. A job the database
 * scheduled (a clock) has none and runs as itself, named by its row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { requestId, withRequestId } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { dispatchJob } from "../../../../packages/jobs/src/handlers.ts";
import { scheduleJob, scheduleJobOnce } from "../../../../packages/jobs/src/schedule.ts";

const T = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "iad1::origin-0123456789";
const DUE = new Date("2026-09-29T16:20:00.000Z");

test("a job scheduled while a request is served carries its name in the payload, and one that names a request already keeps it", async () => {
  const tables = { jobs: [] };
  const db = fakeDb(tables);
  await scheduleJob(db, { tenantId: T, kind: "push_send", dueAt: DUE, payload: { notification_id: "n1" } });
  assert.deepEqual(tables.jobs[0].payload, { notification_id: "n1" }, "outside a request there is no name to write");
  await withRequestId(ORIGIN, async () => {
    await scheduleJob(db, { tenantId: T, kind: "push_send", dueAt: DUE, payload: { notification_id: "n2" } });
    await scheduleJobOnce(db, { tenantId: T, kind: "push_send", dueAt: DUE, payload: { notification_id: "n3" } });
    // A job a job schedules (a broadcast's next batch) is scheduled while the first runs as its request: same name.
    await withRequestId("iad1::later-0123456789", () =>
      scheduleJob(db, {
        tenantId: T,
        kind: "push_send",
        dueAt: DUE,
        payload: { notification_id: "n4", request_id: ORIGIN },
      }),
    );
    // Not an object: nothing to stamp, and nothing broken by the attempt.
    await scheduleJob(db, { tenantId: T, kind: "push_send", dueAt: DUE, payload: null });
  });
  assert.deepEqual(
    tables.jobs.map((j) => j.payload),
    [
      { notification_id: "n1" },
      { notification_id: "n2", request_id: ORIGIN },
      { notification_id: "n3", request_id: ORIGIN },
      { notification_id: "n4", request_id: ORIGIN },
      null,
    ],
  );
});

/** push_send over a phone that is asked, and the request the code answering it ran as. */
async function ranAs(job) {
  const seen = [];
  const db = fakeDb({
    notifications: [
      {
        id: "n1",
        tenant_id: T,
        kind: "handoff",
        title: "Handoff needed",
        body: "Maria asked for a person.",
        route: "inbox/th-1",
        recipient_user_id: null,
        created_at: "2026-09-26T10:00:00Z",
      },
    ],
    memberships: [{ user_id: "u1", tenant_id: T, role: "owner" }],
    push_devices: [{ id: "d1", user_id: "u1", token: "tok-u1" }],
  });
  const outcome = await dispatchJob(
    {
      db,
      wire: { whatsapp: null, sms: null },
      alert: async () => {},
      schedule: async () => {},
      deadline: Date.now() + 45_000,
      push: {
        send: async (messages) => {
          seen.push(requestId());
          return messages.map((m) => ({ to: m.to, status: "ok", id: `ticket-${m.to}` }));
        },
        receipts: async () => ({}),
      },
    },
    job,
  );
  return { outcome, seen };
}

test("the runner runs a job as the request that scheduled it, and a job with no name as itself; the name ends with the job", async () => {
  const id = "3f8e6c2a-5d41-4b7a-9c0e-2a1b3c4d5e6f";
  const named = await ranAs({
    id,
    tenant_id: T,
    kind: "push_send",
    payload: { notification_id: "n1", request_id: ORIGIN },
  });
  assert.deepEqual([named.outcome, named.seen], ["done", [ORIGIN]], "the click's name, not this heartbeat's");
  const clock = await ranAs({ id, tenant_id: T, kind: "push_send", payload: { notification_id: "n1" } });
  assert.deepEqual(clock.seen, [id], "a job the database scheduled is named by its row");
  const forged = await ranAs({
    id,
    tenant_id: T,
    kind: "push_send",
    payload: { notification_id: "n1", request_id: "not a name!" },
  });
  assert.deepEqual(forged.seen, [id], "a payload's word that is no request's name is not taken");
  assert.equal(requestId(), null, "and nothing outlives the job: the next one in this instance starts clean");
  const unknown = await dispatchJob({}, { id, tenant_id: T, kind: "no_such_kind", payload: {} });
  assert.equal(unknown, "unknown_kind", "a kind this build does not know runs nothing, named or not");
});
