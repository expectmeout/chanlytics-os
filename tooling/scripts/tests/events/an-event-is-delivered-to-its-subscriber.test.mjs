/**
 * One event's delivery to one subscriber (00334, decision 0032), run through the job runner's dispatch over a database
 * in memory: the handler runs the subscriber over the event as the ledger holds it and settles the delivery row; a
 * subscriber this build does not know is kept as an unknown kind; a paused subscription pauses the delivery; an event
 * the ledger no longer holds fails it; a subscriber that throws fails it with why and the job throws on. And the
 * harness every subscriber must pass: run twice on one delivery, the same rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";
import { dispatchJob } from "../../../../packages/jobs/src/handlers.ts";
// The registry as the handler reaches it: core's built package, the same module instance handlers.ts imports, so a
// subscriber swapped here is the one the dispatch runs (repo/dist-freshness.test.mjs holds dist to src).
import { SUBSCRIBERS } from "../../../../packages/core/dist/index.js";
import { EVENT_SUBSCRIBERS } from "../../../../packages/contracts/src/shared/enums.ts";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** A world with one event, its subscription and the delivery the relay wrote. */
function world({ paused = false, withEvent = true, subscriber = "audit" } = {}) {
  const tables = {
    events: withEvent ? [rows.event({ id: E, tenant_id: T, kind: "message.received", category: "message" })] : [],
    event_subscriptions: [
      { kind: "message.received", subscriber, lane: 2, paused, created_at: "2026-10-06T00:00:00Z" },
    ],
    event_deliveries: [
      {
        event_id: E,
        subscriber,
        tenant_id: T,
        kind: "message.received",
        event_at: "2026-10-06T00:00:00Z",
        state: "scheduled",
        job_id: null,
        attempts: 0,
        last_error: null,
        created_at: "2026-10-06T00:00:01Z",
        updated_at: "2026-10-06T00:00:01Z",
      },
    ],
  };
  const db = fakeDb(tables);
  const ctx = { db, wire: { whatsapp: null, sms: null }, alert: async () => {} };
  const job = {
    id: "j-1",
    tenant_id: T,
    kind: "event_deliver",
    payload: { event_id: E, subscriber, kind: "message.received", lane: "2" },
  };
  return { tables, ctx, job, delivery: () => tables.event_deliveries[0] };
}

test("the audit subscriber runs and the delivery is done, counted once", async () => {
  const w = world();
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.deepEqual([w.delivery().state, w.delivery().attempts, w.delivery().last_error], ["done", 1, null]);
});

test("a subscriber this build does not know is kept, as an unknown kind is", async () => {
  const w = world({ subscriber: "projector_from_a_newer_deploy" });
  assert.equal(await dispatchJob(w.ctx, w.job), "unknown_kind");
  assert.equal(w.delivery().state, "scheduled", "untouched: the runner that knows it will take it");
});

test("a paused subscription pauses the delivery for the re-drive; an event the ledger no longer holds fails it", async () => {
  const paused = world({ paused: true });
  assert.equal(await dispatchJob(paused.ctx, paused.job), "done");
  assert.deepEqual([paused.delivery().state, paused.delivery().attempts], ["paused", 1]);
  const gone = world({ withEvent: false });
  assert.equal(await dispatchJob(gone.ctx, gone.job), "done");
  assert.deepEqual(
    [gone.delivery().state, gone.delivery().last_error],
    ["failed", "the ledger no longer holds the event"],
  );
});

test("a subscriber that throws fails the delivery with why, and the job throws on so the ledger tries again", async () => {
  const w = world();
  const audit = SUBSCRIBERS.audit;
  SUBSCRIBERS.audit = async () => {
    throw new Error("the projection's table is away");
  };
  try {
    await assert.rejects(() => dispatchJob(w.ctx, w.job), /the projection's table is away/);
  } finally {
    SUBSCRIBERS.audit = audit;
  }
  assert.deepEqual([w.delivery().state, w.delivery().last_error], ["failed", "the projection's table is away"]);
});

test("the harness: every subscriber run twice on one delivery leaves the same rows", async () => {
  assert.deepEqual(
    Object.keys(SUBSCRIBERS).sort(),
    [...EVENT_SUBSCRIBERS].sort(),
    "each named subscriber has its verb",
  );
  for (const subscriber of EVENT_SUBSCRIBERS) {
    const w = world({ subscriber });
    assert.equal(await dispatchJob(w.ctx, w.job), "done");
    const once = JSON.stringify(w.tables);
    assert.equal(await dispatchJob(w.ctx, w.job), "done");
    const twice = JSON.parse(JSON.stringify(w.tables));
    twice.event_deliveries[0].attempts = 1; // the delivery counts its runs; everything else is the same
    assert.equal(JSON.stringify(twice), once, `${subscriber}: a second run changes nothing but the count`);
  }
});
