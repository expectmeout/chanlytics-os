/**
 * A booking asks for its late reminder from its event (decision 0118): the subscriber `visit_reminder` reads an
 * `appointment.changed`, and for a change that leaves an appointment standing (added, confirmed, moved) hands its id to
 * the edge's door, which decides whether the day's look still names the visit and runs the reminder for that one person
 * where it does not. A cancellation asks nothing. Every booking says what came of it in one log line, and a door that
 * could not be asked fails the delivery, so it is tried again. Run through the job runner's dispatch over a database in
 * memory, as the harness beside it runs every subscriber.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";
import { dispatchJob } from "../../packages/jobs/src/handlers/handlers.ts";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const KIND = "appointment.changed";
const SUBSCRIBER = "visit_reminder";
const GOES = "2999-10-12T01:00:00.000Z";

/** The logger's lines written while `fn` ran, and what it answered. */
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

/**
 * One appointment's event and its delivery to the reminder; the edge's door recorded, answering `reminder` (or throwing
 * it, when it is an Error).
 */
function world({
  data = { change: "added", source: "booking_email", starts_at: "2999-10-12T15:00:00Z" },
  reminder = { reminded: true, at: GOES, waits: false },
  thanks = { thanked: true, at: GOES, waits: false },
} = {}) {
  const tables = {
    events: [
      rows.event({
        id: E,
        tenant_id: T,
        kind: KIND,
        category: "appointment",
        subject_type: "appointment",
        subject_id: APPT,
        data,
        created_at: "2026-10-06T00:00:00Z",
      }),
    ],
    event_subscriptions: [
      { kind: KIND, subscriber: SUBSCRIBER, lane: 2, paused: false, created_at: "2026-10-06T00:00:00Z" },
    ],
    event_deliveries: [
      {
        event_id: E,
        subscriber: SUBSCRIBER,
        tenant_id: T,
        kind: KIND,
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
  const asks = [];
  const thanked = [];
  const ctx = {
    db: fakeDb(tables),
    wire: { whatsapp: null, sms: null },
    alert: async () => {},
    reminders: {
      remind: async (tenantId, appointmentId) => {
        asks.push([tenantId, appointmentId]);
        if (reminder instanceof Error) throw reminder;
        return reminder;
      },
      // A visit marked kept (decision 0122): the same subscriber's other door.
      thank: async (tenantId, appointmentId) => {
        thanked.push([tenantId, appointmentId]);
        if (thanks instanceof Error) throw thanks;
        return thanks;
      },
    },
  };
  const job = {
    id: "j-1",
    tenant_id: T,
    kind: "event_deliver",
    payload: { event_id: E, subscriber: SUBSCRIBER, kind: KIND, lane: "2" },
  };
  return { ctx, job, asks, thanked, delivery: () => tables.event_deliveries[0] };
}

/** The subscriber's own lines, as [name, fields]. */
const reminderLines = (lines) =>
  lines.filter((l) => l.event?.startsWith("late_booking_")).map((l) => [l.event, fieldsOf(l)]);

test("a booking that stands asks the door once, with its appointment, and says what came of it", async () => {
  for (const change of ["added", "confirmed", "moved"]) {
    const w = world({ data: { change, source: "booking_email", starts_at: "2999-10-12T15:00:00Z" } });
    const { answer, lines } = await logged(() => dispatchJob(w.ctx, w.job));
    assert.equal(answer, "done", change);
    assert.deepEqual(w.asks, [[T, APPT]], `${change}: the appointment of the event, in its workspace`);
    assert.deepEqual(
      reminderLines(lines),
      [["late_booking_reminded", { tenant_id: T, appointment: APPT, event_id: E, at: GOES, waits: false }]],
      change,
    );
    assert.equal(w.delivery().state, "done", change);
  }
});

test("a cancellation, a vanished entry and an event that names no change ask nothing", async () => {
  for (const data of [{ change: "cancelled", by: "service" }, { change: "vanished", source: "calendar_feed" }, {}]) {
    const w = world({ data });
    const { answer, lines } = await logged(() => dispatchJob(w.ctx, w.job));
    assert.equal(answer, "done");
    assert.deepEqual(w.asks, []);
    assert.deepEqual(reminderLines(lines), []);
  }
});

test("a booking that is owed nothing says why, in one line", async () => {
  for (const [reminder, fields] of [
    [{ reminded: false, why: "not_late" }, { why: "not_late" }],
    [{ reminded: false, why: "already" }, { why: "already" }],
    [{ reminded: false, why: "no_step" }, { why: "no_step" }],
    [
      { reminded: false, why: "off", detail: "no_calendar" },
      { why: "off", detail: "no_calendar" },
    ],
  ]) {
    const w = world({ reminder });
    const { answer, lines } = await logged(() => dispatchJob(w.ctx, w.job));
    assert.equal(answer, "done");
    assert.deepEqual(reminderLines(lines), [
      ["late_booking_not_reminded", { tenant_id: T, appointment: APPT, event_id: E, ...fields }],
    ]);
  }
});

test("a reminder that waits for its owner says so", async () => {
  const w = world({ reminder: { reminded: true, at: null, waits: true } });
  const { lines } = await logged(() => dispatchJob(w.ctx, w.job));
  assert.deepEqual(reminderLines(lines), [
    ["late_booking_reminded", { tenant_id: T, appointment: APPT, event_id: E, at: null, waits: true }],
  ]);
});

test("a door that could not be asked fails the delivery, so it is tried again", async () => {
  const w = world({ reminder: new Error("the workspace could not be read for a late reminder: people") });
  await assert.rejects(() => dispatchJob(w.ctx, w.job), /could not be read for a late reminder/);
  assert.equal(w.delivery().state, "failed");
});

test("a runtime that holds no reminder fails loudly, never quietly", async () => {
  const w = world();
  delete w.ctx.reminders;
  await assert.rejects(() => dispatchJob(w.ctx, w.job), /this runtime holds no reminder of a late booking/);
});

/** The lines a Kept writes, as [name, fields]. */
const thanksLines = (lines) =>
  lines.filter((l) => l.event?.startsWith("late_visit_")).map((l) => [l.event, fieldsOf(l)]);

test("a visit marked kept asks the thank-you's door, never the reminder's, and says what came of it (decision 0122)", async () => {
  const w = world({ data: { change: "kept", by: "member" } });
  const { answer, lines } = await logged(() => dispatchJob(w.ctx, w.job));
  assert.equal(answer, "done");
  assert.deepEqual(w.thanked, [[T, APPT]], "the appointment of the event, in its workspace");
  assert.deepEqual(w.asks, [], "a visit behind is owed no reminder");
  assert.deepEqual(thanksLines(lines), [
    ["late_visit_thanked", { tenant_id: T, appointment: APPT, event_id: E, at: GOES, waits: false }],
  ]);
  assert.deepEqual(reminderLines(lines), []);
  assert.equal(w.delivery().state, "done");
});

test("a Kept that is owed no thank-you of its own says why in one line; a workspace with no thank-you says nothing", async () => {
  const kept = { change: "kept", by: "member" };
  for (const [thanks, fields] of [
    [{ thanked: false, why: "not_late" }, { why: "not_late" }],
    [{ thanked: false, why: "already" }, { why: "already" }],
    [
      { thanked: false, why: "off", detail: "no_calendar" },
      { why: "off", detail: "no_calendar" },
    ],
  ]) {
    const w = world({ data: kept, thanks });
    const { lines } = await logged(() => dispatchJob(w.ctx, w.job));
    assert.deepEqual(thanksLines(lines), [
      ["late_visit_not_thanked", { tenant_id: T, appointment: APPT, event_id: E, ...fields }],
    ]);
  }
  // Every Kept of every workspace comes through here: one with no sequence on the day after is not a line a day.
  const none = world({ data: kept, thanks: { thanked: false, why: "no_step" } });
  assert.deepEqual(thanksLines((await logged(() => dispatchJob(none.ctx, none.job))).lines), []);
});

test("a thank-you's door that could not be asked fails the delivery, so it is tried again", async () => {
  const w = world({ data: { change: "kept", by: "member" }, thanks: new Error("the workspace could not be read") });
  await logged(() => assert.rejects(dispatchJob(w.ctx, w.job), /could not be read/));
  assert.notEqual(w.delivery().state, "done");
});
