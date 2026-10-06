/**
 * The headline (contracts reports/report-headline.ts; `headlineOf` in reports.ts): what Today reads of a period, summed where
 * the series is. One derivation: its counts are `periodFactsOf`'s, the facts the page's view model is built from, so this holds it
 * to that view model for the same series (the world Reports' own tests draw, tests/reports/_report-world.mjs) over a matrix of
 * periods, and pins what goes over the wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  headlineOf,
  isReportDto,
  toBookingReportVM,
  toHeadlineVM,
  toReportVM,
  todayLeaks,
  todayPeriodLine,
} from "@chanlytics/contracts";
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

/**
 * Today's period line as it was written over the report's own view model (contracts today-period.ts, until the headline): the
 * oracle the new line is held to. It reads the page's `period.now`, `answered`, the messages tile's comparison and `calls`.
 */
const periodLineOver = (page) => {
  const total = page.answered.totals.in;
  if (page.empty) return `${page.period.now}: nobody wrote or called.`;
  const compare = page.tiles.find((t) => t.id === "messages")?.compare;
  const parts = [`${total} message${total === 1 ? "" : "s"}${compare ? ` (${compare})` : ""}`];
  if (page.answered.share !== null)
    parts.push(`${Math.round(page.answered.share * 100)}% answered by the receptionist`);
  if (page.calls.total) parts.push(`${page.calls.total} call${page.calls.total === 1 ? "" : "s"}`);
  return `${page.period.now}: ${parts.join(", ")}.`;
};

for (const [name, dto, period, booking] of MATRIX)
  test(`${name}: Today's period line says what it said over the report's own view model`, () => {
    const line = todayPeriodLine(toHeadlineVM(headlineOf(dto, period, booking)));
    assert.deepEqual(line, { text: periodLineOver(toReportVM(dto, { profile: null })), to: "reports" });
  });

test("Worth a look's two rows that read Reports say what they said: the booking gap and the messages nobody answered, text and arithmetic", () => {
  // Three messages nobody answered on the first of September, and one of the twelve who asked is on the calendar.
  const series = reportDto().series.map((d) => (d.day === "2026-09-01" ? { ...d, unanswered: 3 } : d));
  const dto = { ...reportDto(), series };
  const asked = { calendar: "ok", days: 7, asked: 12, booked: 1 };
  const page = toReportVM(dto, { profile: null });
  const totals = page.answered.totals;
  const booking = toBookingReportVM(asked);
  const { rows } = todayLeaks(toHeadlineVM(headlineOf(dto, "7d", asked)), null, []);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["never-booked", "unanswered"],
  );
  assert.equal(
    rows[0].text,
    `Only ${booking.booked} of the ${booking.asked} people who wrote or called in the last ${page.rangeLabel} got onto the calendar.`,
  );
  assert.equal(rows[0].math, booking.headline);
  assert.equal(rows[1].text, `${totals.none} customer messages never got an answer at all.`);
  assert.equal(
    rows[1].math,
    `of ${totals.in} in the last ${page.rangeLabel} · the receptionist answered ${totals.ai}, you answered ${totals.you}`,
  );
  const unread = todayLeaks(toHeadlineVM(headlineOf(dto, "7d", null)), null, []).rows.map((r) => r.id);
  assert.deepEqual(unread, ["unanswered"], "no calendar read is a setup step, not a leak");
});
