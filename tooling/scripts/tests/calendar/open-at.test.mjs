/**
 * "Were they open then?" has one answer (spec A2): a day's hours as dayIntervals reads them, and never on a closure.
 * Reports asks it for each quarter hour something came in. 14 Sep 2026 is a Monday.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openAt, hasHours } from "@chanlytics/contracts";

const hours = {
  mon: { open: "09:30", close: "18:00" },
  tue: {
    intervals: [
      { open: "09:30", close: "13:00" },
      { open: "15:00", close: "19:00" },
    ],
  },
  sun: {},
};
const at = (h, m = 0) => h * 60 + m;

test("open inside the day's hours; closed before it opens and from the minute it closes", () => {
  assert.equal(openAt(hours, [], "2026-09-14", at(9, 15)), false);
  assert.equal(openAt(hours, [], "2026-09-14", at(9, 30)), true);
  assert.equal(openAt(hours, [], "2026-09-14", at(17, 45)), true);
  assert.equal(openAt(hours, [], "2026-09-14", at(18, 0)), false);
});

test("a split shift is closed over lunch; a day with no hours, or not in the week, is closed", () => {
  assert.equal(openAt(hours, [], "2026-09-15", at(14)), false);
  assert.equal(openAt(hours, [], "2026-09-15", at(15)), true);
  assert.equal(openAt(hours, [], "2026-09-20", at(12)), false, "Sunday has no hours");
  assert.equal(openAt(hours, [], "2026-09-16", at(12)), false, "Wednesday is not in the week");
});

test("a closure shuts every day it covers, its until included; a reversed one shuts its date only", () => {
  const closures = [{ date: "2026-09-14", until: "2026-09-15" }];
  assert.equal(openAt(hours, closures, "2026-09-14", at(12)), false);
  assert.equal(openAt(hours, closures, "2026-09-15", at(10)), false);
  assert.equal(openAt(hours, closures, "2026-09-21", at(12)), true, "the Monday after");
  const reversed = [{ date: "2026-09-21", until: "2026-09-14" }];
  assert.equal(openAt(hours, reversed, "2026-09-21", at(12)), false);
  assert.equal(openAt(hours, reversed, "2026-09-15", at(10)), true);
});

test("a workspace that never said its hours has none: that is unknown, never always closed", () => {
  assert.equal(hasHours(undefined), false);
  assert.equal(hasHours({ sun: {} }), false);
  assert.equal(hasHours(hours), true);
});
