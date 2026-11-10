/**
 * The morning's reminder of cold email that waits, run (decision 0120): the hourly sweep's `remindColdEmailWaits` over a
 * database in memory. A workspace whose run to leads has waited is told once that morning, by its own clock, on the bell;
 * a second sweep the same morning writes nothing; a workspace where it is not morning, or whose run began waiting this
 * morning, is told nothing. The rule and the words are the contracts' (reminded-each-morning.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runRoute } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "LEAD_TO", "LEAD_FROM"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { remindColdEmailWaits } = await import(at("apps/edge/lib/campaigns/reach-out/waits-reminder.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_A = "11111111-1111-4111-8111-111111111111";
const RUN_A2 = "22222222-2222-4222-8222-222222222222";
const RUN_B = "33333333-3333-4333-8333-333333333333";
/** Tuesday 10 November 2026, 9:05 AM in New York, which is 2:05 PM in London. */
const NOW = new Date("2026-11-10T14:05:00Z");
const FAR = Date.now() + 60_000;

const said = [];
const log = {
  info: (event, fields) => said.push(["info", event, fields]),
  warn: (event, fields) => said.push(["warn", event, fields]),
  error: (event, fields) => said.push(["error", event, fields]),
};

/** A run to leads waiting for its owner's OK since `since`. */
const waiting = (id, tenantId, name, emails, since) => ({
  id,
  tenant_id: tenantId,
  playbook_id: `step-${id.slice(0, 4)}`,
  name,
  state: "pending_approval",
  run_for: since.slice(0, 10),
  recipient_count: emails,
  created_at: since,
  audience: { kind: "reach_out", root_id: `step-${id.slice(0, 4)}` },
});

function world(runs) {
  const tables = {
    tenants: [
      { id: A, name: "Brightline", timezone: "America/New_York", status: "active" },
      { id: B, name: "Northgate", timezone: "Europe/London", status: "active" },
    ],
    tenant_config: [],
    broadcasts: runs,
    notifications: [],
    jobs: [],
  };
  return { db: fakeDb(tables, {}, {}), tables };
}

test("a workspace whose cold email has waited is told once that morning, on the bell, and the row opens the run", async () => {
  const w = world([
    waiting(RUN_A, A, "Movers in Austin · 2026-11-08", 8, "2026-11-08T20:00:00.000Z"),
    waiting(RUN_A2, A, "Dentists in Tampa · 2026-11-09", 4, "2026-11-09T20:00:00.000Z"),
  ]);
  assert.equal(await remindColdEmailWaits(w.db, NOW, log, FAR), 1);
  const bell = w.tables.notifications.filter((n) => n.tenant_id === A);
  assert.equal(bell.length, 1, "one line, however many runs wait");
  assert.equal(bell[0].kind, "playbook");
  assert.equal(bell[0].title, "2 cold email runs still wait for your OK");
  assert.match(
    bell[0].body,
    /^12 emails .* have waited since Nov 8: Movers in Austin \(8\), Dentists in Tampa \(4\)\./,
  );
  assert.equal(bell[0].route, runRoute(RUN_A), "the longest-waiting run");
  assert.deepEqual([bell[0].subject_type, bell[0].subject_id], ["broadcast", RUN_A]);
  assert.ok(bell[0].source_event, "kept under the day's name");
  // The next sweep of the same morning finds it told.
  assert.equal(await remindColdEmailWaits(w.db, new Date(NOW.getTime() + 3_600_000), log, FAR), 0);
  assert.equal(w.tables.notifications.length, 1);
  // The next morning it is told again, under that day's name.
  assert.equal(await remindColdEmailWaits(w.db, new Date(NOW.getTime() + 24 * 3_600_000), log, FAR), 1);
  assert.equal(w.tables.notifications.length, 2);
  assert.notEqual(w.tables.notifications[0].source_event, w.tables.notifications[1].source_event);
});

test("nobody is told where it is not morning, where the run began waiting this morning, or where nothing waits", async () => {
  const w = world([
    // London's afternoon.
    waiting(RUN_B, B, "Plumbers in Leeds · 2026-11-08", 5, "2026-11-08T20:00:00.000Z"),
    // New York's morning, and a run made an hour ago: its own notice told of it.
    waiting(RUN_A, A, "Movers in Austin · 2026-11-10", 8, "2026-11-10T13:05:00.000Z"),
  ]);
  assert.equal(await remindColdEmailWaits(w.db, NOW, log, FAR), 0);
  assert.deepEqual(w.tables.notifications, []);
  const none = world([]);
  assert.equal(await remindColdEmailWaits(none.db, NOW, log, FAR), 0);
});

test("a customer's batch that waits is not cold email: it has its own day and its own notice", async () => {
  const run = {
    ...waiting(RUN_A, A, "Win-back · 2026-11-08", 8, "2026-11-08T20:00:00.000Z"),
    audience: { kind: "playbook", id: "pb", label: "Win-back", trigger: "quiet_30" },
  };
  const w = world([run]);
  assert.equal(await remindColdEmailWaits(w.db, NOW, log, FAR), 0);
  assert.deepEqual(w.tables.notifications, []);
});

test("a read that fails tells nobody and says so", async () => {
  said.length = 0;
  const tables = { tenants: [], broadcasts: [], notifications: [] };
  const db = fakeDb(tables, { "sequence_batches.select": { message: "the read failed" } }, {});
  assert.equal(await remindColdEmailWaits(db, NOW, log, FAR), 0);
  assert.ok(said.some(([level, event]) => level === "warn" && event === "cold_email_waits_failed"));
});
