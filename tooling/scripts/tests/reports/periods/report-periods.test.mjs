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
  zoneDayKey,
} from "@chanlytics/contracts";

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

test("the days parameter ends on 19 October 2026: the change that removes it deletes its branch in report-periods.ts and this test", (t) => {
  assert.equal(reportPeriodOf({ days: "30" }), "30d", "still read, for the tabs and the head's old prefetch");
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = new Date(Date.parse(`${REMOVE_AFTER}T00:00:00Z`) + GRACE_DAYS * DAY_MS).toISOString().slice(0, 10);
  if (today > REMOVE_AFTER)
    t.diagnostic(`its day (${REMOVE_AFTER}) has passed: remove the days parameter from the three report routes`);
  assert.ok(
    today <= lastDay,
    `the days parameter's day (${REMOVE_AFTER}) passed more than ${GRACE_DAYS} days ago: remove it (report-periods.ts reportPeriodOf, the three routes' query) and this test`,
  );
});
