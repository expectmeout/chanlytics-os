/**
 * One draft sends a post to Instagram and to Google (campaigns/content/model/post-both.ts). What stops a send is said once, for the place it
 * is about; a time is offered only where every place that is on can keep one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_WORDS as W } from "@chanlytics/contracts";
import {
  postBothBegins,
  postBothProblemOf,
  postTimesOf,
} from "../../../apps/dashboard/src/surfaces/campaigns/content/model/post-both.ts";

const draft = (over = {}) => ({
  instagram: true,
  google: true,
  as: "picture",
  words: "Saturdays fill first.",
  when: null,
  ...over,
});

test("it begins from what the picture says, every place that can take it switched on", () => {
  const plan = { line: "Saturdays fill first", under: "Two chairs left this week" };
  assert.deepEqual(postBothBegins(plan, { instagram: true, google: false }), {
    instagram: true,
    google: false,
    as: "picture",
    words: "Saturdays fill first. Two chairs left this week.",
    when: null,
  });
});

test("nothing switched on cannot be sent", () => {
  assert.equal(postBothProblemOf(draft({ instagram: false, google: false })), W.post.nowhere);
});

test("a post needs words; a story alone does not", () => {
  assert.equal(postBothProblemOf(draft({ words: "  " })), W.post.wordsNeeded);
  assert.equal(postBothProblemOf(draft({ words: "", google: false, as: "story" })), null);
  assert.equal(postBothProblemOf(draft()), null);
});

test("Google's limit is said for Google", () => {
  assert.equal(postBothProblemOf(draft({ words: "x".repeat(1501), instagram: false })), W.post.tooLongForGoogle);
  assert.equal(postBothProblemOf(draft({ words: "x".repeat(1501) })), W.post.tooLongForGoogle);
});

test("a time is kept only while Google is off", () => {
  // Google keeps a time too (00616): a time with both places on stops nothing.
  assert.equal(postBothProblemOf(draft({ when: "2026-11-12T14:00:00.000Z" })), null);
  assert.equal(postBothProblemOf(draft({ when: "2026-11-12T14:00:00.000Z", google: false })), null);
});

test("the times offered are this evening and tomorrow morning, by the business's clock", () => {
  // 10:00 in New York on Wednesday 11 November 2026 (UTC-5).
  const now = Date.parse("2026-11-11T15:00:00.000Z");
  assert.deepEqual(postTimesOf(now, "America/New_York"), {
    evening: "2026-11-11T23:00:00.000Z",
    morning: "2026-11-12T14:00:00.000Z",
  });
  // 17:45 there: this evening is too near to offer.
  assert.equal(postTimesOf(Date.parse("2026-11-11T22:45:00.000Z"), "America/New_York").evening, null);
});
