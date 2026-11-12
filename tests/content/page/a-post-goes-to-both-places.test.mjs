/**
 * One draft sends a post to Instagram and to Google (campaigns/content/model/post-both.ts). What stops a send is said once, for the
 * place it is about. Its words are the piece's caption, trimmed as the sheet sends them; a time is picked in the sheet's own
 * Schedule (broadcasts/when.tsx), never written into the draft. And where the piece stands, said once (model/places.ts): the one
 * sentence of its status row, what needs the owner first, and the places its list draws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_WORDS as W } from "@chanlytics/contracts";
import { pieceNextOf } from "../../../apps/dashboard/src/surfaces/campaigns/content/model/piece-open.ts";
import { pieceStatusOf, placesOf } from "../../../apps/dashboard/src/surfaces/campaigns/content/model/places.ts";
import {
  postBothBegins,
  postBothProblemOf,
} from "../../../apps/dashboard/src/surfaces/campaigns/content/model/post-both.ts";

const draft = (over = {}) => ({ instagram: true, google: true, as: "picture", ...over });
const WORDS = "Saturdays fill first.";

test("it begins with every place that can take it switched on, on Instagram as a post, and holds no time", () => {
  assert.deepEqual(postBothBegins({ instagram: true, google: false }), {
    instagram: true,
    google: false,
    as: "picture",
  });
});

test("nothing switched on cannot be sent", () => {
  assert.equal(postBothProblemOf(draft({ instagram: false, google: false }), WORDS), W.post.nowhere);
});

test("a post needs words; a story alone does not", () => {
  assert.equal(postBothProblemOf(draft(), ""), W.post.wordsNeeded);
  assert.equal(postBothProblemOf(draft({ google: false, as: "story" }), ""), null);
  assert.equal(postBothProblemOf(draft(), WORDS), null);
});

test("Google's limit is said for Google", () => {
  assert.equal(postBothProblemOf(draft({ instagram: false }), "x".repeat(1501)), W.post.tooLongForGoogle);
  assert.equal(postBothProblemOf(draft(), "x".repeat(1501)), W.post.tooLongForGoogle);
});

/* ---------------------------------------------------------------- where it stands, said once */

const NOW = Date.parse("2026-11-11T15:00:00.000Z");
const post = (place, status, over = {}) => ({
  id: `${place}-${status}`,
  place,
  kind: "picture",
  caption: null,
  status,
  held_reason: null,
  permalink: null,
  scheduled_for: "2026-11-11T15:00:00.000Z",
  published_at: status === "published" ? "2026-11-09T15:02:00.000Z" : null,
  error: null,
  created_at: "2026-11-11T15:00:00.000Z",
  ...over,
});
/** A post set for Saturday morning: one that waits for its time. */
const waits = (place, over = {}) =>
  post(place, "queued", { id: `${place}-later`, scheduled_for: "2026-11-14T14:00:00.000Z", ...over });
const BOTH = { instagram: true, google: true };
const PICTURE = { kind: "image", source: "made" };
/** The business's clock, as the open piece hands it: a day and a time ahead, in words. */
const CLOCK = { day: () => "Monday", ahead: () => "Sat, 9:00 AM" };
/** The status row of a made post with these posts, its next step read from them as the open piece reads it. */
const statusOf = (posts, takes = BOTH) => pieceStatusOf(posts, pieceNextOf(PICTURE, posts, takes, NOW), CLOCK, NOW);

test("the status row says one sentence: ready, going up, set for its time, or where it is up", () => {
  assert.deepEqual(statusOf([]), { tone: "ready", said: "Ready to post", pull: null });
  assert.deepEqual(statusOf([post("instagram", "queued")]), {
    tone: "going",
    said: "Posting to Instagram",
    pull: "instagram-queued",
  });
  assert.equal(statusOf([post("instagram", "publishing")]).pull, null, "too late to stop");
  assert.deepEqual(statusOf([waits("instagram", { kind: "story" })]), {
    tone: "going",
    said: "Story goes up Sat, 9:00 AM",
    pull: "instagram-later",
  });
  assert.deepEqual(statusOf([post("instagram", "published"), post("google", "published")]), {
    tone: "up",
    said: "On Instagram and Google · Monday",
    pull: null,
  });
});

test("a post going up says the tile's own words for it", () => {
  assert.equal(statusOf([post("google", "queued")]).said, W.mark.going("google"));
});

test("what needs the owner is said before a post that waits, as the act that leads is chosen", () => {
  const posts = [post("instagram", "failed"), waits("google")];
  assert.deepEqual(pieceNextOf(PICTURE, posts, BOTH, NOW), { is: "again", place: "instagram" });
  assert.deepEqual(statusOf(posts), { tone: "need", said: W.mark.stuck, pull: null });
});

const CAN = {
  takes: BOTH,
  wont: { instagram: null, google: null },
  offers: { instagram: true, google: true },
};

test("the list holds each place the workspace is offered, with where the piece stands there and what it can take", () => {
  const places = placesOf([post("instagram", "published"), waits("google")], CAN, NOW);
  assert.deepEqual(
    places.map((at) => [at.place, at.stands.is, at.pull]),
    [
      ["instagram", "up", null],
      ["google", "timed", "google-later"],
    ],
  );
  const unconnected = placesOf(
    [],
    { ...CAN, takes: { instagram: true, google: false }, wont: { instagram: null, google: "Connect it first." } },
    NOW,
  );
  assert.deepEqual(
    unconnected.map((at) => [at.place, at.takes, at.wont]),
    [
      ["instagram", true, null],
      ["google", false, "Connect it first."],
    ],
    "a place that is not connected is listed, with why it can take none",
  );
});

test("a place the workspace is not offered is left out, unless the piece already stands there", () => {
  const noInstagram = { ...CAN, takes: { instagram: false, google: true }, offers: { instagram: false, google: true } };
  assert.deepEqual(
    placesOf([], noInstagram, NOW).map((at) => at.place),
    ["google"],
  );
  assert.deepEqual(
    placesOf([post("instagram", "published")], noInstagram, NOW).map((at) => [at.place, at.stands.is]),
    [
      ["instagram", "up"],
      ["google", "none"],
    ],
    "a post that went up while it was offered is still the piece's",
  );
});
