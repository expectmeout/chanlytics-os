/**
 * A report over days that ended before today, in contracts' own words (reports.ts, calendar-people.ts, google.ts,
 * review-report.ts, campaigns/reach-out-lens.ts). Every report ended on the workspace's today until a member could pick its
 * days (00359); one that ended earlier says so wherever a sentence says when: by its dates where it is named, "in the
 * 7 days to Sep 4" where something happened in it, never "the last 7 days", which would claim days the report did not
 * read. A period by name says what it always said. What the database counts over a window is
 * report-window.db.test.mjs's, over a real one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKED_NEEDS_TODAY,
  endedOn,
  toBookingReportVM,
  toGoogleVM,
  toReachOutLensVM,
  toReportVM,
  toReviewsReportVM,
} from "@chanlytics/contracts";
import { REVIEWS_NOW, reportDto, reviewsDto, reviewsGoogle } from "../_report-world.mjs";

test("a report ended before today only where it names a last day earlier than the workspace's today", () => {
  assert.equal(endedOn({ today: "2026-10-06", end: "2026-09-20" }), "2026-09-20");
  assert.equal(endedOn({ today: "2026-10-06", end: "2026-10-06" }), null, "its last day is today: it ends today");
  assert.equal(endedOn({ today: "2026-10-06" }), null, "a database from before 00359 names no day");
  assert.equal(endedOn({ today: "2026-10-06", end: null }), null);
});

test("the report names days that ended by their dates and says when in them, and a period that ends today as it always did", () => {
  // The fixture's week, Sat Aug 29 to Fri Sep 4, read on the day it ends and read six days later.
  const live = toReportVM(reportDto(), { profile: null });
  assert.deepEqual(
    [live.live, live.end, live.today, live.period],
    [
      true,
      "2026-09-04",
      "2026-09-04",
      { now: "Last 7 days", before: "The 7 days before", within: "in the last 7 days" },
    ],
  );
  const ended = toReportVM(reportDto({ today: "2026-09-10", end: "2026-09-04" }), { profile: null });
  assert.deepEqual(
    [ended.live, ended.end, ended.today, ended.period],
    [
      false,
      "2026-09-04",
      "2026-09-10",
      { now: "Aug 29 – Sep 4", before: "The 7 days before", within: "in the 7 days to Sep 4" },
    ],
    "REGRESSION: days a member picked were called the last 7 days",
  );
  assert.equal(ended.rangeLabel, "7 days", "how long it is, is said the same either way");
  // The numbers are the series' own, whichever day it is read on.
  assert.deepEqual(
    ended.tiles.map((t) => [t.id, t.value]),
    live.tiles.map((t) => [t.id, t.value]),
  );
  assert.equal(ended.lines.hero, live.lines.hero);
  // One day that ended is that day.
  const one = toReportVM(
    reportDto({ days: 1, span_days: 2, today: "2026-09-10", end: "2026-09-04", series: reportDto().series.slice(-2) }),
    { profile: null },
  );
  assert.deepEqual(one.period, { now: "Sep 4", before: "The day before", within: "on Sep 4" });
});

test("asked, then booked is not counted for days that ended: it follows people as they stand today, and says so", () => {
  const vm = toBookingReportVM({ calendar: "ended", days: 20, asked: 0, booked: 0 });
  assert.deepEqual(
    [vm.present, vm.calendar, vm.headline, vm.sub, vm.pct],
    [false, "ended", "Not counted for these days", BOOKED_NEEDS_TODAY, null],
  );
  assert.equal(
    BOOKED_NEEDS_TODAY,
    "It follows people as they stand today, so it is only true of a period that ends today.",
  );
  assert.equal(vm.words, "", "and no sentence is made of a count that was not taken");
});

test("what the listing gained over days that ended is counted to their last reading, and said to that day", () => {
  // Google's count, read on five days: 200 before the window, 205 on its last day, and 212 by today.
  const readings = [
    { day: "2026-08-21", rating: 4.7, review_count: 200 },
    { day: "2026-08-24", rating: 4.7, review_count: 203 },
    { day: "2026-08-28", rating: 4.8, review_count: 205 },
    { day: "2026-09-02", rating: 4.8, review_count: 210 },
    { day: "2026-09-04", rating: 4.8, review_count: 212 },
  ];
  const gained = (until) =>
    toGoogleVM(reviewsGoogle({ days: readings }), { days: 7, until: until }, REVIEWS_NOW, "America/New_York").gained;
  assert.deepEqual(
    [gained(null).total, gained(null).words],
    [7, { value: "7", meta: "new ratings, words or not", head: "7 ratings gained in the last 7 days" }],
    "seven days to today: 212 less the 205 before them",
  );
  const ended = gained("2026-08-28");
  assert.deepEqual(
    [ended.total, ended.words],
    [5, { value: "5", meta: "new ratings to Aug 28, words or not", head: "5 ratings gained in the 7 days to Aug 28" }],
    "seven days to Aug 28: 205 less the 200 before them, and nothing read after them",
  );
  assert.equal(ended.points.at(-1).day, "2026-08-28", "the last point is the window's last day");
});

test("the reviews written over days that ended are those days', and every line says so", () => {
  // Thirty days to Aug 20 (Jul 22 to Aug 20): five were written in them, two of those are answered, four at 4 or 5 stars.
  const vm = toReviewsReportVM(reviewsDto({ days: 30, end: "2026-08-20" }), { nowMs: REVIEWS_NOW });
  assert.equal(vm.lines.head, "4.8 on Google from 213 reviews; 5 new in the 30 days to Aug 20, 2 answered.");
  assert.equal(vm.lines.mix, "4 of the 5 reviews written in the 30 days to Aug 20 are 4 or 5 stars.");
  assert.equal(vm.lines.weekly, "5 written in the 30 days to Aug 20");
  // The same record over the thirty days to today: six, three answered, in the words it always had.
  const live = toReviewsReportVM(reviewsDto({ days: 30 }), { nowMs: REVIEWS_NOW });
  assert.equal(live.lines.head, "4.8 on Google from 213 reviews; 6 new in the last 30 days, 3 answered.");
  assert.equal(live.lines.weekly, "6 written in the last 30 days");
});

test("an empty period of reach-outs says which days nothing was written in", () => {
  const none = {
    timezone: "America/Chicago",
    days: 20,
    today: "2026-10-06",
    since: "2026-09-01",
    has_reach_out: true,
    totals: { written: 0, delivered: 0, bounced: 0, wrote_back: 0, interested: 0, booked: 0, said_no: 0, handed: 0 },
    series: [],
    chains: [],
    angles: [],
    no_angle: 0,
    mailboxes: [],
  };
  const words = (dto) => toReachOutLensVM(dto).lines.empty;
  assert.equal(words({ ...none, end: "2026-09-20" }), "No reach-out wrote in the 20 days to Sep 20.");
  assert.equal(words({ ...none, days: 30 }), "No reach-out wrote in the last 30 days.");
  assert.equal(
    words({ ...none, end: "2026-10-06" }),
    "No reach-out wrote in the last 20 days.",
    "its last day is today",
  );
});
