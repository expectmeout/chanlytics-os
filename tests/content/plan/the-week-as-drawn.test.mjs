/**
 * The Week as its page draws it (contracts content/plan week-view.ts; the approved boards, Week 1-12): each of its states,
 * its head and its one act, the rows that need the owner apart with their one fix, a row's line as its creative stands
 * (planned, being made, going up, up, didn't post, a reel made and waiting for its Approve), what to film at the foot; and
 * Settings › Content's seven lines (settings-lines.ts), the owner's own sentence first. Pure: no page is drawn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CADENCE_DEFAULT,
  WEEK_WORDS as W,
  cadenceOf,
  cadenceSaid,
  contentLinesOf,
  weekMoving,
  weekViewOf,
} from "@chanlytics/contracts";

const ZONE = "America/New_York";
const WEEK = "2026-11-30";
const NOW = Date.parse("2026-11-30T13:00:00Z");
const id = (n) => `aaaa1111-4444-4000-8000-${String(n).padStart(12, "0")}`;

const slot = (n, over = {}) => ({
  id: id(n),
  creative: id(100 + (over.creativeN ?? n)),
  place: "instagram",
  kind: "picture",
  at: "2026-12-01T23:00:00Z",
  state: "proposed",
  title: `Piece ${n}`,
  reason: null,
  file_id: id(200 + n),
  piece_id: null,
  post_id: null,
  intent: null,
  words: { line: "A line", over: null, under: null, caption: "A caption.", language: "en" },
  blocked_why: null,
  blocked_reason: null,
  ask: null,
  score: null,
  ...over,
});

const plan = (status, over = {}) => ({
  id: id(1),
  week_of: WEEK,
  status,
  fewer: null,
  ready_at: "2026-11-30T13:00:00Z",
  approved_at: status === "approved" ? "2026-11-30T14:14:00Z" : null,
  approved_by: null,
  ...over,
});

const post = (n, over = {}) => ({
  id: id(300 + n),
  place: "instagram",
  kind: "picture",
  caption: "A caption.",
  status: "queued",
  held_reason: null,
  held_why: null,
  permalink: null,
  scheduled_for: "2026-12-01T23:00:00Z",
  published_at: null,
  verified_at: null,
  good_until: null,
  error: null,
  created_at: "2026-11-30T14:15:00Z",
  ...over,
});

const page = (over = {}) => ({
  week_of: WEEK,
  zone: ZONE,
  week: { plan: null, slots: [] },
  files: [],
  made: [],
  pieces: [],
  paused_at: null,
  places: { instagram: true, google: true },
  planned: true,
  claims: [],
  goals: [],
  cadence: cadenceOf(undefined),
  quiet_days: [],
  languages: ["en"],
  lines: {},
  ...over,
});

const madeOf = (fileN, posts) => ({ file: { id: id(400 + fileN) }, posts });

test("before a week: nothing connected says what will be here; connected, a first week can be planned now", () => {
  const none = weekViewOf(page({ places: { instagram: false, google: false } }), NOW);
  assert.equal(none.state, "unconnected");
  assert.equal(none.title, W.empty.unconnected.title);
  const first = weekViewOf(page(), NOW);
  assert.equal(first.state, "unplanned");
  assert.equal(first.act, "plan");
  assert.equal(first.kicker, "This week · Nov 30 to Dec 6");
});

test("while AI drafts the week, its mark moves and nothing is offered to press", () => {
  const view = weekViewOf(page({ week: { plan: plan("drafting"), slots: [] } }), NOW);
  assert.equal(view.state, "drafting");
  assert.equal(view.act, null);
  assert.equal(view.title, W.drafting);
  assert.equal(weekMoving(view), true);
});

test("a ready week says its size and days, how often it goes up and where; the one that needs the owner stands apart", () => {
  const slots = [
    slot(1, { kind: "reel" }),
    slot(2, { creativeN: 1, place: "google", kind: "picture" }),
    slot(3, {
      at: "2026-12-03T17:00:00Z",
      state: "blocked",
      blocked_why: "claim",
      blocked_reason: "“20% off” isn't one of your offers.",
    }),
    slot(4, { at: "2026-12-04T15:00:00Z" }),
  ];
  const view = weekViewOf(page({ week: { plan: plan("ready"), slots } }), NOW);
  assert.equal(view.state, "ready");
  assert.equal(view.act, "approve");
  assert.equal(view.title, "A reel and 2 posts, Tue to Fri");
  assert.equal(view.line, "Going up 4 times on Instagram and Google");
  assert.deepEqual(
    view.groups.map((g) => g.name),
    [W.needsYou, W.ready],
  );
  const [needs] = view.groups;
  assert.equal(needs.rows[0].fix.label, W.fix.offer, "its one fix: Add it");
  const reel = view.groups[1].rows.find((r) => r.creative === id(101));
  assert.deepEqual(
    reel.marks.map((m) => m.glyph),
    ["reel", "pin"],
    "one row, its places as marks, in the order they go",
  );
  assert.equal(reel.line, "Tue 6:00 PM");
});

test("approved: each row says when it goes up, then where it is up; one that didn't post turns amber with why", () => {
  const slots = [
    slot(1, { state: "approved", post_id: id(301) }),
    slot(2, { state: "approved", post_id: id(302), at: "2026-12-02T23:00:00Z" }),
    slot(3, { state: "approved", post_id: id(303), at: "2026-12-03T23:00:00Z" }),
  ];
  const made = [
    madeOf(1, [post(1)]),
    madeOf(2, [post(2, { status: "published", verified_at: "2026-12-02T23:01:00Z" })]),
    madeOf(3, [post(3, { status: "failed", error: "the caption is too long" })]),
  ];
  const view = weekViewOf(page({ week: { plan: plan("approved"), slots }, made }), NOW);
  assert.equal(view.state, "approved");
  assert.equal(view.title, "Approved · 3 posts, Tue to Thu");
  const rows = view.groups.flatMap((g) => g.rows);
  assert.equal(rows.find((r) => r.creative === id(101)).line, "Goes up Tue 6:00 PM");
  assert.equal(rows.find((r) => r.creative === id(102)).tone, "ok");
  const failed = rows.find((r) => r.creative === id(103));
  assert.equal(failed.line, "Didn't post on Instagram · the caption is too long");
  assert.equal(failed.fix.act, "open");
  assert.equal(view.groups[0].name, W.needsYou);
  assert.equal(failed.opens, id(403), "it opens the made piece");
});

test("an approved reel: being made, then made and waiting for its own Approve, or not made with Try again", () => {
  const reel = (pieceStatus) =>
    weekViewOf(
      page({
        week: { plan: plan("approved"), slots: [slot(1, { kind: "reel", state: "approved", piece_id: id(500) })] },
        pieces: [{ id: id(500), status: pieceStatus, file_id: pieceStatus === "made" ? id(600) : null }],
      }),
      NOW,
    ).groups.flatMap((g) => g.rows)[0];
  const making = reel("making");
  assert.equal(making.line, W.videoMaking);
  assert.equal(making.moving, true, "the page asks again while it is made");
  const made = reel("made");
  assert.equal(made.fix.act, "post");
  assert.equal(made.fix.label, W.fix.post);
  assert.equal(made.opens, id(600));
  assert.equal(reel("failed").fix.act, "again");
});

test("AI paused: nothing will post, the rows say what waits, and Resume is the one act", () => {
  const view = weekViewOf(
    page({
      week: { plan: plan("approved"), slots: [slot(1, { state: "approved", post_id: id(301) })] },
      made: [madeOf(1, [post(1)])],
      paused_at: "2026-12-01T19:05:00Z",
    }),
    NOW,
  );
  assert.equal(view.state, "paused");
  assert.equal(view.act, "resume");
  assert.equal(view.title, W.paused);
  assert.equal(view.groups[0].rows[0].line, "Waits for you · was Tue 6:00 PM");
});

test("nothing to post: what to film, a sentence each, and why", () => {
  const ask = { what: "10 seconds of a blow-dry finish", seconds: 10, opportunity_id: null };
  const view = weekViewOf(
    page({
      week: {
        plan: plan("ready"),
        slots: [slot(1, { state: "needs_footage", ask, reason: "Thursday has 3 open chairs" })],
      },
    }),
    NOW,
  );
  assert.equal(view.state, "nothing");
  assert.equal(view.filmHead, W.film);
  assert.deepEqual(view.film, [{ what: ask.what, why: "Thursday has 3 open chairs" }]);
});

test("Settings › Content: seven lines, each a sentence; the owner's own words first; offers that stand alone", () => {
  const lines = contentLinesOf(
    page({
      goals: [{ goal: "fill_slow_days", detail: null }],
      quiet_days: ["sun"],
      languages: ["en", "es"],
      lines: { cadence: "Two reels a week, nothing on Google." },
      claims: [
        {
          id: id(1),
          kind: "offer",
          text: "20% off a first colour",
          source: "settings",
          valid_until: "2026-11-29",
          withdrawn_at: null,
          created_at: "",
        },
        {
          id: id(2),
          kind: "offer",
          text: "A free bang trim with any cut",
          source: "settings",
          valid_until: null,
          withdrawn_at: null,
          created_at: "",
        },
      ],
    }),
    "2026-11-30",
  );
  assert.deepEqual(
    lines.map((l) => l.label),
    ["What posts are for", "How often", "Quiet days", "Languages", "The look", "Offers", "Before anything posts"],
  );
  const said = Object.fromEntries(lines.map((l) => [l.key, l.words]));
  assert.equal(said.goals, "Fill the days that have room.");
  assert.equal(said.cadence, "Two reels a week, nothing on Google.", "the owner's own sentence stands as they said it");
  assert.equal(said.quiet_days, "Nothing posts on Sundays.");
  assert.equal(said.languages, "Captions in English and Spanish.");
  assert.equal(said.offers, "A free bang trim with any cut, no end date.", "an offer that ended is not said");
  assert.equal(lines.find((l) => l.key === "rung").to, "settings/autonomy");
  assert.equal(
    cadenceSaid(cadenceOf(CADENCE_DEFAULT)),
    "Up to 2 reels, a post and 2 stories on Instagram, and a post on Google, each week. Fewer when the clips are thin.",
  );
});
