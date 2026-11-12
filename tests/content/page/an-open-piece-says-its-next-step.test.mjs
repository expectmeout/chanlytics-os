/**
 * An open piece has one act that leads (campaigns/content/model/piece-open.ts): what needs the owner first, then what is moving, then the
 * next place it can go. A video goes nowhere from here yet, so its step is to save it. And where it stands at each place,
 * and who stands beside it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pieceBesideOf,
  pieceNextOf as nextOf,
  pieceStandsAt,
  pieceTimedOf,
} from "../../../apps/dashboard/src/surfaces/campaigns/content/model/piece-open.ts";

const NOW = Date.parse("2026-11-11T14:00:00.000Z");
const pieceNextOf = (file, posts, takes) => nextOf(file, posts, takes, NOW);

const post = (place, status, over = {}) => ({
  id: `${place}-${status}`,
  place,
  kind: "picture",
  caption: null,
  status,
  held_reason: null,
  permalink: null,
  scheduled_for: "2026-11-11T14:00:00.000Z",
  published_at: status === "published" ? "2026-11-09T15:02:00.000Z" : null,
  error: null,
  created_at: "2026-11-11T14:00:00.000Z",
  ...over,
});
const BOTH = { instagram: true, google: true };
const picture = { kind: "image", source: "made" };

test("nothing out yet: Post, where a place can take it", () => {
  assert.deepEqual(pieceNextOf(picture, [], BOTH), { is: "post" });
  assert.deepEqual(pieceNextOf(picture, [], { instagram: false, google: false }), { is: "none" });
  assert.deepEqual(
    pieceNextOf(picture, [], null),
    { is: "post" },
    "before the record is read, the press is still offered",
  );
});

test("out at one place: the next place is the step", () => {
  assert.deepEqual(pieceNextOf(picture, [post("instagram", "published")], BOTH), { is: "post_to", place: "google" });
  assert.deepEqual(pieceNextOf(picture, [post("instagram", "published")], { instagram: true, google: false }), {
    is: "none",
  });
  assert.deepEqual(
    pieceNextOf(picture, [post("instagram", "published")], null),
    { is: "none" },
    "it never guesses a place",
  );
});

test("what needs the owner comes before what is done", () => {
  const posts = [post("instagram", "failed"), post("google", "published")];
  assert.deepEqual(pieceNextOf(picture, posts, BOTH), { is: "again", place: "instagram" });
});

test("one on its way says so, and whether it can still be stopped", () => {
  assert.deepEqual(pieceNextOf(picture, [post("instagram", "queued")], BOTH), {
    is: "going",
    place: "instagram",
    pull: "instagram-queued",
  });
  assert.deepEqual(pieceNextOf(picture, [post("instagram", "publishing")], BOTH), {
    is: "going",
    place: "instagram",
    pull: null,
  });
});

test("a video's step is to save it", () => {
  assert.deepEqual(pieceNextOf({ kind: "video", source: "made" }, [], BOTH), { is: "save" });
});

test("where it stands at a place, from the newest post there", () => {
  const now = Date.parse("2026-11-11T14:00:00.000Z");
  assert.deepEqual(pieceStandsAt([], "google", now), { is: "none" });
  assert.deepEqual(pieceStandsAt([post("google", "published")], "google", now), {
    is: "up",
    at: "2026-11-09T15:02:00.000Z",
  });
  assert.deepEqual(pieceStandsAt([post("instagram", "held", { held_reason: "It waits." })], "instagram", now), {
    is: "stuck",
    why: "It waits.",
  });
  assert.deepEqual(
    pieceStandsAt([post("instagram", "queued", { scheduled_for: "2026-11-12T23:00:00.000Z" })], "instagram", now),
    { is: "timed", at: "2026-11-12T23:00:00.000Z" },
  );
  assert.deepEqual(pieceStandsAt([post("instagram", "queued")], "instagram", now), { is: "going" });
  assert.deepEqual(
    pieceStandsAt([post("instagram", "pulled")], "instagram", now),
    { is: "none" },
    "a post stopped is none",
  );
});

test("who stands beside a piece, in the order the page holds", () => {
  const made = ["a", "b", "c"].map((id) => ({ file: { id } }));
  assert.deepEqual(pieceBesideOf(made, "b"), { at: 2, of: 3, before: "a", after: "c" });
  assert.deepEqual(pieceBesideOf(made, "a"), { at: 1, of: 3, before: null, after: "b" });
  assert.equal(pieceBesideOf(made, "z"), null);
});

test("a post that waits for its time leads with nothing of its own, and the next place still leads", () => {
  const timed = post("instagram", "queued", { kind: "story", scheduled_for: "2026-11-12T23:00:00.000Z" });
  const posts = [post("instagram", "published"), timed];
  assert.deepEqual(pieceNextOf(picture, posts, BOTH), { is: "post_to", place: "google" });
  assert.equal(pieceTimedOf(posts, NOW), timed, "it is said apart, with its Don't post");
  assert.equal(pieceTimedOf([post("instagram", "queued")], NOW), null, "one going up now is no timed post");
});

test("a place where a post waits for its time is taken: the step is the other place", () => {
  const timed = post("instagram", "queued", { kind: "story", scheduled_for: "2026-11-12T23:00:00.000Z" });
  assert.deepEqual(pieceNextOf(picture, [timed], BOTH), { is: "post_to", place: "google" });
  assert.deepEqual(pieceNextOf(picture, [timed], { instagram: true, google: false }), { is: "none" });
});

/** A photo of the library: uploaded, kept, its look done, no one in it to ask about. */
const photo = (over = {}) => ({
  kind: "image",
  source: "upload",
  status: "filed",
  shows: "work",
  media_status: null,
  who_in_it: "not_asked",
  look_status: "done",
  people: { count: 0, recognizable: 0 },
  ...over,
});

test("a library file is kept where it waits, then made into a post, and asks first who is in it", () => {
  assert.deepEqual(pieceNextOf(photo({ status: "inbox" }), [], null), { is: "keep" });
  assert.deepEqual(pieceNextOf(photo(), [], null), { is: "make" });
  assert.deepEqual(
    pieceNextOf(photo({ people: { count: 2, recognizable: 2 } }), [], null),
    { is: "none" },
    "who is in it is asked first",
  );
  assert.deepEqual(pieceNextOf(photo({ status: "set_aside" }), [], null), { is: "none" });
});
