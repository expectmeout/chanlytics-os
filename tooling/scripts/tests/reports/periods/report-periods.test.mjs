/**
 * The periods Reports offers and how a request names one (contracts reports/report-periods.ts over REPORT_RANGES): Month is
 * the days since the 1st in the workspace's own zone, today included; `period` names one, and `days`, which every page sent
 * before there was a Month, is read until its day, which this file holds. And the days a member picks: a window's first
 * day and its last, its one name, what its control says, what may be read and what a request names.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  REPORT_MOST_DAYS,
  REPORT_PERIOD_DEFAULT,
  REPORT_RANGES,
  fixedDaysOf,
  isReportDays,
  isReportPeriod,
  monthDaysAt,
  reportDaysAsked,
  reportDaysCount,
  reportDaysRefusal,
  reportPeriodOf,
  reportPickWords,
  reportRangeAsked,
  reportRangeKey,
  reportRangeOfKey,
  reportShortcuts,
  reportWindowOf,
  sameReportRange,
  toReportVM,
  zoneDayKey,
} from "@chanlytics/contracts";
import { reportDto } from "../_report-world.mjs";

test("the periods are the table's: three counts of days and Month, thirty days by default", () => {
  assert.deepEqual(
    REPORT_RANGES.map((r) => r.id),
    ["7d", "30d", "90d", "month"],
  );
  assert.equal(REPORT_PERIOD_DEFAULT, "30d");
  for (const id of ["7d", "30d", "90d", "month"]) assert.ok(isReportPeriod(id), id);
  for (const no of ["14d", "7", "Month", "", null, undefined, 30]) assert.ok(!isReportPeriod(no), String(no));
  assert.deepEqual(["7d", "30d", "90d", "month"].map(fixedDaysOf), [7, 30, 90, null]);
});

test("Month is the day of the month in the workspace's zone, today included, not the server's", () => {
  assert.equal(monthDaysAt("2026-10-05"), 5);
  assert.equal(monthDaysAt("2026-10-31"), 31);
  // 02:30 UTC on 1 October is still 30 September in Los Angeles and already the afternoon of the 1st in Auckland.
  const at = Date.parse("2026-10-01T02:30:00Z");
  assert.equal(monthDaysAt(zoneDayKey(at, "America/Los_Angeles")), 30);
  assert.equal(monthDaysAt(zoneDayKey(at, "Pacific/Auckland")), 1);
  assert.equal(monthDaysAt(zoneDayKey(at, "UTC")), 1);
});

test("a request names a period or, until its day, its days; none named is thirty days; anything else is none of ours", () => {
  assert.equal(reportPeriodOf({}), "30d");
  assert.equal(reportPeriodOf({ period: "month" }), "month");
  assert.equal(reportPeriodOf({ period: "7d", days: "90" }), "7d", "period wins");
  assert.equal(reportPeriodOf({ days: "90" }), "90d", "what open tabs still send");
  assert.equal(reportPeriodOf({ days: "7" }), "7d");
  for (const bad of [{ days: "45" }, { days: "month" }, { period: "14d" }, { period: "" }, { period: "7" }])
    assert.equal(reportPeriodOf(bad), null, JSON.stringify(bad));
});

test("a page that says it shows N days is described over N days, for any whole count the report can read", () => {
  assert.equal(reportDaysAsked("7"), 7);
  assert.equal(reportDaysAsked("5"), 5, "Month on the 5th");
  assert.equal(reportDaysAsked("90"), 90);
  for (const no of ["91", "0", "-3", "7.5", "month", "", null, undefined])
    assert.equal(reportDaysAsked(no), null, String(no));
});

// The `days` parameter is read until REMOVE_AFTER. Its day passed is said in every run, and a month after it is a red build:
// no unrelated change is stopped on the day, and nobody can leave it for good (the pattern of ai/flag-registry.test.mjs).
const REMOVE_AFTER = "2026-10-19";
const GRACE_DAYS = 30;

/** Every test that still sends `days=` to a report route: the day the parameter ends says where else to look. */
const SENDERS_OF_DAYS = [
  "ask/ask-routes.test.mjs (reports and reports/campaigns, `?days=`)",
  "ask/readers.test.mjs (the two loops that run a route beside its reader, `?days=${days}`)",
  "reach-out-back/back-routes.test.mjs (reports/reach-outs, `&days=`)",
  "reports/campaign-report.test.mjs (reports/campaigns, `?days=`)",
];

test("the days parameter ends on 19 October 2026: the change that removes it deletes its branch in report-periods.ts and this test", (t) => {
  assert.equal(reportPeriodOf({ days: "30" }), "30d", "still read, for the tabs and the head's old prefetch");
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = new Date(Date.parse(`${REMOVE_AFTER}T00:00:00Z`) + GRACE_DAYS * DAY_MS).toISOString().slice(0, 10);
  if (today > REMOVE_AFTER)
    t.diagnostic(`its day (${REMOVE_AFTER}) has passed: remove the days parameter from the four report routes`);
  assert.ok(
    today <= lastDay,
    `the days parameter's day (${REMOVE_AFTER}) passed more than ${GRACE_DAYS} days ago: remove it (report-periods.ts reportPeriodOf, the four routes' query), this test, and what still sends it: ${SENDERS_OF_DAYS.join("; ")}`,
  );
});

test("the period's window ends today, today included, as the report reads it: a count of days back, and Month from the 1st", () => {
  const at = (period, today) => {
    const w = reportWindowOf(period, today);
    return [w.from, w.to, w.dates, w.said];
  };
  assert.deepEqual(at("7d", "2026-10-06"), ["2026-09-30", "2026-10-06", "Sep 30 – Oct 6", "Last 7 days"]);
  assert.deepEqual(at("30d", "2026-10-06"), ["2026-09-07", "2026-10-06", "Sep 7 – Oct 6", "Last 30 days"]);
  assert.deepEqual(at("90d", "2026-10-06"), ["2026-07-09", "2026-10-06", "Jul 9 – Oct 6", "Last 90 days"]);
  assert.deepEqual(at("month", "2026-10-06"), ["2026-10-01", "2026-10-06", "Oct 1 – Oct 6", "This month so far"]);
  assert.deepEqual(
    at("month", "2026-10-01"),
    ["2026-10-01", "2026-10-01", "Oct 1", "This month so far"],
    "the 1st: one day",
  );
  assert.deepEqual(at("7d", "2026-03-03").slice(0, 2), ["2026-02-25", "2026-03-03"], "across a month's end");
  assert.deepEqual(at("90d", "2027-01-15").slice(0, 2), ["2026-10-18", "2027-01-15"], "and a year's");
  // The same arithmetic as the route's: a window's days are the days the route reads for it.
  for (const period of ["7d", "30d", "90d", "month"]) {
    const w = reportWindowOf(period, "2026-10-06");
    const days = Math.round((Date.parse(w.to) - Date.parse(w.from)) / DAY_MS) + 1;
    assert.equal(days, fixedDaysOf(period) ?? monthDaysAt("2026-10-06"), period);
  }
});

test("the report's view model says the business's today, the window's last day, from the read's own today", () => {
  assert.equal(toReportVM(reportDto(), { profile: null }).today, reportDto().today);
});

/* ---------------------------------------- the days a member picks ---------------------------------------- */

/** A Tuesday: the week it is in began on the 5th, and the month before it is September. */
const TODAY = "2026-10-06";
const SEP = { from: "2026-09-01", to: "2026-09-20" };

/** What a window's control says of it, in the order the page draws it. */
const said = (range, today = TODAY) => {
  const w = reportWindowOf(range, today);
  return {
    period: w.period,
    days: w.days,
    live: w.live,
    dates: w.dates,
    said: w.said,
    short: w.short,
    beside: w.beside,
  };
};

test("a period by name says its word on the control and its days beside it, and is live: it ends on the workspace's today", () => {
  assert.deepEqual(said("30d"), {
    period: "30d",
    days: 30,
    live: true,
    dates: "Sep 7 – Oct 6",
    said: "Last 30 days",
    short: "30 days",
    beside: "Sep 7 – Oct 6",
  });
  assert.deepEqual(
    [said("month").short, said("month").beside, said("month").days],
    ["Month", "Oct 1 – Oct 6", 6],
    "Month on the 6th",
  );
  assert.equal(reportWindowOf("30d", TODAY).key, "30d");
  assert.deepEqual(reportWindowOf("30d", TODAY).range, "30d", "the range is what a pick sends");
});

test("days a member picked are those days: said by their dates on the control, with how many they are beside it", () => {
  assert.deepEqual(said(SEP), {
    period: null,
    days: 20,
    live: false,
    dates: "Sep 1 – Sep 20",
    said: "20 days",
    short: "Sep 1 – 20",
    beside: "20 days",
  });
  const w = reportWindowOf(SEP, TODAY);
  assert.deepEqual([w.from, w.to, w.key, w.range], ["2026-09-01", "2026-09-20", "2026-09-01~2026-09-20", SEP]);
  // Across two months the control names both; one day is the day alone.
  assert.equal(said({ from: "2026-09-25", to: "2026-10-02" }).short, "Sep 25 – Oct 2");
  assert.deepEqual(
    [said({ from: "2026-09-15", to: "2026-09-15" })].map((s) => [s.days, s.dates, s.short, s.said, s.beside]),
    [[1, "Sep 15", "Sep 15", "1 day", "1 day"]],
  );
  // Days that end today are live, and still days: they are not the period that happens to cover them.
  assert.deepEqual(
    [said({ from: "2026-10-01", to: TODAY })].map((s) => [s.period, s.live, s.short, s.said]),
    [[null, true, "Oct 1 – 6", "6 days"]],
    "Month's own days, picked, are days",
  );
});

test("every figure is read against the same number of days before the window, whatever the window is", () => {
  const before = (range) => reportWindowOf(range, TODAY).before;
  assert.deepEqual(before("30d"), { from: "2026-08-08", to: "2026-09-06", dates: "Aug 8 – Sep 6" });
  assert.deepEqual(before("month"), { from: "2026-09-25", to: "2026-09-30", dates: "Sep 25 – Sep 30" });
  assert.deepEqual(before(SEP), { from: "2026-08-12", to: "2026-08-31", dates: "Aug 12 – Aug 31" });
  assert.deepEqual(before({ from: "2026-09-15", to: "2026-09-15" }), {
    from: "2026-09-14",
    to: "2026-09-14",
    dates: "Sep 14",
  });
  for (const range of ["7d", "90d", SEP, { from: "2026-03-01", to: "2026-03-31" }]) {
    const w = reportWindowOf(range, TODAY);
    assert.equal(reportDaysCount(w.before), w.days, `as many days before ${w.key}`);
    assert.equal(reportDaysCount({ from: w.before.to, to: w.from }), 2, `and it ends the day before ${w.key} begins`);
  }
});

test("the shortcuts are days worked out from the workspace's today, and say their name only while they still are it", () => {
  assert.deepEqual(reportShortcuts(TODAY), [
    { id: "yesterday", label: "Yesterday", days: { from: "2026-10-05", to: "2026-10-05" } },
    { id: "last-week", label: "Last week", days: { from: "2026-09-28", to: "2026-10-04" } },
    { id: "last-month", label: "Last month", days: { from: "2026-09-01", to: "2026-09-30" } },
  ]);
  // The week is Monday to Sunday, and the month before the 1st of March is all of February; a year's first days reach back a year.
  assert.deepEqual(
    reportShortcuts("2026-03-01").map((s) => s.days),
    [
      { from: "2026-02-28", to: "2026-02-28" },
      { from: "2026-02-16", to: "2026-02-22" },
      { from: "2026-02-01", to: "2026-02-28" },
    ],
  );
  assert.deepEqual(reportShortcuts("2026-01-05")[2].days, { from: "2025-12-01", to: "2025-12-31" });
  const [yesterday, week, month] = reportShortcuts(TODAY).map((s) => said(s.days));
  assert.deepEqual([yesterday.short, yesterday.said, yesterday.beside], ["Yesterday", "Yesterday", "Oct 5"]);
  assert.deepEqual([week.short, week.beside, week.days], ["Last week", "Sep 28 – Oct 4", 7]);
  assert.deepEqual([month.short, month.beside, month.days], ["Last month", "Sep 1 – Sep 30", 30]);
  // A link to yesterday, opened the day after, is the day it was: its date, and no name.
  assert.deepEqual(
    [said({ from: "2026-10-05", to: "2026-10-05" }, "2026-10-07")].map((s) => [s.short, s.said, s.beside]),
    [["Oct 5", "1 day", "1 day"]],
  );
  for (const s of reportShortcuts(TODAY)) assert.equal(reportDaysRefusal(s.days, TODAY), null, s.id);
});

test("a range has one name, which the address, a held view and a request all read back to the same range", () => {
  assert.equal(reportRangeKey("30d"), "30d");
  assert.equal(reportRangeKey(SEP), "2026-09-01~2026-09-20");
  for (const range of ["7d", "30d", "90d", "month", SEP, { from: "2026-09-15", to: "2026-09-15" }])
    assert.deepEqual(reportRangeOfKey(reportRangeKey(range)), range);
  for (const no of [
    "2026-09-20~2026-09-01", // out of order
    "2026-13-01~2026-13-02", // no such month
    "2026-02-30~2026-03-01", // no such day: a clock would roll it into March
    "2026-09-01", // half a window
    "2026-09-01~2026-09-02~2026-09-03",
    "14d",
    "",
    null,
    undefined,
  ])
    assert.equal(reportRangeOfKey(no), null, String(no));
  assert.ok(sameReportRange(SEP, { from: "2026-09-01", to: "2026-09-20" }));
  assert.ok(
    !sameReportRange("30d", { from: "2026-09-07", to: "2026-10-06" }),
    "a period is not the days it covers today",
  );
  assert.ok(isReportDays(SEP));
  for (const no of ["30d", null, {}, { from: "2026-09-01" }, { from: "2026-02-30", to: "2026-03-01" }])
    assert.ok(!isReportDays(no), JSON.stringify(no));
});

test("a window may be read when it ends on the workspace's today at the latest and holds no more days than a report reads", () => {
  assert.equal(REPORT_MOST_DAYS, 90);
  assert.equal(reportDaysCount(SEP), 20);
  assert.equal(reportDaysCount({ from: "2026-03-01", to: "2026-03-31" }), 31, "across the clocks' change");
  assert.equal(reportDaysCount({ from: "2026-10-25", to: "2026-11-02" }), 9, "and back");
  assert.equal(reportDaysRefusal(SEP, TODAY), null);
  assert.equal(reportDaysRefusal({ from: TODAY, to: TODAY }, TODAY), null, "today alone");
  assert.equal(reportDaysRefusal({ from: "2026-07-09", to: TODAY }, TODAY), null, "ninety days");
  assert.equal(reportDaysRefusal({ from: "2026-07-08", to: TODAY }, TODAY), "A report covers 90 days at most.");
  assert.equal(
    reportDaysRefusal({ from: "2026-10-01", to: "2026-10-07" }, TODAY),
    "A report ends today at the latest.",
  );
  assert.equal(reportDaysRefusal({ from: TODAY, to: "2026-10-01" }, TODAY), "from is after to.");
  for (const no of [{ from: "x", to: TODAY }, { from: "2026-02-30", to: "2026-03-01" }, { from: "2026-10-01" }])
    assert.equal(reportDaysRefusal(no, TODAY), "from and to are days, written YYYY-MM-DD.", JSON.stringify(no));
});

test("a request names a first and a last day together, or a period, never both and never half a window", () => {
  assert.deepEqual(reportRangeAsked({ from: "2026-09-01", to: "2026-09-20" }), SEP);
  assert.equal(reportRangeAsked({}), "30d");
  assert.equal(reportRangeAsked({ period: "7d" }), "7d");
  assert.equal(reportRangeAsked({ days: "90" }), "90d", "what open tabs still send");
  for (const no of [
    { from: "2026-09-01" },
    { to: "2026-09-20" },
    { from: "2026-09-01", to: "2026-09-20", period: "7d" },
    { from: "2026-09-01", to: "2026-09-20", days: "7" },
    { from: "nope", to: "2026-09-20" },
    { from: "2026-02-30", to: "2026-03-01" },
    { period: "14d" },
  ])
    assert.equal(reportRangeAsked(no), null, JSON.stringify(no));
  // Days out of order or to come are a window all the same: whether it may be read is asked of the workspace's today.
  assert.deepEqual(reportRangeAsked({ from: "2030-01-01", to: "2030-01-05" }), {
    from: "2030-01-01",
    to: "2030-01-05",
  });
});

test("the month a member picks days on says how to pick, then the first day pressed, then the days the band covers", () => {
  assert.equal(reportPickWords(null, SEP, null), "Press a first day, then a last. 90 days at most.");
  assert.equal(
    reportPickWords("2026-09-01", { from: "2026-09-01", to: "2026-09-01" }, null),
    "From Sep 1. Press the last day, or this one again for the day alone.",
  );
  assert.equal(
    reportPickWords("2026-09-12", { from: "2026-09-01", to: "2026-09-12" }, null),
    "Sep 1 – Sep 12, 12 days. Press to choose.",
    "the last day reached is before the first pressed: the band is still said in order",
  );
});

test("a day the month could not choose is said, and why, until a press chooses", () => {
  assert.equal(
    reportPickWords(null, SEP, { day: "2026-10-08", why: "to-come" }),
    "Oct 8 is still to come. Press today or a day before.",
  );
  assert.equal(
    reportPickWords("2026-06-01", { from: "2026-06-01", to: "2026-06-01" }, { day: "2026-09-20", why: "too-far" }),
    "Sep 20 is more than 90 days from Jun 1. Press a nearer day.",
  );
  assert.equal(
    reportPickWords(null, SEP, null),
    "Press a first day, then a last. 90 days at most.",
    "none refused: the words are the month's own",
  );
});
