/**
 * The clock's reconcile over a lead's own email (decision 0094): a send with no sequence, no batch and no step. What left
 * writes the lead as a sequence's does; what the door refused for a wait, or never took, is said and ended, never planned
 * again: a member pressed Send now, and nothing leaves by surprise tomorrow. A sequence's own send still waits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { runReachOutClock } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/campaigns/reach-out/clock.ts")).href
);

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD = "cccccccc-2222-4222-8222-cccccccccccc";
const NOW = new Date("2026-11-05T15:00:00Z");
const log = { info() {}, warn() {}, error() {} };

const own = (over = {}) => ({
  id: "own-1",
  tenant_id: T,
  lead_id: LEAD,
  sequence_id: null,
  batch_id: null,
  step_id: null,
  contact_id: "contact-1",
  message_id: "message-1",
  mailbox_id: "box-1",
  state: "queued",
  reason: null,
  sent_at: null,
  attempts: 0,
  updated_at: "2026-11-05T14:00:00Z",
  ...over,
});

/** A world whose one queued send is `send`, its email answering `outcome`; every other step of the tick finds nothing. */
function worldOf(send, outcome) {
  const tables = {
    sequence_sends: [send],
    leads: [
      { id: LEAD, tenant_id: T, stage: "ready", version: 1, contacted_at: null, blanked_at: null, erased_at: null },
    ],
    events: [],
  };
  const nothing = () => [];
  const db = fakeDb(
    tables,
    {},
    {
      sequence_queued_outcomes: () => [
        { send, written_at: "2026-11-05T14:00:00Z", sent_at: null, error: null, ...outcome },
      ],
      sequence_closed_sends: nothing,
      reach_out_finishable: nothing,
      sequence_stale_sends: nothing,
      sequence_held_stale: nothing,
      reach_out_drafts_waiting: nothing,
      reach_out_given_up: nothing,
    },
  );
  return { db, tables };
}
const clockOf = (db) => runReachOutClock(db, NOW, log, NOW.getTime(), T);

test("gone: its row is sent and the lead is written, ready to nurture, as a sequence's email writes it", async () => {
  const { db, tables } = worldOf(own(), { status: "sent", sent_at: "2026-11-05T14:30:00Z" });
  const out = await clockOf(db);
  assert.equal(out.sent, 1);
  const s = tables.sequence_sends[0];
  assert.deepEqual([s.state, s.sent_at], ["sent", "2026-11-05T14:30:00Z"]);
  const l = tables.leads[0];
  assert.deepEqual([l.stage, l.contacted_at, l.last_outcome], ["nurture", "2026-11-05T14:30:00Z", "emailed"]);
  assert.equal(tables.events.filter((e) => e.kind === "lead.emailed").length, 1);
});

test("refused for a wait: said and ended, never planned again", async () => {
  const { db, tables } = worldOf(own(), { status: "canceled", error: { reason: "sending_mailbox_at_cap" } });
  const out = await clockOf(db);
  assert.equal(out.skipped, 1);
  assert.equal(out.replanned, 0);
  const s = tables.sequence_sends[0];
  assert.deepEqual([s.state, s.reason], ["skipped", "sending_mailbox_at_cap"]);
  assert.equal(tables.leads[0].stage, "ready", "nothing went: the lead does not move");
});

test("taken back with Undo: its row ends as canceled, which History leaves out", async () => {
  const { db, tables } = worldOf(own(), { status: "canceled", error: null });
  await clockOf(db);
  assert.deepEqual([tables.sequence_sends[0].state, tables.sequence_sends[0].reason], ["skipped", "canceled"]);
});

test("the provider never took it: failed, not planned again", async () => {
  const { db, tables } = worldOf(own(), { status: "failed", error: { http_status: 429 } });
  const out = await clockOf(db);
  assert.equal(out.failed, 1);
  assert.equal(tables.sequence_sends[0].state, "failed");
  assert.equal(tables.leads[0].stage, "ready");
});
