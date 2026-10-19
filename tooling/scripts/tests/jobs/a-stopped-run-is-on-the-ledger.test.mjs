/**
 * A run that stops is on the ledger, as a run that finishes is (the 4 Oct campaigns wiring review, P2 5).
 *
 * A finished run wrote `broadcast.sent` with its tally; a run marked `failed` wrote nothing, so the Activity log, Ask and
 * anything reading the ledger saw runs finish and never stop. Every place a run is failed now writes `broadcast.stopped`
 * with its failure code and how many it reached first: the send job's stops (core's, through the jobs port `fail`), the
 * ledger giving a dying run up (jobs settle.ts), and the watchdog's stranded run (packages/db failStrandedRun). Each runs
 * here over a database in memory, and the Activity log says the row in the words the run's own page has.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { activityWords } from "../../../../packages/contracts/src/workspace/activity.ts";
import { broadcastSend } from "../../../../packages/jobs/src/broadcast-send.ts";
import { settleJob } from "../../../../packages/jobs/src/settle.ts";
import { MAX_RESUMES } from "../../../../packages/jobs/src/ledger.ts";
import { failStrandedRun } from "../../../../packages/db/src/repositories/campaigns/stranded-runs.ts";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const run = (over = {}) => ({
  id: "b1",
  tenant_id: T,
  name: "Spring offer",
  state: "scheduled",
  template_name: "month_offer",
  template_language: "en_US",
  params: [],
  recipient_count: 3,
  playbook_id: null,
  audience: { kind: "everyone", id: null, label: "Everyone" },
  failure: null,
  finished_at: null,
  ...over,
});
const recipient = (contact_id, state) => ({ tenant_id: T, broadcast_id: "b1", contact_id, state, reason: null });
const stoppedOf = (tables) =>
  tables.events
    .filter((e) => e.kind === "broadcast.stopped")
    .map((e) => [e.tenant_id, e.subject_type, e.subject_id, e.category, e.data]);

test("a run the send job stops (here a paused workspace) is on the ledger with its failure and how many it reached", async () => {
  const tables = {
    tenants: [{ id: T, status: "paused" }],
    broadcasts: [run({ state: "sending" })],
    broadcast_recipients: [recipient("k1", "sent"), recipient("k2", "sent"), recipient("k3", "queued")],
    events: [],
  };
  const db = fakeDb(tables);
  const alerts = [];
  await broadcastSend(
    { db, wire: { whatsapp: null, sms: null }, alert: async (n) => alerts.push(n), deadline: Date.now() + 60_000 },
    { id: "j1", tenant_id: T, kind: "broadcast_send", payload: { broadcast_id: "b1" } },
  );
  assert.deepEqual([tables.broadcasts[0].state, tables.broadcasts[0].failure], ["failed", "paused"]);
  assert.deepEqual(stoppedOf(tables), [[T, "broadcast", "b1", "message", { failure: "paused", sent: 2 }]]);
  assert.equal(alerts.length, 1, "and the owner is told, as before");
});

test("a ledger that cannot see its recipients still writes the stop, with no count rather than a wrong one", async () => {
  const tables = { tenants: [{ id: T, status: "paused" }], broadcasts: [run()], broadcast_recipients: [], events: [] };
  const db = fakeDb(tables, { "sequence_sends.select": { message: "connection reset" } });
  await broadcastSend(
    { db, wire: { whatsapp: null, sms: null }, alert: async () => {}, deadline: Date.now() + 60_000 },
    { id: "j1", tenant_id: T, kind: "broadcast_send", payload: { broadcast_id: "b1" } },
  );
  assert.deepEqual(
    stoppedOf(tables).map((r) => r[4]),
    [{ failure: "paused", sent: null }],
  );
});

test("a run the ledger gives up on, and a stranded run the watchdog finds, are on the ledger too", async () => {
  const tables = {
    broadcasts: [run({ state: "sending" })],
    broadcast_recipients: [recipient("k1", "sent"), recipient("k2", "queued")],
    jobs: [],
    events: [],
  };
  const db = fakeDb(tables);
  await settleJob(
    db,
    {
      id: "j-dead",
      tenant_id: T,
      kind: "broadcast_send",
      payload: { broadcast_id: "b1", resumes: MAX_RESUMES },
      attempts: 1,
      error: "the run died",
    },
    false,
  );
  assert.equal(tables.broadcasts[0].failure, "run_interrupted");
  assert.deepEqual(
    stoppedOf(tables).map((r) => r[4]),
    [{ failure: "run_interrupted", sent: 1 }],
  );

  const stranded = { broadcasts: [run({ id: "b2" })], events: [] };
  const sdb = fakeDb(stranded);
  assert.equal(await failStrandedRun(sdb, { tenantId: T, id: "b2" }), true);
  assert.equal(await failStrandedRun(sdb, { tenantId: T, id: "b2" }), false, "once");
  assert.deepEqual(
    stoppedOf(stranded).map((r) => [r[2], r[4]]),
    [["b2", { failure: "run_interrupted", sent: 0 }]],
    "one row, for the one call that moved it",
  );
});

test("the Activity log says a stopped run in the words its page has, and how far it got", () => {
  assert.equal(
    activityWords("broadcast.stopped", { failure: "paused", sent: 2 }),
    "A run stopped · the workspace was paused · 2 got it first",
  );
  assert.equal(
    activityWords("broadcast.stopped", { failure: "throttled:email", sent: 0 }),
    `A run stopped · ${activityWords("broadcast.stopped", { failure: "throttled:email" }).split(" · ")[1]} · nobody got it`,
  );
  assert.match(activityWords("broadcast.stopped", { failure: "throttled:email" }), /the mail provider/);
  assert.equal(activityWords("broadcast.stopped", { failure: "run_interrupted", sent: null }).split(" · ").length, 2);
});
