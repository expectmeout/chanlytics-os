/**
 * The moments an occasion starts (decision 0119), judged: what names an occasion, when its step is due, whether it is
 * still owed when its time comes, and how late its waiting batch may be approved. Pure rules (contracts
 * playbooks/occasions.ts, approval.ts), with the clock and the record handed in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  askFollowUpAt,
  askOccasion,
  isOccasionTrigger,
  lateReminderSkippedNotice,
  missedFollowUpAt,
  missedOccasion,
  occasionAppointment,
  occasionEventOf,
  occasionGone,
  readyRunNotice,
  runApprovalRefusal,
  runDaysAt,
  triggerOf,
  visitOccasion,
  visitOccasionsOf,
  visitSoonAt,
} from "@chanlytics/contracts";

/** Monday 9 November 2026 in New York is on standard time, five hours behind UTC. */
const TZ = "America/New_York";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const MESSAGE = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const at = (iso) => Date.parse(iso);
/** Monday at 3:12 PM in New York. */
const NOW = at("2026-11-09T20:12:00Z");
/** Tuesday at 2:00 PM in New York. */
const AFTERNOON = at("2026-11-10T19:00:00Z");

test("the three moments are an occasion's, and no other moment is", () => {
  for (const id of ["visit_soon", "visit_missed", "asked_no_booking"]) {
    assert.equal(triggerOf(id)?.kind, "occasion", id);
    assert.equal(isOccasionTrigger(id), true, id);
  }
  for (const id of ["visit_tomorrow", "visited", "slot_opened", "quiet_30", null, undefined, "nothing"])
    assert.equal(isOccasionTrigger(id), false, String(id));
});

test("an occasion is named by what happened: a visit at one start, a missed visit, the message that carried the link", () => {
  const soon = visitOccasion(APPT, AFTERNOON);
  assert.ok(soon.startsWith(visitOccasionsOf(APPT)), "a move or a cancellation finds every start of the visit");
  assert.notEqual(soon, visitOccasion(APPT, AFTERNOON + 3_600_000), "moved, it is another occasion");
  assert.equal(occasionAppointment(soon), APPT);
  assert.equal(occasionAppointment(missedOccasion(APPT)), APPT);
  assert.equal(occasionAppointment(askOccasion(MESSAGE)), null, "an ask names no visit");
});

test("the two-hour reminder goes two hours before, inside the sending hours", () => {
  const due = visitSoonAt({ startsAt: AFTERNOON, tz: TZ, nowMs: NOW, dayBeforeRuns: true });
  assert.equal(new Date(due).toISOString(), "2026-11-10T17:00:00.000Z", "noon for a visit at two");
});

test("booked inside the two hours, or for a visit that has begun, nothing is owed", () => {
  const anHourBefore = AFTERNOON - 3_600_000;
  assert.equal(visitSoonAt({ startsAt: AFTERNOON, tz: TZ, nowMs: anHourBefore, dayBeforeRuns: false }), null);
  assert.equal(visitSoonAt({ startsAt: AFTERNOON, tz: TZ, nowMs: AFTERNOON + 1, dayBeforeRuns: false }), null);
});

test("a visit too early for a reminder two hours before gets none where the day-before reminder runs", () => {
  // Tuesday at 9:30 AM: two hours before is 7:30 AM, before the sending hours.
  const early = at("2026-11-10T14:30:00Z");
  assert.equal(visitSoonAt({ startsAt: early, tz: TZ, nowMs: NOW, dayBeforeRuns: true }), null);
  // With no day-before reminder here, it goes at 8:00 PM the evening before.
  const due = visitSoonAt({ startsAt: early, tz: TZ, nowMs: NOW, dayBeforeRuns: false });
  assert.equal(new Date(due).toISOString(), "2026-11-10T01:00:00.000Z");
});

test("a visit late at night is reminded at the last sending hour of its own evening", () => {
  // Tuesday at 11:30 PM: two hours before is 9:30 PM, past the sending hours.
  const night = at("2026-11-11T04:30:00Z");
  const due = visitSoonAt({ startsAt: night, tz: TZ, nowMs: NOW, dayBeforeRuns: false });
  assert.equal(new Date(due).toISOString(), "2026-11-11T01:00:00.000Z", "8:00 PM that evening");
});

test("the follow-up to an ask goes the next day at the sequence's hour, kept inside the sending hours", () => {
  const next = (runHour) => new Date(askFollowUpAt({ askedAt: NOW, tz: TZ, runHour })).toISOString();
  assert.equal(next(10), "2026-11-10T15:00:00.000Z", "Tuesday at 10:00 AM");
  assert.equal(next(6), "2026-11-10T14:00:00.000Z", "never before nine");
  assert.equal(next(23), "2026-11-11T01:00:00.000Z", "never after eight in the evening");
});

test("a visit marked missed owes its message a few minutes on, and none when it is marked days later", () => {
  const started = NOW - 3_600_000;
  assert.equal(missedFollowUpAt({ markedAt: NOW, startsAt: started }), NOW + 600_000);
  assert.equal(missedFollowUpAt({ markedAt: NOW, startsAt: NOW - 4 * 86_400_000 }), null, "tidying the record");
});

test("a two-hour reminder is owed while its visit stands at the start it was made for and has not begun", () => {
  const occasion = visitOccasion(APPT, AFTERNOON);
  const facts = (over = {}) => ({
    nowMs: AFTERNOON - 7_200_000,
    appointment: { status: "booked", startsAt: AFTERNOON, vanished: false },
    bookedAhead: false,
    bookedSince: false,
    ...over,
  });
  assert.equal(occasionGone("visit_soon", occasion, facts()), null);
  assert.equal(occasionGone("visit_soon", occasion, facts({ appointment: null })), "visit_gone");
  for (const gone of [
    { status: "cancelled", startsAt: AFTERNOON, vanished: false },
    { status: "booked", startsAt: AFTERNOON, vanished: true },
    { status: "missed", startsAt: AFTERNOON, vanished: false },
  ])
    assert.equal(occasionGone("visit_soon", occasion, facts({ appointment: gone })), "visit_gone");
  const moved = { status: "booked", startsAt: AFTERNOON + 3_600_000, vanished: false };
  assert.equal(occasionGone("visit_soon", occasion, facts({ appointment: moved })), "visit_moved");
  assert.equal(occasionGone("visit_soon", occasion, facts({ nowMs: AFTERNOON })), "visit_begun");
  // A reminder is owed whatever else they hold.
  assert.equal(occasionGone("visit_soon", occasion, facts({ bookedAhead: true, bookedSince: true })), null);
});

test("a missed visit's message is owed while the visit is still marked missed and they have not booked again", () => {
  const occasion = missedOccasion(APPT);
  const missed = { status: "missed", startsAt: AFTERNOON, vanished: false };
  const facts = (over = {}) => ({
    nowMs: AFTERNOON + 3_600_000,
    appointment: missed,
    bookedAhead: false,
    bookedSince: false,
    ...over,
  });
  assert.equal(occasionGone("visit_missed", occasion, facts()), null);
  assert.equal(
    occasionGone("visit_missed", occasion, facts({ appointment: { ...missed, status: "booked" } })),
    "not_missed",
    "the word was taken back",
  );
  assert.equal(occasionGone("visit_missed", occasion, facts({ bookedAhead: true })), "booked");
  assert.equal(occasionGone("visit_missed", occasion, facts({ appointment: null })), "visit_gone");
});

test("an ask's follow-up is owed until they book", () => {
  const occasion = askOccasion(MESSAGE);
  const facts = (over = {}) => ({ nowMs: NOW, appointment: null, bookedAhead: false, bookedSince: false, ...over });
  assert.equal(occasionGone("asked_no_booking", occasion, facts()), null);
  assert.equal(occasionGone("asked_no_booking", occasion, facts({ bookedSince: true })), "booked");
  assert.equal(occasionGone("asked_no_booking", occasion, facts({ bookedAhead: true })), "booked");
});

test("an occasion comes of an appointment's change or of the booking link sent, and of no other event", () => {
  const event = (over) => ({ kind: "appointment.changed", subject_type: "appointment", subject_id: APPT, ...over });
  assert.deepEqual(occasionEventOf(event({ data: { change: "missed" } })), {
    about: "appointment",
    appointmentId: APPT,
    change: "missed",
  });
  assert.equal(occasionEventOf(event({ data: {} })), null, "a change that does not say what changed");
  assert.equal(occasionEventOf(event({ subject_id: null, data: { change: "added" } })), null);
  assert.deepEqual(
    occasionEventOf({ kind: "booking_link.sent", subject_type: "message", subject_id: MESSAGE, data: {} }),
    { about: "ask", messageId: MESSAGE },
  );
  assert.equal(
    occasionEventOf({ kind: "member.joined", subject_type: "invitation", subject_id: APPT, data: {} }),
    null,
  );
});

/** An occasion's batch waiting for an OK, as the run kept it: no day, and its visit in its audience. */
const waiting = (trigger, late) => ({
  state: "pending_approval",
  playbook_id: "pb1",
  run_for: null,
  audience: { kind: "playbook", id: "pb1", label: "A step", trigger, ...(late ? { late } : {}) },
});
const daysAt = (iso) => runDaysAt(TZ, new Date(iso));

test("a two-hour reminder that waits can be approved until its visit begins", () => {
  const run = waiting("visit_soon", { appointment: APPT, start: "2026-11-10T19:00:00.000Z", day: "2026-11-10" });
  assert.equal(runApprovalRefusal(run, daysAt("2026-11-10T18:30:00Z")), null, "half an hour before");
  assert.match(runApprovalRefusal(run, daysAt("2026-11-10T19:05:00Z")), /too late for this reminder/);
});

test("a missed visit's message that waits ends with the day its words name, never with the visit's start", () => {
  // Missed at 2:00 PM on Tuesday, marked at 2:30 PM: its words are Tuesday's.
  const run = waiting("visit_missed", {
    appointment: APPT,
    start: "2026-11-10T19:00:00.000Z",
    day: "2026-11-10",
    behind: true,
  });
  assert.equal(runApprovalRefusal(run, daysAt("2026-11-10T21:00:00Z")), null, "the visit began hours ago, and it goes");
  // Tuesday at 9:30 PM: an approval now would send it on Wednesday.
  assert.match(runApprovalRefusal(run, daysAt("2026-11-11T02:30:00Z")), /too late for this message/);
});

test("an ask's follow-up that waits has no day to pass", () => {
  const run = waiting("asked_no_booking", null);
  assert.equal(runApprovalRefusal(run, daysAt("2026-11-20T15:00:00Z")), null);
});

test("each occasion's waiting batch tells its owner how its wait ends", () => {
  const told = (trigger, at) => readyRunNotice("A step", 1, trigger, at).body;
  assert.match(told("visit_soon", "Tue, Nov 10, 2:00 PM"), /before Tue, Nov 10, 2:00 PM; after that it is skipped/);
  assert.match(told("visit_soon", null), /before the appointment begins/);
  assert.match(told("visit_missed", null), /after that it is skipped, and it does not reach them/);
  assert.match(told("asked_no_booking", null), /Waits for your OK; nothing goes until you give it/);
});

test("an occasion's batch the sweep skipped says its time passed, never that someone booked late", () => {
  const told = lateReminderSkippedNotice("Two hours before", 1, "visit_soon");
  assert.match(told.body, /^The message made for 1 person waited for your OK until it was too late to send/);
  assert.doesNotMatch(told.body, /booked after the day/);
  // Its next waits only for the first OK of its words: it has no "Ask me" for How it runs to say (sequenceModesFor).
  assert.match(told.body, /The next “Two hours before” waits for your OK too, until you approve one\.$/);
  assert.doesNotMatch(told.body, /Before each batch/);
  const day = lateReminderSkippedNotice("Appointment reminder", 1, "visit_tomorrow").body;
  assert.match(day, /booked after the day/);
  assert.match(day, /Before each batch/, "the day-before reminder may ask for each, and says so");
});
