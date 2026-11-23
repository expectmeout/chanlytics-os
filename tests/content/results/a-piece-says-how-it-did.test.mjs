/**
 * The piece's How it did and What it brought (the content loop PRD's 21.3 parts 3 and 4; the journey canvas, Piece cell
 * 10 and desk cell 32): the place's numbers in one line, a number it does not give said as not available and never a
 * zero, comments "as Instagram counts them"; conversations, then booked by its class, new people and known ones apart,
 * each with what they did; opens of a link said as opens and never credited.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pieceResultsSaid } from "@chanlytics/contracts";

const TZ = "America/New_York";
const n = (metric, value, availability = "available") => ({ metric, value, availability });
const reel = {
  post_id: "p-reel",
  place: "instagram",
  kind: "reel",
  step: "1d",
  read_at: "2026-12-03T13:00:00Z",
  numbers: [n("reach", 2140), n("views", 3420), n("saves", 31), n("likes", 188), n("comments", 14), n("shares", 9)],
};
const empty = { conversations: 0, direct: 0, assisted: 0, people: [], link: null, window_days: 14 };

test("one line of the place's numbers, comments as Instagram counts them, and when it is read next", () => {
  const said = pieceResultsSaid({ posts: [reel], ...empty }, TZ);
  assert.deepEqual(said.howItDid.lines, [
    "2,140 reached · 3,420 plays · 31 saves",
    "188 likes · 14 comments · 9 shares",
  ]);
  assert.match(said.howItDid.fine, /as Instagram counts them, your own replies included/);
  assert.match(said.howItDid.fine, /Next at 3 days/);
});

test("a story too few saw says why, a place with no numbers says not available, never a zero", () => {
  const story = {
    post_id: "p-story",
    place: "instagram",
    kind: "story",
    step: "1h",
    read_at: "2026-12-03T13:00:00Z",
    numbers: [n("reach", null, "withheld"), n("views", null, "withheld"), n("shares", null, "withheld")],
  };
  const google = {
    post_id: "p-g",
    place: "google",
    kind: "picture",
    step: "1d",
    read_at: "2026-12-03T13:00:00Z",
    numbers: [n("reach", null, "unsupported")],
  };
  const said = pieceResultsSaid({ posts: [reel, story, google], ...empty }, TZ);
  assert.deepEqual(said.howItDid.missing, [
    "Story: not available · fewer than 5 people saw it",
    "Google: not available",
  ]);
  assert.ok(!said.howItDid.lines.join(" ").includes(" 0 "), "nothing missing became a zero");
});

test("numbers read just before a take-down say so, and promise no next read", () => {
  const last = { ...reel, step: "last" };
  const said = pieceResultsSaid({ posts: [last], ...empty }, TZ);
  assert.deepEqual(said.howItDid.lines, [
    "2,140 reached · 3,420 plays · 31 saves",
    "188 likes · 14 comments · 9 shares",
  ]);
  assert.match(said.howItDid.fine, /Read just before you took it down\.$/);
  assert.doesNotMatch(said.howItDid.fine, /Next at|last time/);
});

test("before the first read, the piece says when its numbers come", () => {
  const fresh = { ...reel, step: null, read_at: null, numbers: [] };
  const said = pieceResultsSaid({ posts: [fresh], ...empty }, TZ);
  assert.deepEqual(said.howItDid.lines, []);
  assert.match(said.howItDid.fine, /an hour after it went up/);
});

test("what it brought: conversations, then booked by class, new people and known ones apart", () => {
  const person = (over) => ({
    contact_id: "c",
    name: "Ana Ruiz",
    new_person: true,
    touch: "reply",
    touched_at: "2026-12-01T23:12:00Z",
    class: "none",
    visit: null,
    ...over,
  });
  const brought = {
    conversations: 4,
    direct: 2,
    assisted: 1,
    window_days: 14,
    link: { code: "k7m2qp", lands: "booking", opens: 14 },
    people: [
      person({ class: "direct", visit: { starts_at: "2026-12-03T15:00:00Z", status: "booked" } }),
      person({
        contact_id: "d",
        name: "Dana Cole",
        touch: "coded_message",
        class: "direct",
        visit: { starts_at: "2026-12-05T16:00:00Z", status: "booked" },
      }),
      person({ contact_id: "l", name: "Lucía M", touch: "comment", words: "how much?" }),
      person({
        contact_id: "r",
        name: "Rosa Diaz",
        new_person: false,
        touch: "story_reply",
        class: "assisted",
        visit: { starts_at: "2026-12-05T16:00:00Z", status: "booked" },
      }),
    ],
  };
  const said = pieceResultsSaid({ posts: [reel], ...brought }, TZ);
  assert.equal(said.whatItBrought.head, "4 conversations · 2 booked from this post · 1 it helped");
  assert.equal(said.whatItBrought.newPeople.length, 3);
  assert.equal(said.whatItBrought.known.length, 1);
  assert.equal(said.whatItBrought.newPeople[0].line, "Replied to the reel · booked Thu 10:00 AM");
  assert.equal(said.whatItBrought.newPeople[1].line, "Wrote from the post's link · booked Sat 11:00 AM");
  assert.equal(said.whatItBrought.newPeople[2].line, "Commented “how much?”");
  assert.equal(said.whatItBrought.known[0].line, "Replied to the story · booked Sat 11:00 AM another way · it helped");
  assert.match(said.whatItBrought.fine, /14 days before they booked another way/);
  assert.match(
    said.whatItBrought.fine,
    /Your booking link was opened 14 times: bookings made there can't be traced to a post/,
  );
});

test("nothing brought yet is said, not hidden", () => {
  const said = pieceResultsSaid({ posts: [reel], ...empty }, TZ);
  assert.equal(said.whatItBrought.head, "No one has written about it yet");
});
