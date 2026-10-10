/**
 * The journey follows the business (spec 2026-10-09 §4.8, J1 and J2): what a workspace calls an appointment, derived
 * now and stored later (appointmentWordOf), every phrase the word makes said once (appointmentWords), and the moments in
 * the order its customers pass through them (journeyOf), for the four shapes a workspace can have: with a calendar or
 * not, with deals or not. Executed over contracts' own functions; the one-word scan over the view models is below them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

/** The four shapes: a calendar connected or not, deals on or not. */
const SHAPES = [
  { calendarOn: false, dealsOn: false },
  { calendarOn: true, dealsOn: false },
  { calendarOn: true, dealsOn: true },
  { calendarOn: false, dealsOn: true },
];
const NONE_HELD = new Set();

test("the set is five words, and call, consultation, booking and class are not among them", () => {
  assert.deepEqual([...C.APPOINTMENT_WORDS], ["appointment", "visit", "meeting", "session", "lesson"]);
  for (const w of C.APPOINTMENT_WORDS) assert.equal(C.isAppointmentWord(w), true, w);
  for (const w of ["call", "consultation", "booking", "class", "Visit", "", null, 3])
    assert.equal(C.isAppointmentWord(w), false, String(w));
});

test("the word is the one picked, else a meeting where deals are on, else an appointment; nothing else is read", () => {
  assert.equal(C.appointmentWordOf({ stored: "session", sellsBy: "proposal" }), "session", "a pick outranks the shape");
  assert.equal(C.appointmentWordOf({ stored: null, sellsBy: "proposal" }), "meeting");
  assert.equal(C.appointmentWordOf({ stored: null, sellsBy: "booking" }), "appointment");
  assert.equal(C.appointmentWordOf({ stored: null, sellsBy: null }), "appointment", "not asked yet: an appointment");
  assert.equal(
    C.appointmentWordOf({ stored: "class", sellsBy: null }),
    "appointment",
    "a word outside the set is no pick",
  );
});

test("each word says its phrases once, with its own article and verb", () => {
  const visit = C.appointmentWords("visit");
  assert.deepEqual(
    [visit.before.caps, visit.before.name, visit.after.caps, visit.a],
    ["Visit tomorrow", "Visit reminder", "After the visit", "a visit"],
  );
  assert.equal(visit.offTomorrow(1), "Off · 1 person visits tomorrow");
  assert.equal(visit.offTomorrow(3), "Off · 3 people visit tomorrow");
  assert.equal(visit.offYesterday(2), "Off · 2 people visited yesterday");
  assert.equal(visit.tomorrowWho, "everyone with a visit tomorrow");
  assert.equal(visit.yesterdayWho, "everyone who visited yesterday");
  assert.equal(visit.lapsedHint, "No visit in 45 days, and nothing booked");
  const meeting = C.appointmentWords("meeting");
  assert.deepEqual(
    [meeting.before.caps, meeting.before.name, meeting.after.caps, meeting.a],
    ["Meeting tomorrow", "Meeting reminder", "After the meeting", "a meeting"],
  );
  assert.equal(meeting.offTomorrow(1), "Off · 1 person has a meeting tomorrow");
  assert.equal(meeting.offTomorrow(3), "Off · 3 people have a meeting tomorrow");
  assert.equal(meeting.offYesterday(3), "Off · 3 people had a meeting yesterday");
  assert.equal(meeting.byMany, "by meetings");
  const appointment = C.appointmentWords("appointment");
  assert.equal(appointment.a, "an appointment");
  assert.equal(appointment.before.hint, "The day before an appointment on the calendar");
  assert.equal(appointment.after.hint, "The day after an appointment, when nothing is booked next");
  assert.equal(appointment.startsWith, "an appointment tomorrow, an appointment yesterday");
  assert.equal(
    appointment.needsCalendar,
    "Appointments are read from your calendar, and none is connected. Connect one under Settings › Business.",
  );
});

test("journeyOf: the moments in the journey's order for each shape, Proposal waiting before Quiet, ids free of the word", () => {
  for (const shape of SHAPES) {
    const stages = C.journeyOf({ ...shape, word: "appointment", held: NONE_HELD });
    const ids = stages.map((s) => s.id);
    assert.deepEqual(
      ids,
      shape.dealsOn
        ? ["first_contact", "before", "after", "proposal", "quiet"]
        : ["first_contact", "before", "after", "quiet"],
      JSON.stringify(shape),
    );
    for (const id of ids) assert.ok(C.JOURNEY_STAGE_IDS.includes(id), id);
    assert.deepEqual(
      stages.filter((s) => s.unmet === "calendar").map((s) => s.id),
      shape.calendarOn ? [] : ["before", "after"],
      `${JSON.stringify(shape)}: the appointment moments need a calendar`,
    );
    assert.equal(stages.find((s) => s.id === "quiet").trigger, shape.calendarOn ? "lapsed" : "quiet_30");
    assert.equal(stages[0].kind, "receptionist");
    assert.ok(stages.slice(1).every((s) => s.kind === "moment"));
  }
  // A stage that holds a campaign is drawn whatever the shape: a follow-up made while deals were on.
  const held = C.journeyOf({ calendarOn: true, dealsOn: false, word: "appointment", held: new Set(["proposal"]) });
  assert.deepEqual(
    held.map((s) => s.id),
    ["first_contact", "before", "after", "proposal", "quiet"],
  );
  const session = C.journeyOf({ calendarOn: true, dealsOn: true, word: "session", held: NONE_HELD });
  assert.deepEqual(
    session.map((s) => s.caps),
    ["First contact", "Session tomorrow", "After the session", "Proposal waiting", "Quiet or lapsed"],
  );
  assert.deepEqual(
    session.map((s) => s.name),
    ["Your receptionist", "Session reminder", "How did it go", "Proposal follow-up", "Win-back"],
  );
  assert.deepEqual(
    session.map((s) => s.one),
    [false, false, false, true, false],
    "the follow-up is the one moment that holds at most one campaign (00167)",
  );
  const off = Object.fromEntries(session.map((s) => [s.id, s.off]));
  assert.equal(off.first_contact, null, "the receptionist is nobody's to turn on");
  assert.deepEqual(
    [off.before.hint, off.before.when, off.before.why(3)],
    ["tomorrow", { day: "Every", at: "day" }, "Off · 3 people have a session tomorrow"],
  );
  assert.deepEqual([off.after.hint, off.after.when], ["yesterday", { day: "The day", at: "after" }]);
  assert.deepEqual(
    [off.proposal.why(1), off.quiet.why(2), off.quiet.why(1)],
    ["Off · 1 proposal waiting", "Off · 2 people have gone quiet", "Off · 1 person has gone quiet"],
    "one person has gone quiet, in the singular",
  );
});

test("journeyStageOf: the stage a campaign's trigger stands on, and none for a list, the month's offer or a reach-out's step", () => {
  const cases = {
    new_week: "first_contact",
    phoned_only: "first_contact",
    visit_tomorrow: "before",
    visited: "after",
    proposal_waiting: "proposal",
    quiet_30: "quiet",
    lapsed: "quiet",
    saved_list: null,
    everyone_monthly: null,
    lead_first: null,
    after_step: null,
  };
  for (const [trigger, stage] of Object.entries(cases)) assert.equal(C.journeyStageOf(trigger), stage, trigger);
});

test("the drawer's schedule and a card's pool say the workspace's word; a proposal's say none", () => {
  const p = { trigger: "visit_tomorrow", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 };
  assert.equal(C.scheduleLine(p, "meeting"), "Daily 10:00 AM · everyone with a meeting tomorrow · up to 25");
  assert.equal(
    C.scheduleLine({ ...p, trigger: "visited" }, "visit"),
    "Daily 10:00 AM · everyone who visited yesterday · up to 25",
  );
  assert.equal(C.poolWords("visit_tomorrow", "appointment"), "with an appointment tomorrow");
  assert.equal(C.poolWords("visited", "lesson"), "who had a lesson yesterday");
  assert.equal(C.poolWords("proposal_waiting", "lesson"), "with a proposal waiting");
});
