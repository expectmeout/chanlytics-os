/**
 * Content's one line on Today (the content redesign's stage 3): only where there is something to say, what needs the owner
 * first, then what is being made, then the next post set for its time today or tomorrow; a business with nothing waiting is
 * told nothing. Each line opens the view of Made it is about.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_NOTE_WORDS as W, contentNoteOf, contentNoteRouteOf } from "@chanlytics/contracts";

const NOW = Date.parse("2026-11-11T15:00:00.000Z");
const HOUR = 3_600_000;
const next = (inHours) => ({ at: new Date(NOW + inHours * HOUR).toISOString(), place: "google" });

test("what needs the owner first, then what is being made, then the next post, and nothing when nothing waits", () => {
  assert.deepEqual(contentNoteOf({ needs: 2, making: 1, next: next(3) }, NOW), { is: "needs", count: 2 });
  assert.deepEqual(contentNoteOf({ needs: 0, making: 1, next: next(3) }, NOW), { is: "making", count: 1 });
  assert.deepEqual(contentNoteOf({ needs: 0, making: 0, next: next(3) }, NOW), { is: "next", ...next(3) });
  assert.equal(
    contentNoteOf({ needs: 0, making: 0, next: next(72) }, NOW),
    null,
    "a post three days on is no news today",
  );
  assert.equal(contentNoteOf({ needs: 0, making: 0, next: null }, NOW), null);
});

test("each line in the owner's words, opening the view it is about", () => {
  assert.equal(W.headline({ is: "needs", count: 1 }, ""), "A post needs you");
  assert.equal(W.headline({ is: "needs", count: 3 }, ""), "3 posts need you");
  assert.equal(W.headline({ is: "making", count: 2 }, ""), "2 videos are being made");
  assert.equal(W.headline({ is: "next", ...next(3) }, "today at 6 PM"), "A post goes up on Google today at 6 PM");
  assert.equal(contentNoteRouteOf({ is: "needs", count: 1 }), "campaigns/content:needs");
  assert.equal(contentNoteRouteOf({ is: "making", count: 1 }), "campaigns/content:making");
  assert.equal(contentNoteRouteOf({ is: "next", ...next(3) }), "campaigns/content:scheduled");
});
