/**
 * The plan proposes asking every client for a review (the content loop's pass 6; the PRD's 10.5; the content canvas's
 * Loop4, approved 24 Nov 2026): where more reviews is a goal the owner set, or no new review has come on Google in 30 days;
 * never where the business has no review link, an ask already runs, or the owner said Not now in the last 30 days. Its
 * Approve starts the live after-visit ask by its starter; a review itself is never made into a post here. Pure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REVIEW_ASK_START, reviewAskLineOf, reviewAskOf, reviewAskWordsOf, starterByKey } from "@chanlytics/contracts";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const days = (n) => new Date(NOW - n * 86_400_000).toISOString();
const facts = (over = {}) => ({
  goal: false,
  newestReviewAt: days(40),
  reviewLink: true,
  askOn: false,
  restedAt: null,
  word: "visit",
  ...over,
});

test("proposed for a goal the owner set, or for reviews that stopped coming 30 days ago; said with why and when", () => {
  assert.deepEqual(reviewAskOf(facts(), NOW), { why: "quiet", word: "visit" });
  assert.deepEqual(
    reviewAskOf(facts({ newestReviewAt: null }), NOW),
    { why: "quiet", word: "visit" },
    "never a review at all",
  );
  assert.equal(reviewAskOf(facts({ newestReviewAt: days(12) }), NOW), null, "reviews still come: nothing to propose");
  assert.deepEqual(reviewAskOf(facts({ goal: true, newestReviewAt: days(2) }), NOW), { why: "goal", word: "visit" });
  assert.equal(
    reviewAskLineOf({ why: "quiet", word: "visit" }),
    "No new review on Google in 30 days · the day after each visit",
  );
});

test("never where it could not run, already runs, or rests after Not now; back after 30 days", () => {
  assert.equal(reviewAskOf(facts({ reviewLink: false }), NOW), null, "no review link: the message has nothing to send");
  assert.equal(reviewAskOf(facts({ askOn: true }), NOW), null, "a campaign that asks for one already runs");
  assert.equal(reviewAskOf(facts({ restedAt: days(5) }), NOW), null, "Not now five days ago");
  assert.deepEqual(
    reviewAskOf(facts({ restedAt: days(31) }), NOW),
    { why: "quiet", word: "visit" },
    "the rest is over",
  );
});

test("its Approve starts the live after-visit ask, its slots the client's name, the business and the review link", () => {
  assert.equal(REVIEW_ASK_START.trigger, "visited");
  const starter = starterByKey(REVIEW_ASK_START.starter_key);
  assert.ok(starter, "the starter is live");
  assert.equal(starter.trigger, "visited");
  assert.deepEqual(
    REVIEW_ASK_START.params.map((p) => p.kind),
    ["first_name", "business_name", "review_link"],
  );
});

test("its words say what the workspace calls an appointment, in two sentences a screen holds, and never only the happy ones", () => {
  const appointment = reviewAskWordsOf("appointment");
  assert.equal(appointment.head, "The day after an appointment");
  assert.equal(
    reviewAskLineOf({ why: "goal", word: "lesson" }),
    "More reviews is a goal you set · the day after each lesson",
  );
  assert.equal(
    appointment.says.quiet,
    "No new review on Google in 30 days. This asks every client the day after a kept appointment, with your review link.",
  );
  for (const word of ["appointment", "visit", "meeting", "session", "lesson"])
    for (const line of Object.values(reviewAskWordsOf(word).says)) assert.ok(line.length <= 120, line);
  assert.deepEqual(appointment.facts, [
    "Every client, never only the happy ones",
    "On WhatsApp, once for each appointment",
    "Asks you before it first sends",
  ]);
});
