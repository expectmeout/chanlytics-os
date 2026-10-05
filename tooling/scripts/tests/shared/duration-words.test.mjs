/**
 * A length of time is said one way on every page (the Reports lenses spec, A5): Today's measured median said "1m 5s"
 * and Reports said "1m 05s". Seconds under ten minutes, whole minutes under an hour, then hours and minutes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { durationWords, fmtSeconds } from "@chanlytics/contracts";

test("seconds under ten minutes, whole minutes under an hour, then hours and minutes", () => {
  const cases = [
    [0, "0s"],
    [41, "41s"],
    [59.6, "1m"],
    [60, "1m"],
    [65, "1m 5s"],
    [72, "1m 12s"],
    [599, "9m 59s"],
    [600, "10m"],
    [3570, "1h"],
    [3600, "1h"],
    [3900, "1h 5m"],
    [7800, "2h 10m"],
  ];
  for (const [s, words] of cases) assert.equal(durationWords(s), words, `${s} seconds`);
});

test("Reports' fmtSeconds says what durationWords says, and a dash for nothing", () => {
  for (const s of [5, 65, 72, 600, 3900]) assert.equal(fmtSeconds(s), durationWords(s));
  assert.equal(fmtSeconds(null), "—");
  assert.equal(fmtSeconds(Number.NaN), "—");
});
