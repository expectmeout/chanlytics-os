/**
 * The periods Reports offers and how a request names one (contracts reports/report-periods.ts over REPORT_RANGES): Month is
 * the days since the 1st in the workspace's own zone, today included; `period` names one, and `days`, which every page sent
 * before there was a Month, is read until its day, which this file holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  REPORT_PERIOD_DEFAULT,
  REPORT_RANGES,
  fixedDaysOf,
  isReportPeriod,
  monthDaysAt,
  reportDaysAsked,
  reportPeriodOf,
  reportWindowOf,
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
    return [w.from, w.to, w.range, w.said];
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
