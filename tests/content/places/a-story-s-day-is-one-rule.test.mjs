/**
 * A story's day is one rule, and the code's half of it (the content status review of 24 Nov 2026, C3): contracts
 * storyRanItsDay answers each case of the table the database's rule is held to as well (_story-day-cases.mjs;
 * post_story_ended, 00716, in a-story-s-day-is-one-rule.db.test.mjs). This file needs no database, so a change to the
 * code's rule alone fails here, on the pull request that makes it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { storyRanItsDay } from "@chanlytics/contracts";
import { ASKED_AT, STORY_DAY_CASES } from "./_story-day-cases.mjs";

const AT = Date.parse(ASKED_AT);
const DAY = 86_400_000;

test("the code's rule answers every case of the story-day table", () => {
  for (const { name, post, ended } of STORY_DAY_CASES) assert.equal(storyRanItsDay(post, AT), ended, name);
});

test("the table names the edge itself, both ways a story's day is counted", () => {
  // How long before the moment asked each story's day began, by the time it went up or, without one, the time it was
  // set for: the table must hold the last moment of a day and the millisecond before it, for each.
  const edges = STORY_DAY_CASES.filter(({ post }) => post.kind === "story")
    .map(({ post, ended }) => ({
      dated: post.published_at !== null,
      short: DAY - (AT - Date.parse(post.published_at ?? post.scheduled_for)),
      ended,
    }))
    .filter(({ short }) => short === 0 || short === 1);
  assert.deepEqual(edges, [
    { dated: true, short: 1, ended: false },
    { dated: true, short: 0, ended: true },
    { dated: false, short: 0, ended: true },
    { dated: false, short: 1, ended: false },
  ]);
});
