/**
 * A message WhatsApp has been checking for over a day says so (the WhatsApp notices plan, step 4; Ruben approved the
 * design and the words on 16 Nov 2026). WhatsApp most often answers in minutes and sometimes in a day, and its pages said
 * "Being checked" for as long as it took, eight days on production's oldest. Past a day a message WhatsApp holds says
 * "Taking longer than usual" on its list, in its sheet and on a campaign step's pill, while Chanlytics asks WhatsApp again
 * and tells its own people (a-slow-review-is-asked-again.test.mjs). A version WhatsApp never got (a sample nobody sent)
 * is not one it is checking. And a message WhatsApp asked a change to reaches the phone, as the other notices that need
 * the owner do. The rules (contracts campaign-message.ts reviewSinceOf, reviewIsSlow), their words, and the phone's kinds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUSH_KINDS,
  SLOW_REVIEW_WORDS,
  campaignMessageOf,
  reviewIsSlow,
  reviewSinceOf,
  stepApprovalOf,
} from "@chanlytics/contracts";

/** Monday 16 November 2026, 3:00 PM UTC. */
const NOW = Date.parse("2026-11-16T15:00:00Z");
const HOUR = 3_600_000;
const ago = (hours) => new Date(NOW - hours * HOUR).toISOString();
/** A WhatsApp version on the page's read: in review, held by WhatsApp, last changed `hours` ago. */
const row = (hours, over = {}) => ({
  id: "w1",
  channel: "whatsapp",
  name: "booking_follow_up",
  language: "en_US",
  meta_status: "pending",
  category: "utility",
  variables: [],
  at_meta: true,
  updated_at: ago(hours),
  ...over,
});

test("past a day in review, a message WhatsApp holds is taking longer than usual; under a day it is being checked", () => {
  assert.equal(reviewIsSlow(reviewSinceOf(row(25)), NOW), true);
  assert.equal(reviewIsSlow(reviewSinceOf(row(23)), NOW), false, "a day is WhatsApp's own word for it");
  assert.equal(reviewSinceOf(row(25, { at_meta: false })), null, "a sample nobody sent is not being checked");
  assert.equal(reviewSinceOf(row(25, { meta_status: "approved" })), null, "decided: nothing to wait for");
  assert.equal(reviewSinceOf(row(25, { updated_at: null })), null, "no time on the row says nothing");
  assert.equal(reviewIsSlow(null, NOW), false);
  const message = campaignMessageOf([row(25)], "booking_follow_up", "en_US");
  assert.equal(message.versions.whatsapp.since, ago(25), "the message's version carries it for its pages");
});

test("its words, as approved: the list, the sheet, a step's pill", () => {
  assert.deepEqual(SLOW_REVIEW_WORDS, {
    list: "Taking longer than usual",
    sheet:
      "WhatsApp is taking longer than usual to check this message. Chanlytics has been told and is looking into it. It sends by itself once approved.",
    pill: "Taking longer",
  });
  assert.deepEqual(stepApprovalOf("pending", true), { label: "Taking longer", tone: "warn" });
  assert.deepEqual(stepApprovalOf("pending", false), { label: "In review", tone: "warn" }, "under a day, as before");
  assert.deepEqual(stepApprovalOf("approved", true), { label: "Approved", tone: "ok" }, "only a review is slow");
});

test("a message WhatsApp asked a change to reaches the phone, as the notices that need the owner do", () => {
  assert.ok(PUSH_KINDS.includes("template_blocked"));
  assert.ok(!PUSH_KINDS.includes("template_ready"), "news that needs nothing stays in the bell and the mail");
});
