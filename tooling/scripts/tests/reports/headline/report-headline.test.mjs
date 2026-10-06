/**
 * The headline (contracts reports/report-headline.ts; `headlineOf` in reports.ts): what Today reads of a period, summed where
 * the series is. One derivation: its counts are `periodFactsOf`'s, the facts the page's view model is built from, so this holds it
 * to that view model for the same series (the world Reports' own tests draw, tests/reports/_report-world.mjs) over a matrix of
 * periods, and pins what goes over the wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { headlineOf, isReportDto, toBookingReportVM, toHeadlineVM, toReportVM } from "@chanlytics/contracts";
import { CALENDAR, quiet, reportDto } from "../_report-world.mjs";

const NONE = { calendar: "none", days: 30, asked: 0, booked: 0 };
/** The world's series cut to what a period of `days` reads: the last `days` and the `days` before them, and no more (the function answers no more). */
const lastDays = (days) => {
  const dto = reportDto();
  return { ...dto, days, series: dto.series.slice(-2 * days) };
};
/** The periods the page offers over the world's fourteen days, and what Month is early in a month. */
const MATRIX = [
  ["the week, as the world has it", reportDto(), "7d", CALENDAR],
  ["a month on its first day: one day, against the one before it", lastDays(1), "month", CALENDAR],
  ["a month on its fifth day, the calendar unread", lastDays(5), "month", null],
  ["thirty days of a workspace younger than two periods: nothing before it to compare", lastDays(30), "30d", NONE],
  ["nobody wrote or called", { ...reportDto(), ...quiet() }, "7d", CALENDAR],
];

for (const [name, dto, period, booking] of MATRIX)
  test(`${name}: the headline says what the page's view model says of the same series`, () => {
    const page = toReportVM(dto, { profile: null });
    const messages = page.tiles.find((t) => t.id === "messages");
    assert.deepEqual(toHeadlineVM(headlineOf(dto, period, booking)), {
      period,
      days: page.days,
      rangeLabel: page.rangeLabel,
      lead: page.period.now,
      empty: page.empty,
      messages: { total: page.answered.totals.in, compare: messages.compare },
      answered: {
        ai: page.answered.totals.ai,
        you: page.answered.totals.you,
        none: page.answered.totals.none,
        share: page.answered.share,
      },
      calls: page.calls.total,
      booking: toBookingReportVM(booking),
    });
  });

test("what goes over the wire is counts and one ratio, not a day of the series: eleven fields, a few hundred bytes", () => {
  const dto = headlineOf(reportDto(), "7d", CALENDAR);
  assert.deepEqual(Object.keys(dto), [
    "period",
    "days",
    "empty",
    "messages_in",
    "messages_before",
    "answered_ai",
    "answered_you",
    "unanswered",
    "answered_share",
    "calls",
    "booking",
  ]);
  // The world's week: 17 messages (13 answered by the receptionist, 3 by the owner, 1 by nobody) and 3 calls, after a week
  // of 7 messages; the owner's calendar says 3 of the 8 who asked have an appointment.
  assert.deepEqual(dto, {
    period: "7d",
    days: 7,
    empty: false,
    messages_in: 17,
    messages_before: 7,
    answered_ai: 13,
    answered_you: 3,
    unanswered: 1,
    answered_share: 13 / 17,
    calls: 3,
    booking: CALENDAR,
  });
  assert.ok(JSON.stringify(dto).length < 400, "a small read");
  assert.equal(
    headlineOf({ ...reportDto(), days: 30 }, "30d", null).messages_before,
    null,
    "nothing before a workspace's first period: there is nothing to compare with, and the words say none",
  );
});

test("a database's answer is a report only when it holds the series and the days: its own refusal, a bare object and nothing are not", () => {
  assert.equal(isReportDto(reportDto()), true);
  assert.equal(isReportDto({ error: "unknown_tenant" }), false);
  assert.equal(isReportDto({ days: 7 }), false);
  assert.equal(isReportDto({ series: [] }), false);
  assert.equal(isReportDto(null), false);
  assert.equal(isReportDto("report"), false);
});
