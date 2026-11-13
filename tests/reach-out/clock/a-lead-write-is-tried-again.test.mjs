/**
 * 13 Nov 2026. A lead's record after its email went (apps/edge/lib/campaigns/reach-out/clock.ts, reconcile). The clock
 * moves a send to sent, then writes its lead: ready becomes nurture, first contacted, last outcome emailed, and the
 * lead.emailed event. That second write failing was logged and nothing more, and the send had left the queued list, so
 * no later tick met it again: the email had gone and the lead still read as never written to.
 *
 * The real clock runs, over a database in memory whose leads table refuses a read.
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
const SENT_AT = "2026-11-05T14:30:00Z";

/** One queued send whose email left; `refusals` is how many reads of the leads table fail before one answers. */
function world(refusals) {
  const tables = {
    sequence_sends: [
      {
        id: "send-1",
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
      },
    ],
    leads: [
      { id: LEAD, tenant_id: T, stage: "ready", version: 1, contacted_at: null, blanked_at: null, erased_at: null },
    ],
    events: [],
    jobs: [],
  };
  const faults = {};
  let left = refusals;
  const lines = [];
  const nothing = () => [];
  const db = fakeDb(tables, faults, {
    // The queued sends with their emails: this one's has left. Each read of it is the clock about to write its lead, so
    // the leads table refuses from here for as many reads as the case says.
    sequence_queued_outcomes: () => {
      if (left > 0) faults["leads.select"] = { message: "connection reset" };
      return tables.sequence_sends
        .filter((s) => s.state === "queued")
        .map((send) => ({ send, status: "sent", written_at: "2026-11-05T14:00:00Z", sent_at: SENT_AT, error: null }));
    },
    sequence_closed_sends: nothing,
    reach_out_finishable: nothing,
    sequence_stale_sends: nothing,
    sequence_held_stale: nothing,
    reach_out_drafts_waiting: nothing,
    reach_out_given_up: nothing,
  });
  const log = {
    info() {},
    warn() {},
    error: (event, fields) => lines.push([event, fields.send_id]),
  };
  /** The pause between two tries, stood in for: it is where the database comes back. */
  const rest = async () => {
    left -= 1;
    if (left <= 0) delete faults["leads.select"];
  };
  // The tick began now: a clock past its yield tries nothing twice, and this one has its whole minute.
  return { tables, lines, tick: () => runReachOutClock(db, NOW, log, Date.now(), T, { rest }) };
}

test("REGRESSION: a lead whose write failed once after its email went is written on the next try, and nothing is sent again", async () => {
  const w = world(1);
  const out = await w.tick();
  assert.equal(out.sent, 1, "the send is sent, as it was");
  assert.deepEqual([w.tables.sequence_sends[0].state, w.tables.sequence_sends[0].sent_at], ["sent", SENT_AT]);
  const lead = w.tables.leads[0];
  assert.deepEqual(
    [lead.stage, lead.contacted_at, lead.last_outcome],
    ["nurture", SENT_AT, "emailed"],
    "the lead reads as written to: its write was tried again",
  );
  assert.equal(w.tables.events.filter((e) => e.kind === "lead.emailed").length, 1, "and its event is kept, once");
  assert.deepEqual(w.lines, [], "nothing is left to say");
  assert.deepEqual(w.tables.jobs, [], "no email is sent again");
  assert.equal(out.replanned, 0);
});

test("a lead write that keeps failing never holds its send: the send stays sent, and the lead is said in the log", async () => {
  const w = world(Number.POSITIVE_INFINITY);
  const out = await w.tick();
  assert.equal(out.sent, 1);
  assert.equal(w.tables.sequence_sends[0].state, "sent", "the send is sent whatever the lead's bookkeeping does");
  assert.equal(w.tables.leads[0].stage, "ready");
  assert.deepEqual(w.lines, [["reach_out_lead_unwritten", "send-1"]], "said once, after its tries");
  assert.equal(w.tables.events.length, 0);
});
