/**
 * A piece stands one way everywhere (the content status review of 24 Nov 2026, C6). "Is this post up right now?" was
 * worked out by the list's tile, the open piece's status, its button, its list of places, the Take down offer and the
 * Week, each for itself, and they disagreed: a story that ended read "Ready to post" on its tile, "Posted Saturday" in
 * its list of places and "Post to Google" on its button, while a post still up vanished behind a newer one that came
 * down. Every one of them now reads contracts' one standing (content/placements/standing.ts).
 *
 * This runs the review's fourteen cases, and a story taken down within its day while the feed post stays up, through
 * every reader, and fails two ways: where a reader does not say the words the case is owed, and where any reader says
 * something untrue of what is actually out (each case names its truth by hand, apart from the code under test) or two
 * readers disagree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STANDING_WORDS,
  contentMarkSaid,
  contentMarkToneOf,
  contentPieceMarkOf,
  pieceStandingOf,
  placementStandingOf,
  storyRanItsDay,
  takeDownWillOf,
  weekRowsOf,
} from "@chanlytics/contracts";
import {
  goesLeadOf,
  goesLinesOf,
  goesPillOf,
  takeDownOffered,
} from "../../../apps/dashboard/src/surfaces/campaigns/content/model/goes.ts";
import { pieceNextOf, pieceTakesOf } from "../../../apps/dashboard/src/surfaces/campaigns/content/model/piece-open.ts";
import { pieceStatusOf, placesOf } from "../../../apps/dashboard/src/surfaces/campaigns/content/model/places.ts";
import { viewerStandsSaid } from "../../../apps/dashboard/src/surfaces/campaigns/content/model/viewer-line.ts";

/** A Tuesday evening, well in the past: nothing here is "just now" by the real clock. */
const NOW = Date.parse("2026-11-10T23:00:00Z");
const H = 3_600_000;
const D = 24 * H;
const iso = (ms) => new Date(ms).toISOString();
const SAT = NOW - 3 * D;
/** When a post that came down last moved: Monday evening, which is when it came down, or was noticed gone. */
const MON = NOW - D;
/** A post that came down on Monday: by a take-down from here, or, with `removed_there`, at its place itself. */
const cameDown = { status: "taken_down", updated_at: iso(MON) };
const removedThere = { ...cameDown, removed_there: true };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const day = (at) => DAYS[new Date(at).getUTCDay()];
const when = (at) => `${day(at).slice(0, 3)} ${at.slice(11, 16)}`;
const clock = { day, ahead: when };

let n = 0;
/** A post, up since Saturday and seen there unless a case says otherwise. */
const post = (over = {}) => ({
  id: `post-${++n}`,
  place: "instagram",
  kind: "picture",
  caption: "words",
  status: "published",
  held_reason: null,
  held_why: null,
  permalink: "https://example.com/p/x",
  scheduled_for: iso(SAT),
  published_at: iso(SAT),
  verified_at: iso(SAT + 120_000),
  good_until: null,
  error: null,
  created_at: iso(SAT),
  ...over,
});
const picture = { kind: "image", source: "made", status: "filed", shows: null, media_status: null };
const video = { ...picture, kind: "video" };
const never = { published_at: null, verified_at: null, permalink: null };

/**
 * The cases. `out`: the placements actually at their place now, named by hand. `went`: whether anything of the piece
 * ever went out. `says`: the words each reader owes: its tile, its open status, its button, and Instagram's row.
 */
const CASES = [
  {
    name: "1 a picture, never posted",
    file: picture,
    posts: [],
    out: [],
    went: false,
    says: { tile: "Ready to post", status: "Ready to post", button: "post", instagram: "Not yet" },
  },
  {
    name: "2 a picture post, up",
    file: picture,
    posts: [post()],
    out: ["instagram picture"],
    went: true,
    says: {
      tile: "On Instagram · Saturday",
      status: "On Instagram · Sat 23:00",
      button: "post_to google",
      instagram: "Posted Saturday",
    },
  },
  {
    name: "3 a story, up for five hours",
    file: picture,
    posts: [post({ kind: "story", published_at: iso(NOW - 5 * H), created_at: iso(NOW - 5 * H) })],
    out: ["instagram story"],
    went: true,
    says: {
      tile: "On Instagram · Tuesday",
      status: "On Instagram · Tue 18:00",
      button: "post_to google",
      instagram: "Posted Tuesday",
    },
  },
  {
    name: "4 a story alone, which ended two days ago",
    file: picture,
    posts: [post({ kind: "story" })],
    out: [],
    went: true,
    says: {
      tile: "Story ended · Sunday",
      status: "Story ended · Sun 23:00",
      button: "again",
      instagram: "Story ended Sunday",
    },
  },
  {
    name: "5 a story that ended, and a post removed on Instagram itself (production's piece)",
    file: picture,
    posts: [post({ kind: "story", created_at: iso(SAT + 60_000) }), post(removedThere)],
    out: [],
    went: true,
    // Nobody took it down from here, and no screen says so: where it was removed, and when that was noticed.
    says: {
      tile: "Removed on Instagram · Monday",
      status: "Removed on Instagram · noticed Mon 23:00",
      button: "again",
      instagram: "Removed there Monday",
    },
  },
  {
    name: "6 a post taken down, alone",
    file: picture,
    posts: [post(cameDown)],
    out: [],
    went: true,
    says: {
      tile: "Taken down · Monday",
      status: "Taken down · Mon 23:00",
      button: "again",
      instagram: "Taken down Monday",
    },
  },
  {
    name: "7 a second post removed on Instagram, the first still up",
    file: picture,
    posts: [post({ status: "taken_down", created_at: iso(NOW - D), published_at: iso(NOW - D) }), post()],
    out: ["instagram picture"],
    went: true,
    says: {
      tile: "On Instagram · Saturday",
      status: "On Instagram · Sat 23:00",
      button: "post_to google",
      instagram: "Posted Saturday",
    },
  },
  {
    name: "8 a post up, and a story that ended after it",
    file: picture,
    posts: [post({ kind: "story", created_at: iso(NOW - 2 * D), published_at: iso(NOW - 2 * D) }), post()],
    out: ["instagram picture"],
    went: true,
    says: {
      tile: "On Instagram · Saturday",
      status: "On Instagram · Sat 23:00",
      button: "post_to google",
      instagram: "Posted Saturday",
    },
  },
  {
    name: "9 sent three hours ago, and Instagram never said it holds it",
    file: picture,
    posts: [post({ ...never, published_at: iso(NOW - 3 * H), created_at: iso(NOW - 3 * H) })],
    // Nobody can say: it may be there. No reader calls it up, and none calls it gone.
    out: [],
    maybe: ["instagram picture"],
    went: true,
    says: {
      tile: "Couldn't confirm it's on Instagram",
      status: "Couldn't confirm it's on Instagram",
      button: "post_to google",
      instagram: "Couldn't confirm",
    },
  },
  {
    name: "10 refused by Instagram",
    file: picture,
    posts: [post({ ...never, status: "failed", error: "Instagram did not take the post." })],
    out: [],
    went: false,
    says: { tile: "Didn't post", status: "Didn't post on Instagram", button: "again", instagram: "Didn't post" },
  },
  {
    name: "11 a video, never posted, where Instagram takes a reel",
    file: video,
    posts: [],
    out: [],
    went: false,
    says: { tile: "Ready to post", status: "Ready to post", button: "post", instagram: "Not yet" },
  },
  {
    name: "12 a reel, up",
    file: video,
    posts: [post({ kind: "reel" })],
    out: ["instagram reel"],
    went: true,
    // Google takes no video from here: nothing leads.
    says: {
      tile: "On Instagram · Saturday",
      status: "On Instagram · Sat 23:00",
      button: "none",
      instagram: "Posted Saturday",
    },
  },
  {
    name: "13 up on Google, removed on Instagram",
    file: picture,
    posts: [post(removedThere), post({ place: "google", created_at: iso(NOW - 4 * D) })],
    out: ["google picture"],
    went: true,
    says: {
      tile: "On Google · Saturday",
      status: "On Google · Sat 23:00",
      button: "post_to instagram",
      instagram: "Removed there Monday",
    },
  },
  {
    name: "14 let go because its day passed",
    file: picture,
    posts: [post({ ...never, status: "pulled", held_why: "late", held_reason: "Its day passed. It was not posted." })],
    out: [],
    went: false,
    says: {
      tile: "Ready to post",
      status: "Its day passed · It was not posted",
      button: "post",
      instagram: "Not yet",
    },
  },
  {
    name: "15 a story taken down within its day, while the feed post stays up",
    file: picture,
    posts: [
      post({ kind: "story", status: "taken_down", published_at: iso(NOW - 5 * H), created_at: iso(NOW - 5 * H) }),
      post(),
    ],
    out: ["instagram picture"],
    went: true,
    says: {
      tile: "On Instagram · Saturday",
      status: "On Instagram · Sat 23:00",
      button: "post_to google",
      instagram: "Posted Saturday",
    },
  },
  {
    name: "16 a post that came down, and a later one let go because its day passed",
    file: picture,
    posts: [
      post({
        ...never,
        status: "pulled",
        held_why: "late",
        held_reason: "Its day passed. It was not posted.",
        created_at: iso(NOW - D),
      }),
      post({ status: "taken_down" }),
    ],
    out: [],
    went: true,
    // It went out once: what last happened to it leads, and it is never "ready to post" again for the one let go.
    says: { tile: "Taken down", status: "Taken down", button: "again", instagram: "Taken down" },
  },
];

const keyOf = (at) => `${at.place} ${at.kind}`;
const placeOf = (key) => key.split(" ")[0];

/** A week whose slots are the case's posts, a slot each: what the Week's row says of the same piece. */
function weekRowOf(posts) {
  const slots = posts.map((p, i) => ({
    id: `slot-${i}`,
    creative: "creative-1",
    place: p.place,
    kind: p.kind,
    at: p.scheduled_for,
    state: "approved",
    title: "A piece",
    reason: null,
    file_id: "file-1",
    piece_id: null,
    post_id: p.id,
    intent: null,
    words: { line: null, over: null, under: null, caption: null, language: "en" },
    blocked_why: null,
    blocked_reason: null,
    ask: null,
    score: null,
  }));
  const page = {
    week: { plan: null, slots },
    made: [{ file: { id: "file-1" }, posts }],
    pieces: [],
    zone: "UTC",
    paused_at: null,
  };
  return weekRowsOf(page, NOW)[0] ?? null;
}

/** Every reader's answer for a case, with a made picture's or video's own places: Google takes no video. */
function readersOf({ file, posts }) {
  const isVideo = file.kind === "video";
  const onGoogle = posts.some((p) => p.place === "google" && p.status === "published");
  const takes = pieceTakesOf(posts, {
    instagram: true,
    google: !isVideo,
    onGoogle,
    facebook: false,
    fileKind: file.kind,
  });
  const mark = contentPieceMarkOf({ file, posts }, NOW, true);
  const lines = goesLinesOf(posts, { takeDown: null, when, nowMs: NOW, may: true });
  const pill = goesPillOf(lines, goesLeadOf(posts, null, NOW));
  const status = pieceStatusOf(posts, clock, NOW);
  const next = pieceNextOf(file, posts, takes, NOW);
  const places = placesOf(
    posts,
    {
      takes,
      wont: { instagram: null, google: null, facebook: null },
      offers: { instagram: true, google: !isVideo, facebook: false },
    },
    NOW,
  );
  return {
    mark,
    tile: contentMarkSaid(mark, day),
    tileTone: contentMarkToneOf(mark),
    lines,
    pill,
    status,
    // The status row says the pill where the piece has lines, else its own sentence (viewer/foot.tsx ViewerStatus).
    statusSaid: pill ? pill.said : status.said,
    next,
    button: next.is === "post_to" ? `post_to ${next.place}` : next.is,
    places,
    offered: takeDownOffered(posts, NOW),
    will: takeDownWillOf(posts, () => "yes", NOW),
    week: weekRowOf(posts),
  };
}

/** A pill's tone as the tile's dot would draw the same fact (viewer/foot.tsx PILL_TONE; grey is the tile's "ready"). */
const TILE_TONE_OF_PILL = { ok: "up", live: "going", you: "need", gone: "ready", "": "timed" };

for (const each of CASES) {
  test(`${each.name}: every reader says the words it is owed`, () => {
    const read = readersOf(each);
    const instagram = read.places.find((at) => at.place === "instagram");
    assert.deepEqual(
      {
        tile: read.tile,
        status: read.statusSaid,
        button: read.button,
        instagram: instagram ? viewerStandsSaid(instagram.stands, clock) : null,
      },
      each.says,
    );
  });

  test(`${each.name}: no reader says something untrue, and no two disagree`, () => {
    const read = readersOf(each);
    const out = new Set(each.out);
    const maybe = new Set(each.maybe ?? []);
    const outPlaces = new Set([...out].map(placeOf));
    const heldPlaces = new Set([...out, ...maybe].map(placeOf));

    // The tile: "On Instagram" names exactly the places something is up at; "Ready to post" only for a piece that
    // never went out; and where nothing leads over it, what is up is said.
    if (read.mark.is === "posted") assert.deepEqual(new Set(read.mark.places), outPlaces, "the tile's places");
    if (out.size === 0) assert.notEqual(read.mark.is, "posted", "nothing is up, and the tile says it is");
    if (read.mark.is === "ready" || read.mark.is === "save") assert.equal(each.went, false, "it went out once");
    if (!each.went) assert.ok(!["posted", "ended", "down"].includes(read.mark.is), "it never went out");

    // The open piece: a green line for each placement that is up, and for no other; its status in the tile's tone.
    const green = new Set(read.lines.filter((line) => line.tone === "ok").map(keyOf));
    assert.deepEqual(green, out, "the green lines are the placements that are up");
    const statusTone = read.pill ? TILE_TONE_OF_PILL[read.pill.tone] : read.status.tone;
    assert.equal(statusTone, read.tileTone, "the open status and the tile are one colour");
    if (read.mark.is === "posted")
      assert.ok(read.statusSaid.startsWith(read.tile.split(" · ")[0]), "they name the same place");

    // The button: never a place the piece already holds; plain Post only for a piece that never went out; and, where
    // nothing of it is up any more, Post again.
    if (read.next.is === "post_to") assert.ok(!heldPlaces.has(read.next.place), "a post there is out already");
    if (read.next.is === "post") assert.equal(each.went, false, "Post, of a piece that went out once");
    if (each.went && heldPlaces.size === 0) assert.equal(read.next.is, "again", "nothing is up: Post again");

    // The list of places: a place says Posted exactly where something is up there.
    for (const at of read.places) {
      const upThere = at.stands.is === "up" || at.upToo !== null;
      assert.equal(upThere, outPlaces.has(at.place), `${at.place}'s row`);
    }

    // Take down: offered exactly where a post is out or may be, and its confirm names exactly those, a story that ran
    // its day as gone already.
    assert.equal(read.offered, heldPlaces.size > 0, "the Take down offer");
    const reached = each.posts.filter((p) => read.will.some((w) => w.key === p.id && !w.will.startsWith("Gone")));
    assert.deepEqual(new Set(reached.map(keyOf)), new Set([...out, ...maybe]), "what the confirm would take down");
    for (const p of each.posts.filter((one) => one.status === "published" && storyRanItsDay(one, NOW)))
      assert.equal(read.will.find((w) => w.key === p.id)?.will, "Gone already: a story lasts a day");

    // The Week: green exactly where something is up and nothing needs its owner, and never "Goes up" of a post that
    // is not on its way.
    if (read.week) {
      if (read.week.tone === "ok") assert.ok(out.size > 0, "the Week says up, and nothing is");
      assert.ok(!read.week.line.startsWith("Goes up"), `the Week: ${read.week.line}`);
    }

    // And the standing itself, which they all read: its placements that are up are the ones the case names.
    const { placements } = pieceStandingOf(each.posts, null, NOW);
    const up = placements.flatMap((at) => [at, ...(at.under ? [{ ...at.under, place: at.place, kind: at.kind }] : [])]);
    assert.deepEqual(new Set(up.filter((at) => at.standing.is === "up").map(keyOf)), out);
  });
}

test("a post removed at its place says so on every screen, and never that it was taken down (the review's A12)", () => {
  const says = STANDING_WORDS.removed;
  const read = readersOf({ file: picture, posts: [post(removedThere)] });
  const [line] = read.lines;
  const instagram = read.places.find((at) => at.place === "instagram");
  const every = {
    tile: read.tile,
    line: line.said,
    note: line.note,
    row: viewerStandsSaid(instagram.stands, clock),
    week: read.week.line,
    bell: `${says.bell.title("instagram", "The finish")} ${says.bell.body("instagram")}`,
  };
  assert.deepEqual(every, {
    tile: "Removed on Instagram · Monday",
    line: "Removed on Instagram · noticed Mon 23:00",
    note: "Chanlytics didn't take it down. It was deleted on Instagram itself.",
    row: "Removed there Monday",
    week: "Removed on Instagram",
    bell: "Removed on Instagram · The finish Chanlytics didn't take it down. It was deleted on Instagram itself.",
  });
  for (const [screen, words] of Object.entries(every)) assert.doesNotMatch(words, /Taken down/, screen);
  // Grey, with nothing to press but Post again: it is not up, and nothing waits for its owner.
  assert.deepEqual([read.tileTone, line.tone, read.button, read.offered], ["ready", "gone", "again", false]);
  // The same post taken down from here says that, on the same screens, and never "Removed".
  const ours = readersOf({ file: picture, posts: [post(cameDown)] });
  const oursSaid = [ours.tile, ours.lines[0].said, ours.week.line];
  assert.deepEqual(oursSaid, ["Taken down · Monday", "Taken down · Mon 23:00", "Taken down"]);
  assert.equal(ours.lines[0].note ?? null, null, "a take-down from here needs no second sentence");
  // A piece's take-down, where it kept when its place said it was gone, is the time said: never when the row moved.
  const asked = {
    cause: "owner_removed",
    asked_at: iso(MON - 2 * H),
    finished_at: iso(MON - H),
    actions: [
      {
        id: "a1",
        target: "post",
        target_id: "post-kept",
        act: "take_down",
        outcome: "done",
        said: null,
        started_at: iso(MON - 2 * H),
        finished_at: iso(MON - H),
        left_up_by: null,
        name: null,
      },
    ],
  };
  const kept = post({ ...cameDown, id: "post-kept" });
  assert.deepEqual(placementStandingOf(kept, asked, NOW), { is: "came_down", at: iso(MON - H), there: false });
});

test("the words of each standing are the one table's: what a tile, a line, a row and the Week say (the review's C5)", () => {
  const says = STANDING_WORDS;
  // Each case's words above are literal, so a change to the table is seen there. Here: every reader of one standing
  // takes its words from the same row of the table, column by column.
  const up = readersOf({ file: picture, posts: [post()] });
  const instagram = (read) => viewerStandsSaid(read.places.find((at) => at.place === "instagram").stands, clock);
  assert.deepEqual(
    [up.tile, up.lines[0].said, instagram(up), up.week.line],
    [
      says.up.tile(["instagram"], "Saturday"),
      says.up.line("instagram", "Sat 23:00"),
      says.up.row("Saturday"),
      says.up.week(["instagram"], up.week.line.split(" · ")[1]),
    ],
  );
  const ended = readersOf({ file: picture, posts: [post({ kind: "story" })] });
  assert.deepEqual(
    [ended.tile, ended.lines[0].said, instagram(ended), ended.week.line],
    [says.ended.tile("Sunday"), says.ended.line("Sun 23:00"), says.ended.row("Sunday"), says.ended.week],
  );
  const refused = post({ ...never, status: "failed", error: "Instagram did not take the post." });
  const stopped = readersOf({ file: picture, posts: [refused] });
  assert.deepEqual(
    [stopped.tile, stopped.statusSaid, instagram(stopped)],
    [says.stopped.tile, says.stopped.status("instagram"), says.stopped.row],
  );
  assert.ok(stopped.lines[0].said.startsWith(says.stopped.line(null)), stopped.lines[0].said);
  assert.ok(stopped.week.line.startsWith(says.stopped.status("instagram")), stopped.week.line);
  const unsure = readersOf({
    file: picture,
    posts: [post({ ...never, published_at: iso(NOW - 3 * H), created_at: iso(NOW - 3 * H) })],
  });
  assert.deepEqual(
    [unsure.tile, unsure.lines[0].said, instagram(unsure), unsure.week.line],
    [
      says.unconfirmed.tile("instagram"),
      says.unconfirmed.line("instagram"),
      says.unconfirmed.row,
      says.unconfirmed.week("instagram"),
    ],
  );
  // What AI is told of each standing is a clause of its own in the same row: none is empty, none ends a sentence.
  for (const [standing, row] of Object.entries(says)) {
    const clause = typeof row.ai === "function" ? row.ai("instagram", "Monday") : row.ai;
    assert.match(clause, /^[a-z].*[^.]$/, `${standing}: ${clause}`);
  }
  // "Ready to post" is said of a piece that never went out, and by no other row.
  const tiles = Object.entries(says).flatMap(([standing, row]) =>
    "tile" in row ? [[standing, typeof row.tile === "function" ? row.tile("instagram", "Monday") : row.tile]] : [],
  );
  assert.deepEqual(
    tiles.filter(([, words]) => words === "Ready to post").map(([standing]) => standing),
    ["never"],
  );
});

test("a video with no road from here is saved on its tile and in its open piece alike; with one, both say Ready to post", () => {
  const takesNone = pieceTakesOf([], { instagram: false, google: false, onGoogle: false, fileKind: "video" });
  assert.equal(contentMarkSaid(contentPieceMarkOf({ file: video, posts: [] }, NOW, false), day), "Ready to save");
  assert.deepEqual(pieceNextOf(video, [], takesNone, NOW), { is: "save" });
  const takesReel = pieceTakesOf([], { instagram: true, google: false, onGoogle: false, fileKind: "video" });
  assert.equal(contentMarkSaid(contentPieceMarkOf({ file: video, posts: [] }, NOW, true), day), "Ready to post");
  assert.deepEqual(pieceNextOf(video, [], takesReel, NOW), { is: "post" });
});

test("a post let go because its day passed is said beside the one that speaks, never in its place", () => {
  const late = post({
    ...never,
    status: "pulled",
    held_why: "late",
    held_reason: "Its day passed. It was not posted.",
    created_at: iso(NOW - D),
  });
  // Over a post that is still up: both lines, and the piece is on Instagram.
  const up = readersOf({ file: picture, posts: [late, post()] });
  assert.deepEqual(
    up.lines.map((line) => [line.said, line.tone]),
    [
      ["Its day passed · It was not posted", "gone"],
      ["On Instagram · Sat 23:00", "ok"],
    ],
  );
  assert.equal(up.tile, "On Instagram · Saturday");
  // Over one that came down: both lines, and the status is the tile's.
  const down = readersOf({ file: picture, posts: [late, post({ status: "taken_down" })] });
  assert.deepEqual(
    down.lines.map((line) => line.said),
    ["Its day passed · It was not posted", "Taken down"],
  );
  assert.equal(down.statusSaid, down.tile);
});

test("a story's day is one rule: up until the last moment of its day, ended from it, whoever asks", () => {
  const story = post({ kind: "story", published_at: iso(NOW - D + 1), created_at: iso(NOW - D + 1) });
  assert.equal(storyRanItsDay(story, NOW), false);
  assert.equal(placementStandingOf(story, null, NOW).is, "up");
  assert.equal(takeDownOffered([story], NOW), true);
  const ended = { ...story, published_at: iso(NOW - D) };
  assert.equal(storyRanItsDay(ended, NOW), true, "at the day's last moment it has ended");
  assert.deepEqual(placementStandingOf(ended, null, NOW), { is: "ended", at: iso(NOW) });
  assert.equal(takeDownOffered([ended], NOW), false);
  assert.equal(contentPieceMarkOf({ file: picture, posts: [ended] }, NOW, true).is, "ended");
  // No time it went up is kept: a day after the time it was set for, and never up for good.
  const undated = { ...story, published_at: null, scheduled_for: iso(NOW - 2 * D) };
  assert.equal(storyRanItsDay(undated, NOW), true);
  // A post or a reel has no day.
  assert.equal(storyRanItsDay(post({ published_at: iso(NOW - 30 * D) }), NOW), false);
});

test("the unit is a place and a kind: a story that stopped is not hidden by a post that went up after it", () => {
  const posts = [
    post({ created_at: iso(NOW - H), published_at: iso(NOW - H) }),
    post({ ...never, kind: "story", status: "failed", error: "Instagram is busy right now.", created_at: iso(SAT) }),
  ];
  const read = readersOf({ file: picture, posts });
  assert.equal(read.tile, "Didn't post");
  assert.equal(read.statusSaid, "Didn't post on Instagram");
  assert.equal(read.button, "again");
  // The post beside it is still said, and still reached by Take down.
  assert.ok(read.lines.some((line) => line.kind === "picture" && line.tone === "ok"));
  assert.equal(read.offered, true);
});
