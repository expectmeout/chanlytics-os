/**
 * Where a made piece stands on Campaigns › Content, from its posts alone (content/page.ts contentMarkOf, which reads the
 * piece's one standing, placements/standing.ts), and the words for it. A piece can be up on Google and stuck on Instagram
 * at once: the tile says the one thing that matters most, what needs the owner first, then what is working, then what is
 * done, then, where nothing of it is up any more, what last happened.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_WORDS,
  contentHeadOf,
  contentMakingSaid,
  contentMarkOf,
  contentMarkSaid,
  contentMarkToneOf,
  contentPieceMarkOf,
  contentMoving,
  contentWakesAt,
} from "@chanlytics/contracts";

/** Now, half a minute after every post below was set for: each is due, so one on its way is going up. */
const NOW = Date.parse("2026-11-11T15:00:30Z");
/** Saturday, days on: a post set for then waits for its time. */
const SATURDAY = "2026-11-14T15:00:00Z";

/** A post, newest first in the list it is handed in. */
const post = (place, status, over = {}) => ({
  id: `${place}-${status}`,
  place,
  kind: "picture",
  caption: null,
  status,
  held_reason: status === "held" ? "disconnected" : null,
  permalink: null,
  scheduled_for: "2026-11-11T15:00:00Z",
  held_why: null,
  published_at: status === "published" ? "2026-11-11T15:01:00Z" : null,
  // Seen at its place, as a post that is up is.
  verified_at: status === "published" ? "2026-11-11T15:02:00Z" : null,
  error: null,
  created_at: "2026-11-11T15:00:00Z",
  ...over,
});

test("ready is for a piece that never went out: one let go leaves it ready, one that came down says so", () => {
  assert.deepEqual(contentMarkOf([], NOW), { is: "ready" });
  assert.deepEqual(contentMarkOf([post("instagram", "pulled")], NOW), { is: "ready" });
  // The review of 24 Nov 2026: a post taken down read "Ready to post" on its tile and "Taken down" in the open piece.
  const down = contentMarkOf([post("google", "taken_down")], NOW);
  assert.deepEqual(down, { is: "down", place: "google", at: null, there: false });
  assert.equal(
    contentMarkSaid(down, () => "Tuesday"),
    "Taken down",
  );
  assert.equal(
    contentMarkSaid({ ...down, at: "2026-11-10T15:00:00Z" }, () => "Tuesday"),
    "Taken down · Tuesday",
  );
  assert.equal(contentMarkToneOf(down), "ready", "grey, as a piece that is not out");
});

test("a post Instagram took and was never seen holding is not said to be up", () => {
  const unseen = post("instagram", "published", { verified_at: null });
  // Just sent: still going up, no word between the two.
  assert.deepEqual(contentMarkOf([unseen], Date.parse("2026-11-11T15:03:00Z")), { is: "going", place: "instagram" });
  // Hours on, nobody can say: amber, never the green "On Instagram".
  const mark = contentMarkOf([unseen], Date.parse("2026-11-11T18:00:00Z"));
  assert.deepEqual(mark, { is: "unsure", place: "instagram" });
  assert.equal(
    contentMarkSaid(mark, () => "Monday"),
    "Couldn't confirm it's on Instagram",
  );
  assert.equal(contentMarkToneOf(mark), "need");
  // Google says a post is up as it takes it.
  assert.equal(contentMarkOf([post("google", "published", { verified_at: null })], NOW).is, "posted");
});

test("only the newest post of each placement speaks for it", () => {
  const older = post("instagram", "failed", { id: "old" });
  assert.deepEqual(contentMarkOf([post("instagram", "published"), older], NOW), {
    is: "posted",
    places: ["instagram"],
    at: "2026-11-11T15:01:00Z",
  });
});

test("a story stands for its day: past it the piece says the story ended, unless a post still stands there", () => {
  const story = post("instagram", "published", { id: "st", kind: "story" });
  assert.equal(contentMarkOf([story], NOW).is, "posted", "a story up an hour stands");
  const dayOn = Date.parse("2026-11-12T15:01:00Z");
  // 16 Nov 2026: a story-only piece a week on still said "On Instagram · Monday". Instagram took it down after a day.
  // 24 Nov 2026: and then it said "Ready to post", of a piece that had been out. It says what happened, and when.
  const ended = contentMarkOf([story], dayOn);
  assert.deepEqual(ended, { is: "ended", place: "instagram", at: "2026-11-12T15:01:00.000Z" });
  assert.equal(
    contentMarkSaid(ended, () => "Thursday"),
    "Story ended · Thursday",
  );
  assert.equal(contentMarkToneOf(ended), "ready");
  const picture = post("instagram", "published", { id: "pic", published_at: "2026-11-10T15:01:00Z" });
  assert.deepEqual(contentMarkOf([story, picture], dayOn), {
    is: "posted",
    places: ["instagram"],
    at: "2026-11-10T15:01:00Z",
  });
});

test("what needs the owner outranks what is working, which outranks what is done", () => {
  assert.deepEqual(contentMarkOf([post("instagram", "held"), post("google", "published")], NOW), {
    is: "stuck",
    place: "instagram",
  });
  assert.deepEqual(contentMarkOf([post("instagram", "failed"), post("google", "queued")], NOW), {
    is: "stuck",
    place: "instagram",
  });
  for (const moving of ["queued", "preparing", "publishing", "checking"])
    assert.deepEqual(contentMarkOf([post("instagram", moving), post("google", "published")], NOW), {
      is: "going",
      place: "instagram",
    });
  assert.deepEqual(contentMarkOf([post("instagram", "published"), post("google", "published")], NOW), {
    is: "posted",
    places: ["instagram", "google"],
    at: "2026-11-11T15:01:00Z",
  });
});

test("a post set for later waits for its time: it is not posting all week, and the page does not ask for it", () => {
  const timed = post("instagram", "queued", { scheduled_for: SATURDAY });
  assert.deepEqual(contentMarkOf([timed], NOW), { is: "timed", place: "instagram", at: SATURDAY });
  // Up on Google, set for Saturday on Instagram: what is still to come is said, as the open piece says it.
  assert.deepEqual(contentMarkOf([timed, post("google", "published")], NOW), {
    is: "timed",
    place: "instagram",
    at: SATURDAY,
  });
  // A story set for Saturday, then the post went up: the story still waits, and says so.
  assert.deepEqual(
    contentMarkOf([post("instagram", "published", { created_at: "2026-11-12T09:00:00Z" }), timed], NOW),
    {
      is: "timed",
      place: "instagram",
      at: SATURDAY,
    },
  );
  // Its time come, it goes up.
  assert.deepEqual(contentMarkOf([timed], Date.parse(SATURDAY)), { is: "going", place: "instagram" });
  // Going up now outranks waiting; what needs the owner outranks both.
  assert.deepEqual(contentMarkOf([timed, post("google", "publishing")], NOW), { is: "going", place: "google" });
  assert.deepEqual(contentMarkOf([timed, post("google", "failed")], NOW), { is: "stuck", place: "google" });
  assert.equal(
    contentMarkSaid({ is: "timed", place: "instagram", at: SATURDAY }, () => "Saturday"),
    "Set for Saturday",
  );
  const page = { making: [], made: [{ file: { id: "f-1", kind: "image" }, posts: [timed] }], lines: [], next: null };
  assert.equal(contentMoving(page, NOW), false, "nothing moves until its time");
});

test("a page left open reads itself again as the soonest post set for its time comes due, and then follows it", () => {
  const SOON = 2 * 60 * 1000;
  const saturday = post("instagram", "queued", { scheduled_for: SATURDAY });
  const friday = post("google", "queued", { id: "fri", scheduled_for: "2026-11-13T09:00:00Z" });
  const page = (made, lines = []) => ({ making: [], made, lines, next: null });
  assert.equal(contentWakesAt(page([]), NOW), null, "nothing waits: nothing to wake for");
  assert.equal(contentWakesAt(page([{ file: { id: "f-1" }, posts: [saturday] }]), NOW), Date.parse(SATURDAY) - SOON);
  // The soonest of every post the page holds, a Scheduled line's among them.
  assert.equal(
    contentWakesAt(page([{ file: { id: "f-1" }, posts: [saturday] }], [{ file: { id: "f-2" }, post: friday }]), NOW),
    Date.parse("2026-11-13T09:00:00Z") - SOON,
  );
  // Due now, it is going up: the page follows it while it moves, and wakes for nothing.
  const due = Date.parse(SATURDAY) - SOON;
  const open = page([{ file: { id: "f-1", kind: "image" }, posts: [saturday] }]);
  assert.equal(contentWakesAt(open, due), null);
  assert.equal(contentMoving(open, due), true);
  // One up, pulled or stopped waits for nothing.
  for (const status of ["published", "pulled", "failed"])
    assert.equal(contentWakesAt(page([{ file: { id: "f-1" }, posts: [{ ...saturday, status }] }]), NOW), null);
});

test("letting a second post go never takes the first one down", () => {
  const story = post("instagram", "pulled", { id: "story", kind: "story", created_at: "2026-11-12T09:00:00Z" });
  assert.deepEqual(contentMarkOf([story, post("instagram", "published")], NOW), {
    is: "posted",
    places: ["instagram"],
    at: "2026-11-11T15:01:00Z",
  });
  // A post that stopped, tried again and let go is let go: the stop is not the owner's to mend any more.
  const retried = post("instagram", "pulled", { id: "again", created_at: "2026-11-12T09:00:00Z" });
  assert.deepEqual(contentMarkOf([retried, post("instagram", "held")], NOW), { is: "ready" });
});

test("each mark is said once, in the owner's words, and a video is never offered a post it cannot make", () => {
  const dayOf = () => "Monday";
  assert.equal(contentMarkSaid({ is: "ready" }, dayOf), "Ready to post");
  // A video AI made, posted nowhere, is saved where Instagram takes no reel from this workspace; where it takes one, the
  // video is ready to post, as its open piece says (the review of 24 Nov 2026, A11).
  assert.deepEqual(contentPieceMarkOf({ file: { kind: "video" }, posts: [] }, NOW, false), { is: "save" });
  assert.deepEqual(contentPieceMarkOf({ file: { kind: "video" }, posts: [] }, NOW, true), { is: "ready" });
  assert.deepEqual(contentPieceMarkOf({ file: { kind: "image" }, posts: [] }, NOW, false), { is: "ready" });
  assert.equal(contentMarkSaid({ is: "save" }, dayOf), "Ready to save");
  assert.equal(contentMarkSaid({ is: "going", place: "instagram" }, dayOf), "Posting to Instagram");
  assert.equal(contentMarkSaid({ is: "going", place: "google" }, dayOf), "Posting to Google");
  assert.equal(contentMarkSaid({ is: "posted", places: ["instagram"], at: null }, dayOf), "On Instagram");
  assert.equal(
    contentMarkSaid({ is: "posted", places: ["instagram", "google"], at: "2026-11-11T15:01:00Z" }, dayOf),
    "On Instagram and Google · Monday",
    "and the day the newest went up, by the business's clock",
  );
  assert.equal(
    contentMarkSaid({ is: "stuck", place: "instagram" }, dayOf),
    "Didn't post",
    "why is its place's row, said once",
  );
});

test("the head counts what is made and what is out, and says nothing it has not read", () => {
  assert.equal(contentHeadOf({ made: 0, posted: 0 }), "Nothing made yet");
  assert.equal(contentHeadOf({ made: 1, posted: 0 }), "1 piece made · none posted yet");
  assert.equal(contentHeadOf({ made: 12, posted: 3 }), "12 pieces made · 3 posted");
});

/** A video asked for, as the read hands it over. */
const making = (over = {}) => ({
  id: "p-1",
  status: "making",
  stage: "drawing",
  failed_why: null,
  lines: ["Three years", "of layers."],
  language: "en",
  moments: 4,
  created_at: "2026-11-11T15:00:00Z",
  ...over,
});

test("a video being made says its opening words and where it is at, in its own language", () => {
  assert.deepEqual(contentMakingSaid(making()), {
    title: "Three years of layers.",
    state: "Putting it together",
    failed: null,
  });
  assert.equal(contentMakingSaid(making({ stage: "queued" })).state, "Starting");
  assert.equal(contentMakingSaid(making({ language: "es", stage: "queued" })).state, "Empezando");
  assert.equal(contentMakingSaid(making({ lines: [] })).title, CONTENT_WORDS.video);
});

test("one that was not made says so, and why", () => {
  const said = contentMakingSaid(making({ status: "failed", failed_why: "clips" }));
  assert.equal(said.state, "Couldn't make it");
  assert.equal(said.failed, "One of its clips or photos isn't in your Library any more, or can't be used yet.");
});

test("the page asks again only while something is still moving", () => {
  const page = (over) => ({ making: [], made: [], next: null, tally: { made: 0, posted: 0 }, ...over });
  const file = { id: "f-1", kind: "image" };
  assert.equal(contentMoving(page({}), NOW), false);
  assert.equal(contentMoving(page({ making: [making()] }), NOW), true);
  assert.equal(contentMoving(page({ making: [making({ status: "failed", failed_why: "draw" })] }), NOW), false);
  assert.equal(contentMoving(page({ made: [{ file, posts: [post("instagram", "preparing")] }] }), NOW), true);
  assert.equal(contentMoving(page({ made: [{ file, posts: [post("instagram", "published")] }] }), NOW), false);
});

test("a piece its owner posted by hand says so, and where its link says; what was sent from here outranks it", () => {
  const dayOf = () => "Monday";
  const said = { id: "h-1", at: "2026-11-10T15:00:00Z", link: null };
  const video = { file: { kind: "video" }, posts: [], by_hand: said };
  assert.deepEqual(contentPieceMarkOf(video, NOW, false), { is: "by_hand", at: said.at, where: null });
  assert.equal(contentMarkSaid(contentPieceMarkOf(video, NOW, false), dayOf), "Posted by you · Monday");
  for (const [link, where] of [
    ["https://www.tiktok.com/@harbor/video/1", "TikTok"],
    ["https://instagram.com/reel/abc", "Instagram"],
    ["https://fb.watch/abc", "Facebook"],
    ["https://youtu.be/abc", "YouTube"],
    ["https://example.com/post", null],
    ["https://nottiktok.com/x", null],
  ])
    assert.equal(contentPieceMarkOf({ ...video, by_hand: { ...said, link } }, NOW, false).where, where, link);
  assert.equal(
    contentMarkSaid(
      contentPieceMarkOf({ ...video, by_hand: { ...said, link: "https://tiktok.com/x" } }, NOW, false),
      dayOf,
    ),
    "On TikTok, by you · Monday",
  );
  // A post sent from here stands first: up on Instagram is said as that, and one that stopped still needs its owner.
  const sent = { file: { kind: "image" }, posts: [post("instagram", "published")], by_hand: said };
  assert.equal(contentPieceMarkOf(sent, NOW, false).is, "posted");
  assert.equal(contentPieceMarkOf({ ...sent, posts: [post("instagram", "failed")] }, NOW, false).is, "stuck");
  // Where what was sent from here is no longer up, what its owner posted themselves is where it stands.
  assert.equal(contentPieceMarkOf({ ...sent, posts: [post("instagram", "taken_down")] }, NOW, false).is, "by_hand");
  // Taken back (none), a video is to be saved again.
  assert.deepEqual(contentPieceMarkOf({ ...video, by_hand: null }, NOW, false), { is: "save" });
});
