/**
 * One event's delivery to one subscriber (00334, decision 0032), run through the job runner's dispatch over a database
 * in memory: the handler runs the subscriber over the event as the ledger holds it and settles the delivery row; a
 * subscriber this build does not know is kept as an unknown kind; a paused subscription pauses the delivery; an event
 * the ledger no longer holds fails it, says so under its own name and pages the operator (the job is done, so the
 * tick's own page for a delivery that fails for good never comes); a subscriber that throws fails it with why and the
 * job throws on. And the harness every subscriber must pass: run twice on one delivery, the same rows.
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
import { fieldsOf, logLineOf } from "../_log-lines.mjs";

/** The logger's lines (one JSON object per console call) written while `fn` ran, and what it answered. */
async function logged(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  try {
    const answer = await fn();
    return { answer, lines: lines.map(logLineOf).filter(Boolean) };
  } finally {
    Object.assign(console, real);
  }
}

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** The kind each subscriber reads, and an event of it: an appointment kept on the record for reach_out_booked. */
const READS = {
  audit: { kind: "message.received", category: "message", subject_type: null, subject_id: null, data: {} },
  reach_out_booked: {
    kind: "appointment.changed",
    category: "appointment",
    subject_type: "appointment",
    subject_id: "a-1",
    data: { change: "added", source: "booking_email", starts_at: "2026-10-12T15:00:00Z" },
  },
};

/** A world with one event, its subscription and the delivery the relay wrote; the booking door counts its calls. */
function world({ paused = false, withEvent = true, subscriber = "audit" } = {}) {
  const read = READS[subscriber] ?? READS.audit;
  const kind = read.kind;
  const booked = [];
  const tables = {
    events: withEvent ? [rows.event({ id: E, tenant_id: T, ...read })] : [],
    event_subscriptions: [{ kind, subscriber, lane: 2, paused, created_at: "2026-10-06T00:00:00Z" }],
    event_deliveries: [
      {
        event_id: E,
        subscriber,
        tenant_id: T,
        kind,
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
  // The booking door over one appointment (00386): what it was asked, and one lead moved.
  const db = fakeDb(
    tables,
    {},
    {
      reach_out_booked_from: ({ p_tenant_id, p_appointment_id }) => {
        booked.push([p_tenant_id, p_appointment_id]);
        return 1;
      },
    },
  );
  // The platform's pager, recorded: a delivery's failure is never an owner's (ledger PAGES_THE_PLATFORM).
  const pages = [];
  const ctx = {
    db,
    wire: { whatsapp: null, sms: null },
    alert: async () => {},
    page: async (key, subject, body) => {
      pages.push({ key, subject, body });
    },
  };
  const job = {
    id: "j-1",
    tenant_id: T,
    kind: "event_deliver",
    payload: { event_id: E, subscriber, kind, lane: "2" },
  };
  return { tables, ctx, job, pages, booked, delivery: () => tables.event_deliveries[0] };
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

test("a paused subscription pauses the delivery for the re-drive; an event the ledger no longer holds fails it, said and paged, with the job done", async () => {
  const paused = world({ paused: true });
  assert.equal(await dispatchJob(paused.ctx, paused.job), "done");
  assert.deepEqual([paused.delivery().state, paused.delivery().attempts], ["paused", 1]);
  assert.deepEqual(paused.pages, [], "a pause is nobody's condition");

  // Purged before its delivery ran (the evidence kinds, 00115): no try could change it, so the job is done, and the
  // miss used to be nobody's. It is the platform's: said under its own name, and paged on the same condition the
  // tick pages a delivery that fails for good (one key, so the pager sends once per window).
  const gone = world({ withEvent: false });
  const { answer, lines } = await logged(() => dispatchJob(gone.ctx, gone.job));
  assert.equal(answer, "done");
  assert.deepEqual(
    [gone.delivery().state, gone.delivery().last_error],
    ["failed", "the ledger no longer holds the event"],
  );
  assert.deepEqual(
    lines.filter((l) => l.event === "event_deliver_event_gone").map((l) => [l.level, fieldsOf(l)]),
    [["error", { tenant_id: T, job: "j-1", event_id: E, subscriber: "audit", kind: "message.received" }]],
    "one line, under the name alerting greps for, with the delivery named",
  );
  assert.equal(gone.pages.length, 1);
  assert.equal(
    gone.pages[0].key,
    "event_deliver_failed:audit",
    "the tick's own condition for a delivery to that subscriber that failed for good",
  );
  assert.equal(gone.pages[0].subject, "A change was not passed on to what reads it");
  assert.match(
    gone.pages[0].body,
    new RegExp(
      `^The delivery of event ${E} \\(message\\.received\\) to the audit subscriber failed for good in workspace ${T}: the ledger no longer holds the event\\.`,
    ),
  );
  assert.match(gone.pages[0].body, /Reference: job j-1 \(event_deliver\)\.$/);

  // A pager that cannot be reached costs the delivery nothing: the row is failed, the job done, the miss on the log.
  const unpaged = world({ withEvent: false });
  unpaged.ctx.page = async () => {
    throw new Error("pager down");
  };
  const second = await logged(() => dispatchJob(unpaged.ctx, unpaged.job));
  assert.equal(second.answer, "done");
  assert.equal(unpaged.delivery().state, "failed");
  assert.deepEqual(
    second.lines.filter((l) => l.event === "job_page_failed").map((l) => fieldsOf(l)),
    [{ tenant_id: T, job: "j-1", kind: "event_deliver", error: "pager down" }],
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

test("reach_out_booked hands the booking door the appointment its event names, and only for a change that books", async () => {
  const w = world({ subscriber: "reach_out_booked" });
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.deepEqual(w.booked, [[T, "a-1"]], "the appointment of the event, in its workspace");
  assert.equal(w.delivery().state, "done");
  for (const change of ["confirmed", "moved"]) {
    const books = world({ subscriber: "reach_out_booked" });
    books.tables.events[0].data = { change, source: "booking_email", starts_at: "2026-10-12T15:00:00Z" };
    assert.equal(await dispatchJob(books.ctx, books.job), "done");
    assert.deepEqual(books.booked, [[T, "a-1"]], `${change}: books`);
  }
  for (const [change, source] of [
    ["cancelled", "booking_email"],
    ["vanished", "booking_email"],
    // The feed's own changes are the hourly sweep's to hand the door, over the feed's items.
    ["added", "calendar_feed"],
  ]) {
    const quiet = world({ subscriber: "reach_out_booked" });
    quiet.tables.events[0].data = { change, source, starts_at: "2026-10-12T15:00:00Z" };
    assert.equal(await dispatchJob(quiet.ctx, quiet.job), "done");
    assert.deepEqual(quiet.booked, [], `${change} from ${source}: books nobody`);
    assert.equal(quiet.delivery().state, "done", "and the delivery is done, not failed");
  }
});
