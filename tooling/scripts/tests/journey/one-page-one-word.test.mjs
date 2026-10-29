/**
 * One page, one word (decision 0041, item 2), for the pages beyond Campaigns, People and a person's page: Reports,
 * the Calendar and its setup, People's lists, Settings › Business, Ask and Today. What a workspace calls an appointment
 * is its own (appointment, visit, meeting, session or lesson: `appointmentWordOf`), and none of these pages is handed
 * it, so each says none: "booked", "a booking", "on the calendar". Before this, a workspace whose customers get a
 * proposal first read "meeting" on Campaigns and "appointment" on each of these (the gap list of 15 Oct 2026, B).
 *
 * The words are read by running what each page draws them with, never by reading the text. A customer's words are not
 * here: a customer reads "appointment" whatever the trade (decision 6, trade-neutral.test.mjs), and nor are a model's.
 * The test picker runs this file when any module it reads changes: it follows each `importSrc` below, and what that
 * module imports (changed-tests.mjs, the imports' rule).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const K = "packages/contracts/src";
/** Any of the five words, written in. */
const A_WORD = /\b(appointment|visit|meeting|session|lesson)(s|ed)?\b/i;

/** Every string under a value: a view model, a table of words, a list of rows. */
function stringsOf(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) stringsOf(v, out);
  return out;
}

const saysNone = (page, value) =>
  assert.deepEqual(
    stringsOf(value).filter((s) => A_WORD.test(s)),
    [],
    `${page} says a word for an appointment it was never handed: say "booked", "a booking" or "on the calendar"`,
  );

test("Reports says none: the booking line and its metric's tip", async () => {
  const { toBookingReportVM } = await importSrc(`${K}/reports/booking-report.ts`);
  const { metricWordsOf } = await importSrc(`${K}/reports/report-metrics.ts`);
  const line = (asked, booked) => toBookingReportVM({ calendar: "ok", days: 30, asked, booked });
  saysNone("Reports' booking line", [line(9, 4), line(5, 5), line(0, 0)]);
  saysNone("Reports' booked tip", metricWordsOf("booked"));
  assert.equal(line(9, 4).headline, "4 of 9 booked", "the headline says it, as the line under it now does");
});

test("the Calendar and its setup say none: the booking rules, connecting a calendar, a booking email", async () => {
  const { ruleParts } = await importSrc(`${K}/calendar/calendar-words.ts`);
  const { FEED_GUIDES } = await importSrc(`${K}/calendar/feed-url.ts`);
  const { BOOKING_TOOL_IDS, BOOKING_TOOL_STEPS, NOTICE_HOLD_WORDS } = await importSrc(
    `${K}/calendar/booking-notice.ts`,
  );
  const { calendarLinkNote, BOOKS_WITH_CALENDAR, BOOKS_BY_HAND } = await importSrc(`${K}/setup/calendar-source.ts`);
  saysNone("the booking rules", ruleParts({ buffer_min: 15 }));
  saysNone("connecting a calendar", FEED_GUIDES);
  saysNone("a booking tool's steps", BOOKING_TOOL_STEPS);
  saysNone("a booking email held", NOTICE_HOLD_WORDS);
  const tools = [BOOKS_WITH_CALENDAR, BOOKS_BY_HAND, ...BOOKING_TOOL_IDS];
  saysNone(
    "the calendar link's note",
    tools.flatMap((t) => [calendarLinkNote(t, true), calendarLinkNote(t, false)]),
  );
});

test("People's lists say none: each list's tip and its next step", async () => {
  const { PEOPLE_LISTS } = await importSrc(`${K}/people/lists/builtin-lists.ts`);
  const { peopleListAction } = await importSrc(`${K}/people/people-lists.ts`);
  saysNone(
    "a list's label and tip",
    PEOPLE_LISTS.map((l) => [l.label, l.tip]),
  );
  saysNone(
    "a list's next step",
    PEOPLE_LISTS.map((l) => peopleListAction(l.id, [])),
  );
});

test("Settings › Business says none: what it cannot do, the booking rules, each rule's strength", async () => {
  const { cannotRows } = await importSrc(`${K}/config/business-tab/abilities.ts`);
  const { bookingRulesWords } = await importSrc(`${K}/config/business-tab/booking-rules-words.ts`);
  const { ruleStrength } = await importSrc(`${K}/config/business-tab/rule-strengths.ts`);
  const { GUARDRAIL_KEYS } = await importSrc(`${K}/config/workspace-config/config-rules.ts`);
  saysNone(
    "what it cannot do",
    [true, false].flatMap((smsLive) => [true, false].map((hasBookingLink) => cannotRows({ smsLive, hasBookingLink }))),
  );
  saysNone("the booking rules", [bookingRulesWords({ buffer_min: 0 }), bookingRulesWords({ buffer_min: 15 })]);
  saysNone(
    "a rule's strength",
    GUARDRAIL_KEYS.map((k) => ruleStrength(k)),
  );
});

test("Ask says none: a source's kind on an old answer, and a plan's moment", async () => {
  const { answerFromV1 } = await importSrc(`${K}/ask/ask-answer.ts`);
  const { PLAN_WORDS } = await importSrc(`${K}/ask/plan.ts`);
  const old = answerFromV1({
    text: "Two ahead.",
    citations: [{ kind: "visit", id: "v1", label: "Ana · Tue 2pm", to: "calendar/visit:v1" }],
    navigate: null,
    followups: [],
    language: "en",
  });
  saysNone(
    "an old answer's source",
    old.show.items.map((i) => i.meta),
  );
  saysNone(
    "a plan's moment",
    ["first_contact", "before", "after"].map((id) => PLAN_WORDS.why.stage(id)),
  );
});

test("Today says none: the activity of the calendar, and why a run held someone", async () => {
  const { activityKindWords } = await importSrc(`${K}/workspace/activity.ts`);
  const { HELD_REASONS } = await importSrc(`${K}/broadcasts/run-words.ts`);
  saysNone("an appointment's change on the activity", activityKindWords("appointment.changed"));
  saysNone("why a run held someone", HELD_REASONS.appointment_changed);
});
