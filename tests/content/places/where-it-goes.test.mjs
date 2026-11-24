/**
 * Where a piece goes, a line a placement (the content loop PRD's 8.2, 8.3, 21.3 and 15.1; the journey canvas, board
 * Piece): each state in the owner's words with its one fix. "On Instagram" is said only once the account was seen
 * holding the post; a story says when it ended by itself; a take-down says what the place said and never that a post is
 * down before it did; a reader is offered nothing to press.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ON_FACEBOOK, ON_INSTAGRAM, TAKE_DOWN_WORDS, postComingDownOf, takeDownWillOf } from "@chanlytics/contracts";
import {
  GOES_WORDS,
  goesLinesOf,
  goesPillOf,
  takeDownOffered,
  takeDownStandsOf,
} from "../../../apps/dashboard/src/surfaces/campaigns/content/model/goes.ts";

const NOW = Date.parse("2026-12-01T18:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const ahead = (ms) => new Date(NOW + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
let seq = 0;
const post = (over = {}) => ({
  id: `post-${++seq}`,
  place: "instagram",
  kind: "reel",
  caption: "Forty-five minutes, one round brush.",
  status: "published",
  held_reason: null,
  held_why: null,
  permalink: "https://www.instagram.com/reel/abc/",
  scheduled_for: ago(HOUR),
  published_at: ago(HOUR),
  verified_at: ago(HOUR),
  good_until: null,
  error: null,
  created_at: ago(2 * HOUR),
  ...over,
});
const known = (over = {}) => ({
  takeDown: null,
  when: (iso) => `@${iso.slice(11, 16)}`,
  nowMs: NOW,
  may: true,
  ...over,
});
const one = (p, over) => goesLinesOf([p], known(over))[0];
const acts = (line) => line.acts.map((a) => a.is);

test("up is said only once the account was seen holding it, and a story says when it ended by itself", () => {
  const seen = one(post());
  assert.equal(seen.name, "Instagram reel");
  assert.equal(seen.said, "On Instagram · @17:00");
  assert.equal(seen.tone, "ok");
  assert.deepEqual(seen.acts, [{ is: "see", href: "https://www.instagram.com/reel/abc/" }]);
  // Instagram took it a minute ago and the account has not been read holding it: still posting, no word between.
  const unseen = one(post({ verified_at: null, published_at: ago(MIN) }));
  assert.equal(unseen.said, "Posting to Instagram");
  assert.deepEqual(
    [unseen.tone, unseen.moving, unseen.acts],
    ["live", true, []],
    "sent is not yet up, and has no door",
  );
  // Past the time that read takes, nobody can say it went up: said so, and the owner looks before posting it again.
  const never = one(post({ verified_at: null, published_at: ago(HOUR) }));
  assert.equal(never.said, ON_INSTAGRAM.refused.unknown);
  assert.deepEqual([never.tone, never.moving], ["you", false]);
  const google = one(post({ place: "google", kind: "picture", verified_at: null }));
  assert.equal(google.said, "On Google · @17:00");
  const story = one(post({ kind: "story", published_at: ago(26 * HOUR) }));
  assert.equal(story.said, "Was on Instagram for a day · @16:00");
  assert.equal(story.tone, "gone");
  assert.deepEqual(story.acts, []);
});

test("on its way: set for its time with its two acts, then each step as it is reached", () => {
  const timed = one(post({ status: "queued", scheduled_for: ahead(3 * HOUR), published_at: null }));
  assert.equal(timed.said, "Goes up @21:00");
  assert.deepEqual(acts(timed), ["move", "pull"]);
  assert.equal(timed.acts[1].says, GOES_WORDS.dontPost);
  const ready = one(post({ status: "preparing", scheduled_for: ahead(MIN), published_at: null }));
  assert.equal(ready.said, "Instagram is getting it ready");
  assert.ok(ready.moving);
  assert.equal(one(post({ status: "publishing", published_at: null })).said, "Posting to Instagram");
  const checking = one(post({ place: "google", kind: "picture", status: "checking", published_at: null }));
  assert.equal(checking.said, "Checking with Google");
  assert.match(checking.note, /It won't post twice/);
  // A reader sees where it stands, and nothing to press.
  assert.deepEqual(one(post({ status: "queued", scheduled_for: ahead(3 * HOUR) }), { may: false }).acts, []);
});

test("held since it was approved, for its reason, or by its place: each with its own way on, never post anyway", () => {
  const changed = one(post({ status: "held", held_why: "changed", held_reason: ON_INSTAGRAM.held.changed }));
  assert.equal(changed.said, "Changed since you approved it");
  assert.deepEqual(changed.acts, [{ is: "approve", says: "Look again" }]);
  const passed = one(
    post({ status: "held", held_why: "reason_passed", held_reason: "“20% off” has ended since you approved this." }),
  );
  assert.equal(passed.said, "“20% off” has ended since you approved this.");
  assert.deepEqual(
    passed.acts.map((a) => a.says ?? a.hint),
    ["Leave it out", "Change the words", "Tell AI it still stands"],
  );
  assert.deepEqual(passed.acts[2], { is: "say_ai", hint: "Tell AI it still stands", begin: "It still stands: " });
  const lost = one(post({ status: "held", held_why: "disconnected", held_reason: ON_INSTAGRAM.held.disconnected }));
  assert.equal(lost.said, "Instagram needs connecting again");
  assert.deepEqual(acts(lost), ["connect"]);
  assert.equal(
    one(post({ status: "held", held_why: "stopped", held_reason: "x" })).said,
    "AI is paused · nothing posts",
  );
});

test("didn't post: the place's reason, and the one thing to do", () => {
  const long = one(post({ status: "failed", error: ON_INSTAGRAM.refused.words, published_at: null }));
  assert.equal(long.said, `Didn't post · ${ON_INSTAGRAM.refused.words}`);
  assert.deepEqual(long.acts[0], { is: "words", says: "Shorten it" });
  const video = one(post({ status: "failed", error: ON_INSTAGRAM.refused.video, published_at: null }));
  assert.equal(video.acts[0].says, "Make it again");
  const other = one(post({ status: "failed", error: ON_INSTAGRAM.refused.other, published_at: null }));
  assert.deepEqual(other.acts[0], { is: "approve", says: "Try again" });
});

test("too late is said and never sent; a post the owner let go says nothing, and the one up under it still does", () => {
  const late = one(
    post({
      status: "pulled",
      held_why: "late",
      held_reason: "Too late to post. Thursday has passed.",
      published_at: null,
    }),
  );
  assert.equal(late.said, "Too late to post · Thursday has passed");
  assert.equal(late.tone, "gone");
  assert.deepEqual(late.acts, []);
  assert.deepEqual(goesLinesOf([post({ status: "pulled", published_at: null })], known()), []);
  const up = post({ kind: "picture", created_at: ago(30 * HOUR) });
  const letGo = post({ kind: "picture", status: "pulled", published_at: null, created_at: ago(HOUR) });
  assert.deepEqual(
    goesLinesOf([letGo, up], known()).map((l) => l.said),
    ["On Instagram · @17:00"],
  );
  // A newer one that stopped does not hide the one that is up.
  const stopped = post({ kind: "picture", status: "failed", error: "x", published_at: null, created_at: ago(MIN) });
  assert.deepEqual(
    goesLinesOf([stopped, up], known()).map((l) => l.tone),
    ["you", "ok"],
  );
});

test("a take-down says what the place said: asked, by hand with the place's link, a day with no answer, then down", () => {
  const up = post();
  const action = (over) => ({
    id: "action-1",
    target: "post",
    target_id: up.id,
    act: "take_down",
    outcome: "pending",
    said: null,
    started_at: ago(MIN),
    finished_at: null,
    name: null,
    ...over,
  });
  const down = (over) => ({
    takeDown: { cause: "owner_removed", asked_at: ago(MIN), finished_at: null, actions: [action(over)] },
  });
  const asking = one(up, down());
  assert.equal(asking.said, "Taking it down from Instagram");
  assert.ok(asking.moving);
  const byHand = one(up, down({ outcome: "needs_person", said: ON_INSTAGRAM.takeDown.byHand, finished_at: ago(0) }));
  assert.equal(byHand.said, "Chanlytics can't take this down from Instagram");
  assert.equal(byHand.note, "Open the reel in Instagram, then Delete. Chanlytics checks it's gone.");
  // The two that finish it by hand, then the owner's other choice: Keep it up (the canvas's Piece 34).
  assert.deepEqual(acts(byHand), ["open_place", "deleted", "keep"]);
  assert.equal(byHand.acts[0].href, up.permalink);
  assert.deepEqual(byHand.acts[2], { is: "keep", postId: up.id });
  const reader = one(up, { ...down({ outcome: "needs_person", finished_at: ago(0) }), may: false });
  assert.deepEqual(reader.acts, [], "a reader is told where it stands, and offered none of the three");
  const stillUp = one(
    up,
    down({ outcome: "needs_person", said: TAKE_DOWN_WORDS.stillUp("instagram"), finished_at: ago(0) }),
  );
  assert.equal(stillUp.note, TAKE_DOWN_WORDS.stillUp("instagram"));
  const quiet = one(up, down({ started_at: ago(25 * HOUR) }));
  assert.equal(quiet.said, "Instagram hasn't confirmed it's gone · Chanlytics is on it");
  assert.deepEqual(quiet.acts, [], "nothing is the owner's to do");
  const gone = one({ ...up, status: "taken_down" }, down({ outcome: "done", finished_at: ago(0) }));
  assert.equal(gone.said, "Taken down · @18:00");
  assert.equal(gone.tone, "gone");
  // Found gone at its place while the take-down still waited on its owner (deleted there, no "I deleted it" pressed):
  // down is down, and nothing is left to press.
  for (const outcome of ["needs_person", "pending"]) {
    const foundGone = one({ ...up, status: "taken_down" }, down({ outcome, finished_at: ago(0) }));
    assert.equal(foundGone.said, "Taken down");
    assert.equal(foundGone.tone, "gone");
    assert.deepEqual(foundGone.acts, []);
  }
});

test("a post its owner chose to leave up says who kept it and when, in green, and nothing is to press for it", () => {
  const up = post();
  const leftUp = (by) => ({
    cause: "owner_removed",
    asked_at: ago(HOUR),
    finished_at: ago(MIN),
    actions: [
      {
        id: "action-1",
        target: "post",
        target_id: up.id,
        act: "take_down",
        outcome: "left_up",
        said: ON_INSTAGRAM.takeDown.byHand,
        started_at: ago(HOUR),
        finished_at: ago(MIN),
        left_up_by: by,
        name: null,
      },
    ],
  });
  const mine = leftUp({ you: true, name: "Ada" });
  assert.deepEqual(postComingDownOf(up, mine, NOW), null, "it is not coming down");
  // The canvas's Piece 35: a choice, never a failure. The reader is "you"; a teammate is named.
  const line = one(up, { takeDown: mine });
  assert.equal(line.said, "Kept up by you · @17:59");
  assert.equal(line.tone, "ok");
  assert.equal(line.note, null);
  assert.deepEqual(acts(line), ["see"], "neither Open in Instagram, I deleted it, nor Keep it up again");
  assert.equal(one(up, { takeDown: leftUp({ you: false, name: "Sofia" }) }).said, "Kept up by Sofia · @17:59");
  assert.equal(
    one(up, { takeDown: leftUp({ you: false, name: null }) }).said,
    "Kept up by a teammate · @17:59",
    "a member who gave no name, or who has left since",
  );
  // The piece's one status says where it is: on Instagram. The choice is its line's to say.
  assert.deepEqual(goesPillOf([line]), { said: "On Instagram", tone: "ok", moving: false });
  // Nothing of it waits, so Take down is offered again and a new post may lead.
  assert.deepEqual(takeDownStandsOf(mine), { open: false, asking: false });
  assert.deepEqual(takeDownStandsOf(null), { open: false, asking: false });
  const stillAsked = { ...mine, actions: [{ ...mine.actions[0], outcome: "pending", finished_at: null }] };
  assert.deepEqual(takeDownStandsOf(stillAsked), { open: true, asking: true });
  const byHand = { ...mine, actions: [{ ...mine.actions[0], outcome: "needs_person" }] };
  assert.deepEqual(takeDownStandsOf(byHand), { open: true, asking: false });
});

test("the piece's one status leads with what needs the owner, then what moves, and counts what is set", () => {
  const timed = (kind, place = "instagram") =>
    post({ place, kind, status: "queued", scheduled_for: ahead(3 * HOUR), published_at: null });
  const set = goesLinesOf([timed("reel"), timed("story"), timed("picture", "google")], known());
  assert.deepEqual(goesPillOf(set), { said: "Goes up @21:00 · 3 places", tone: "", moving: false });
  const mixed = goesLinesOf([post(), post({ kind: "story", status: "publishing", published_at: null })], known());
  assert.equal(goesPillOf(mixed).said, "Posting to Instagram");
  assert.ok(goesPillOf(mixed).moving);
  const changed = goesLinesOf([post({ status: "held", held_why: "changed", held_reason: "x" })], known());
  assert.equal(goesPillOf(changed).said, "Changed · approve it again");
  // A refusal's reason is its line's to say: the status says where it did not go.
  const refused = goesLinesOf(
    [post({ status: "failed", error: ON_INSTAGRAM.refused.words, published_at: null })],
    known(),
  );
  assert.deepEqual(goesPillOf(refused), { said: "Didn't post on Instagram", tone: "you", moving: false });
  assert.equal(goesPillOf([]), null);
});

test("what the confirm says the press will do, a line a placement", () => {
  const will = takeDownWillOf(
    [
      post({ id: "a" }),
      post({ id: "b", kind: "story", published_at: ago(30 * HOUR) }),
      post({ id: "c", place: "google", kind: "picture" }),
      post({ id: "d", kind: "picture", status: "queued", published_at: null }),
      post({ id: "e", kind: "picture", status: "pulled", published_at: null }),
    ],
    (place) => (place === "google" ? "yes" : "unproved"),
    NOW,
  );
  assert.deepEqual(
    will.map((w) => [w.name, w.will]),
    [
      ["Instagram reel", "Chanlytics asks Instagram. If it can't, you delete it there"],
      ["Instagram post", "Won't go up"],
      ["Instagram story", "Gone already: a story lasts a day"],
      ["Google", "Chanlytics takes it down"],
    ],
  );
});

test("Take down is offered only where something of the piece is up: never for a story that has run its day", () => {
  const ended = post({ kind: "story", published_at: ago(25 * HOUR), verified_at: ago(25 * HOUR) });
  const live = post({ kind: "story", published_at: ago(2 * HOUR), verified_at: ago(2 * HOUR) });
  // The story's line already says it ended by itself, and a take-down asks nothing of it (00682): nothing to press.
  assert.equal(one(ended).said, "Was on Instagram for a day · @17:00");
  assert.equal(takeDownOffered([ended], NOW), false, "a story past its day is gone already");
  assert.equal(takeDownOffered([live], NOW), true, "a story still in its day is up");
  assert.equal(takeDownOffered([ended, post({ kind: "picture" })], NOW), true, "the post beside it is up");
  assert.equal(takeDownOffered([post({ status: "publishing", published_at: null })], NOW), true, "on its way up");
  assert.equal(takeDownOffered([post({ status: "taken_down" })], NOW), false);
});

test("a Page's post is said as Instagram's is: named with its kind, up only once seen, else said plainly", () => {
  const page = (over = {}) =>
    post({ place: "facebook", kind: "reel", permalink: "https://www.facebook.com/reel/1", ...over });
  const seen = one(page());
  assert.equal(seen.name, "Facebook reel");
  assert.equal(seen.said, "On Facebook · @17:00");
  assert.equal(one(page({ kind: "story" })).name, "Facebook story");
  assert.equal(one(page({ kind: "picture" })).name, "Facebook post");
  // A reel Meta has not said is published: still posting, then said plainly in Facebook's words.
  const unseen = one(page({ verified_at: null, published_at: ago(MIN) }));
  assert.deepEqual([unseen.said, unseen.tone, unseen.moving], ["Posting to Facebook", "live", true]);
  const never = one(page({ verified_at: null, published_at: ago(HOUR) }));
  assert.equal(never.said, ON_FACEBOOK.refused.unknown);
});
