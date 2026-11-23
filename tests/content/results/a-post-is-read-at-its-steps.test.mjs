/**
 * A post's numbers, read back from its place (the content loop PRD's 9.1, 5.3; the first-post sitting's answers 4.2):
 * at an hour, a day, 3, 7 and 28 days after it went up; each number as the place gave it, a running total; a number
 * the place does not give for the kind is "unsupported", one it keeps back for a story too few saw is "withheld", a
 * read that failed is "failed", and none of them is ever a zero.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextObserveStep, observeDueAt, OBSERVE_STEPS, POST_METRICS } from "@chanlytics/contracts";
import { instagramObservationsOf, metaInsightsRequest } from "../../../packages/channels/src/instagram/meta-results.ts";

const UP = "2026-11-21T22:19:57.000Z";
const poster = { token: "token-x", appSecret: "secret-y", accountId: "17841400000000000" };
const byMetric = (rows) => Object.fromEntries(rows.map((r) => [r.metric, r]));

test("a post is read an hour, a day, 3, 7 and 28 days after it went up, and then no more", () => {
  assert.equal(observeDueAt(UP, "1h", "picture"), "2026-11-21T23:19:57.000Z");
  assert.equal(observeDueAt(UP, "1d", "reel"), "2026-11-22T22:19:57.000Z");
  assert.equal(observeDueAt(UP, "28d", "picture"), "2026-12-19T22:19:57.000Z");
  assert.equal(nextObserveStep(null, "picture"), "1h");
  assert.equal(nextObserveStep("1h", "reel"), "1d");
  assert.equal(nextObserveStep("1d", "picture"), "3d");
  assert.equal(nextObserveStep("7d", "reel"), "28d");
  assert.equal(nextObserveStep("28d", "picture"), null);
});

test("a story is read at an hour and once more before its day is out, and never after: an ended story has no numbers", () => {
  assert.equal(observeDueAt(UP, "1h", "story"), "2026-11-21T23:19:57.000Z");
  assert.equal(
    observeDueAt(UP, "1d", "story"),
    "2026-11-22T20:19:57.000Z",
    "22 hours on: four of the half-hour sweep's passes are left before it ends",
  );
  assert.equal(nextObserveStep(null, "story"), "1h");
  assert.equal(nextObserveStep("1h", "story"), "1d");
  assert.equal(nextObserveStep("1d", "story"), null, "its day's read is its last");
});

test("one more step, off the clock: the last numbers, read just before a take-down asks the place", () => {
  assert.deepEqual([...OBSERVE_STEPS], ["1h", "1d", "3d", "7d", "28d", "last"]);
  assert.equal(nextObserveStep("28d", "picture"), null, "the clock never asks for the last: a take-down does");
});

test("Instagram is asked only the numbers it proved for the kind: a story is not asked for likes", () => {
  const picture = new URL(metaInsightsRequest(poster, "18113362325625379", "picture").url);
  assert.equal(picture.pathname.endsWith("/18113362325625379/insights"), true);
  assert.equal(picture.searchParams.get("metric"), "reach,views,likes,comments,saved,shares");
  const story = new URL(metaInsightsRequest(poster, "18137384053594518", "story").url);
  assert.equal(story.searchParams.get("metric"), "reach,views,shares");
});

test("the picture's numbers at an hour, as Meta gave them, each a running total; the rest not given", () => {
  const json = {
    data: [
      { name: "reach", period: "lifetime", values: [{ value: 1 }] },
      { name: "views", period: "lifetime", values: [{ value: 7 }] },
      { name: "likes", period: "lifetime", values: [{ value: 1 }] },
      { name: "comments", period: "lifetime", values: [{ value: 3 }] },
      { name: "saved", period: "lifetime", values: [{ value: 0 }] },
      { name: "shares", period: "lifetime", values: [{ value: 0 }] },
    ],
  };
  const rows = byMetric(instagramObservationsOf({ outcome: "ok", status: 200, json }, "picture"));
  assert.deepEqual(Object.keys(rows).sort(), [...POST_METRICS].sort(), "a row for every number, said or not");
  assert.deepEqual(rows.reach, { metric: "reach", value: 1, availability: "available" });
  assert.deepEqual(rows.saves, { metric: "saves", value: 0, availability: "available" }, "Meta's saved is our saves");
  assert.equal(rows.comments.value, 3, "Instagram's count, the business's own replies in it");
  for (const metric of ["link_opens", "profile_visits", "follows"])
    assert.deepEqual(rows[metric], { metric, value: null, availability: "unsupported" });
});

test("a story too few people saw has no numbers: withheld, never a zero and never a failed read", () => {
  const json = {
    error: { code: 10, message: "(#10) Not enough viewers for the media to show insights", type: "OAuthException" },
  };
  const rows = byMetric(instagramObservationsOf({ outcome: "refused", status: 400, json }, "story"));
  for (const metric of ["reach", "views", "shares"])
    assert.deepEqual(rows[metric], { metric, value: null, availability: "withheld" });
  assert.equal(rows.likes.availability, "unsupported", "a story has no likes to give");
});

test("a read that got no answer, or was refused for another reason, is failed for what was asked", () => {
  for (const answer of [
    { outcome: "unreachable", status: null, json: null },
    { outcome: "refused", status: 400, json: { error: { code: 100, message: "Invalid parameter" } } },
  ]) {
    const rows = byMetric(instagramObservationsOf(answer, "reel"));
    assert.equal(rows.reach.availability, "failed");
    assert.equal(rows.reach.value, null);
    assert.equal(rows.follows.availability, "unsupported");
  }
});

test("a number Meta answers without a value is not a zero", () => {
  const json = { data: [{ name: "reach", period: "lifetime", values: [] }] };
  const rows = byMetric(instagramObservationsOf({ outcome: "ok", status: 200, json }, "reel"));
  assert.deepEqual(rows.reach, { metric: "reach", value: null, availability: "delayed" });
  assert.equal(rows.views.availability, "delayed", "asked and not in the answer: not there yet");
});
