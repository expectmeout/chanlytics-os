/**
 * The piece's How it did and What it brought (the content loop PRD's 21.3 parts 3 and 4; the journey canvas, Piece cell
 * 10 and desk cell 32): the place's numbers in one line, a number it does not give said as not available and never a
 * zero, comments "as Instagram counts them"; conversations, then booked by its class, new people and known ones apart,
 * each with what they did; opens of a link said as opens and never credited.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { broughtChainOf, pieceResultLineOf, pieceResultsSaid, resultLineText } from "@chanlytics/contracts";

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

test("a story's numbers are read once more before it ends, and that read is its last", () => {
  const story = {
    post_id: "p-story-read",
    place: "instagram",
    kind: "story",
    step: "1h",
    read_at: "2026-12-03T13:00:00Z",
    numbers: [n("reach", 12), n("views", 20), n("shares", 1)],
  };
  assert.match(pieceResultsSaid({ posts: [story], ...empty }, TZ).howItDid.fine, /Next before the story ends\./);
  const last = pieceResultsSaid({ posts: [{ ...story, step: "1d" }], ...empty }, TZ);
  assert.match(last.howItDid.fine, /Read for the last time\./);
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

test("the one line beside Run as an ad, in the canvas's four states, its numbers set apart (pass 6, Loop1)", () => {
  const line = (dto, down = false) => {
    const parts = pieceResultLineOf({ ...empty, ...dto }, { down });
    return parts === null ? null : resultLineText(parts);
  };
  assert.equal(line({ posts: [] }), null, "nothing went up: nothing is said");
  const fresh = { ...reel, step: null, read_at: null, numbers: [] };
  assert.equal(line({ posts: [fresh] }), "Its numbers come an hour after it went up.");
  const brought = { posts: [reel], conversations: 3, direct: 1 };
  assert.equal(line(brought), "Reached 2,140 on Instagram · 3 conversations · 1 booked from it");
  const story = {
    ...reel,
    kind: "story",
    numbers: [n("reach", null, "withheld"), n("views", null, "withheld")],
  };
  assert.equal(
    line({ posts: [story], conversations: 1 }),
    "Story: not available · fewer than 5 people saw it · 1 conversation",
    "kept back: why, never a zero",
  );
  assert.equal(line(brought, true), "Reached 2,140 while it was up · 3 conversations · 1 booked from it");
  assert.equal(line({ posts: [reel] }), "Reached 2,140 on Instagram · 0 conversations", "a real zero is said");
  const parts = pieceResultLineOf({ ...empty, ...brought }, { down: false });
  assert.deepEqual(
    parts.filter((part) => typeof part !== "string").map((part) => part.number),
    ["2,140", "3", "1"],
    "the numbers are set apart, as the canvas draws them",
  );
});

test("a person's chain, from the post to the review ask, each step opening its record; it ends at the ask (pass 6, Loop3)", () => {
  const ana = {
    contact_id: "c-ana",
    name: "Ana Ruiz",
    new_person: true,
    touch: "reply",
    touched_at: "2026-12-01T00:12:00Z", // Mon 7:12 PM in New York
    class: "direct",
    visit: { starts_at: "2026-12-03T15:00:00Z", status: "kept" }, // Thu 10:00 AM
    chain: {
      conversation_id: "cv-1",
      visit: { id: "v-1", asked_at: "2026-12-01T00:20:00Z" },
      review_ask: { at: "2026-12-04T15:00:00Z", conversation_id: "cv-1" },
    },
  };
  const chain = broughtChainOf(ana, "reel", TZ);
  assert.deepEqual(
    chain.steps.map((step) => [step.words, step.when]),
    [
      ["Replied to the reel", "Mon 7:12 PM"],
      ["Asked for Thu 10:00 AM · confirmed", "Mon 7:20 PM"],
      ["Kept", "Thu 10:00 AM"],
      ["Asked for a review", "Fri 10:00 AM"],
    ],
  );
  assert.deepEqual(
    chain.steps.map((step) => step.opens),
    [
      { kind: "conversation", id: "cv-1" },
      { kind: "visit", id: "v-1", day: "2026-12-03" },
      { kind: "visit", id: "v-1", day: "2026-12-03" },
      { kind: "conversation", id: "cv-1" },
    ],
  );
  assert.equal(chain.fine, "Chanlytics can't tell who wrote a review on Google, so it ends at the ask.");
  // Where a chain stops: at the last thing the record holds.
  const waiting = broughtChainOf({ ...ana, visit: { ...ana.visit, status: "proposed" } }, "reel", TZ);
  assert.deepEqual(
    waiting.steps.map((step) => [step.words, step.done]),
    [
      ["Replied to the reel", true],
      ["Asked for Thu 10:00 AM · waiting to be confirmed", false],
    ],
  );
  assert.equal(waiting.fine, null);
  const missed = broughtChainOf({ ...ana, visit: { ...ana.visit, status: "missed" } }, "reel", TZ);
  assert.deepEqual(missed.steps.at(-1).words, "Missed", "a missed visit is never asked for a review here");
  const noAsk = broughtChainOf({ ...ana, chain: { ...ana.chain, review_ask: null } }, "reel", TZ);
  assert.equal(noAsk.steps.at(-1).words, "Kept", "no review ask on: it ends at the visit");
  assert.equal(broughtChainOf({ ...ana, visit: null }, "reel", TZ), null, "no booking yet: no chain to open");
});
