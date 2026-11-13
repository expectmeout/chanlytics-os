/**
 * One draft sends a post to Instagram and to Google (campaigns/content/model/post-both.ts). What stops a send is said once, for the
 * place it is about. Its words are the piece's caption, trimmed as the sheet sends them; a time is picked in the sheet's own
 * Schedule (broadcasts/when.tsx), never written into the draft. And where the piece stands, said once (model/places.ts): the one
 * sentence of its status row, what needs the owner first, and the places its list draws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_WORDS as W, postPlaceTakenOf } from "@chanlytics/contracts";
import {
  instagramAsOf,
  instagramKindsFree,
  pieceNextOf,
  pieceTakesOf,
} from "../../../apps/dashboard/src/surfaces/campaigns/content/model/piece-open.ts";
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
    tone: "timed",
    said: "Story goes up Sat, 9:00 AM",
    pull: "instagram-later",
  });
  assert.deepEqual(statusOf([post("instagram", "published"), post("google", "published")]), {
    tone: "up",
    said: "On Instagram and Google · Monday",
    pull: null,
  });
});

test("a place holds one post at a time, and Google holds a piece once: the page's switches and Ask's card ask alike", () => {
  assert.equal(postPlaceTakenOf([], "instagram"), null);
  assert.deepEqual(postPlaceTakenOf([waits("instagram")], "instagram"), {
    is: "on_its_way",
    scheduled_for: "2026-11-14T14:00:00.000Z",
  });
  assert.equal(postPlaceTakenOf([post("instagram", "published")], "instagram"), null, "a story after the post");
  assert.deepEqual(postPlaceTakenOf([post("google", "published")], "google"), { is: "up" });
  assert.equal(postPlaceTakenOf([post("google", "failed"), post("google", "pulled")], "google"), null);
  // A story waits apart from the post (00620): a post set for Saturday leaves room for its story, not a second post.
  assert.equal(postPlaceTakenOf([waits("instagram")], "instagram", "story"), null);
  assert.equal(postPlaceTakenOf([waits("instagram")], "instagram", "picture")?.is, "on_its_way");
  assert.equal(postPlaceTakenOf([waits("instagram", { kind: "story" })], "instagram", "picture"), null);
});

test("Instagram takes one of each kind at a time: a story beside a post that waits, and each keeps its Don't post", () => {
  const CONNECTED = { instagram: true, google: true, onGoogle: false };
  assert.deepEqual(pieceTakesOf([], CONNECTED), { instagram: true, google: true });
  assert.deepEqual(instagramKindsFree([]), ["picture", "story"]);
  // A post set for Saturday on Instagram: its story can still go (00620), a second post cannot. The row keeps the waiting
  // post's Don't post on its line, and its end is the switch for the kind that is free.
  const waiting = [waits("instagram")];
  const takes = pieceTakesOf(waiting, CONNECTED);
  assert.deepEqual(takes, { instagram: true, google: true });
  assert.deepEqual(instagramKindsFree(waiting), ["story"]);
  assert.equal(instagramAsOf(instagramKindsFree(waiting), "picture"), "story", "posted as the kind that can go");
  assert.equal(instagramAsOf(["picture", "story"], "story"), "story", "the kind wanted, where it can go");
  const [instagram] = placesOf(waiting, { ...CAN, takes }, NOW);
  assert.deepEqual([instagram.takes, instagram.stands.is, instagram.pull], [true, "timed", "instagram-later"]);
  // Both kinds on their way: nothing more goes there until one lands.
  const both = [waits("instagram", { id: "story-later", kind: "story" }), waits("instagram")];
  assert.deepEqual(instagramKindsFree(both), []);
  assert.equal(pieceTakesOf(both, CONNECTED).instagram, false);
  // Google takes a piece once, by its posts or by the record of one from before posts were kept.
  assert.equal(pieceTakesOf([post("google", "published")], CONNECTED).google, false);
  assert.equal(pieceTakesOf([], { ...CONNECTED, onGoogle: true }).google, false);
  assert.equal(pieceTakesOf([], { ...CONNECTED, instagram: false }).instagram, false, "not connected takes none");
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

test("a post and a story that both wait on Instagram are two lines, each with its own Don't post and Change time", () => {
  const older = "2026-11-10T15:00:00.000Z";
  const picture = waits("instagram", { created_at: older });
  const story = waits("instagram", { id: "story-later", kind: "story", scheduled_for: "2026-11-15T14:00:00.000Z" });
  const [at] = placesOf([story, picture], CAN, NOW);
  assert.deepEqual(
    [at.kind, at.stands, at.pull, at.movable],
    ["story", { is: "timed", at: "2026-11-15T14:00:00.000Z" }, "story-later", "story-later"],
    "the row is the newest there",
  );
  assert.deepEqual(at.waitsToo, {
    kind: "picture",
    stands: { is: "timed", at: "2026-11-14T14:00:00.000Z" },
    pull: "instagram-later",
    movable: "instagram-later",
    making: false,
  });
  // One Instagram is making ready beside it holds its words, and its time; it can still be stopped.
  const making = placesOf([story, { ...picture, status: "preparing" }], CAN, NOW)[0].waitsToo;
  assert.deepEqual([making.pull, making.movable, making.making], ["instagram-later", null, true]);
  // A post that waits under one that went up since is said on its own line too, where the row says the newer one is up.
  const up = post("instagram", "published", { id: "story-up", kind: "story", created_at: "2026-11-11T16:00:00.000Z" });
  const [under] = placesOf([up, picture], CAN, NOW);
  assert.deepEqual([under.stands.is, under.pull, under.waitsToo?.pull], ["up", null, "instagram-later"]);
  // One alone is the row's own, with no second line.
  assert.equal(placesOf([picture], CAN, NOW)[0].waitsToo, null);
  // A place nobody is offered is still listed while a post waits there.
  const noInstagram = { ...CAN, takes: { instagram: false, google: true }, offers: { instagram: false, google: true } };
  assert.equal(
    placesOf([{ ...story, status: "pulled" }, picture], noInstagram, NOW).some((p) => p.place === "instagram"),
    true,
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
