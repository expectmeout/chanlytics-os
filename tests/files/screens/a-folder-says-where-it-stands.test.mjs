/**
 * A watched folder says where it stands, in one reading every screen shares (packages/contracts/src/files/footage.ts;
 * the footage sources plan's P5 and its canvas "A watched folder: every screen"). The row in Settings, Content's card
 * and the Library's line are made from the same standing, so the three cannot say different things of one folder.
 * Every state has the owner's words: what is happening, whether it mends itself, and the one thing to do. None is a
 * code, and none is Google's wording.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import {
  CONNECTION_GROUP_WORDS,
  connectionRows,
} from "../../../apps/dashboard/src/surfaces/settings/connections/model/setup.ts";

const { FOOTAGE_WORDS, footageLineOf, footageSheetOf, footageStandingOf } = await importSrc(
  "packages/contracts/src/files/footage.ts",
);
const { contentSourcesSaid } = await importSrc("packages/contracts/src/content/sources.ts");

const WHO = "maria@example.com";
const clock = () => "2:14 PM";
const account = (over = {}) => ({
  id: "a",
  email: WHO,
  health: "ok",
  connected_by: "Dana Ruiz",
  by_you: false,
  ...over,
});
const counts = (over = {}) => ({
  found: 258,
  in: 46,
  coming: 0,
  landed: 0,
  away: 0,
  processing: 0,
  ...over,
  waits: { budget: 0, room: 0, library_full: 0, videos_off: 0, ...(over.waits ?? {}) },
  missed: { failed: 0, too_long: 0, too_large: 0, ...(over.missed ?? {}) },
});
const folder = (over = {}) => ({
  id: "s",
  provider_id: "drive-folder",
  name: "Salon clips",
  state: "watching",
  subfolders: true,
  looking: false,
  held: null,
  over_listed: false,
  updated_at: "2026-11-19T19:14:00.000Z",
  counts: counts(),
  ...over,
});
const footage = (over = {}) => ({ offered: true, can_change: true, account: account(), folder: folder(), ...over });

/** Every state the canvas draws, by the standing it must read as. */
const STATES = {
  not_connected: footage({ account: null, folder: null }),
  blocked: footage({ account: account({ health: "blocked_by_admin", email: null }), folder: null }),
  not_watching: footage({ folder: null }),
  looking: footage({ folder: folder({ state: "setting_up", looking: true, counts: counts({ found: 214, in: 0 }) }) }),
  bringing_in: footage({ folder: folder({ counts: counts({ in: 12, coming: 28, landed: 12 }) }) }),
  waits_tomorrow: footage({ folder: folder({ counts: counts({ waits: { budget: 40 } }) }) }),
  waits_room: footage({ folder: folder({ counts: counts({ waits: { room: 12 } }) }) }),
  videos_full: footage({
    folder: folder({
      counts: counts({ waits: { room: 12 } }),
      videos: { total: 3600, can_step_aside: 0, set_aside: 540, own: 2700, made: 360, found: 0 },
    }),
  }),
  library_full: footage({ folder: folder({ counts: counts({ coming: 3, waits: { library_full: 8 } }) }) }),
  videos_off: footage({ folder: folder({ counts: counts({ waits: { videos_off: 6 } }) }) }),
  signed_out: footage({ account: account({ health: "needs_reconnect" }), folder: folder({ state: "paused" }) }),
  connector_left: footage({ folder: folder({ state: "paused" }) }),
  cant_open: footage({ folder: folder({ state: "frozen" }) }),
  checking_left: footage({ folder: folder({ held: 23 }) }),
  watching: footage(),
};

/** Words an owner never reads: a state's code, a provider's term, the plumbing. */
const CODES = /_|\b(null|undefined|NaN|sync|token|oauth|scope|grant|quota|webhook|cursor|needs_reconnect)\b/i;

test("every state reads as its own standing, in words with no code in them", () => {
  for (const [key, dto] of Object.entries(STATES)) {
    const standing = footageStandingOf(dto, clock);
    assert.equal(standing.key, key);
    for (const said of [standing.badge, standing.say, standing.note ?? ""]) {
      assert.ok(!CODES.test(said), `${key}: "${said}" reads like a code`);
      assert.ok(!/[;—]/.test(said), `${key}: "${said}" holds a semicolon or a long dash`);
    }
    assert.ok(standing.badge.length <= 28, `${key}: a badge is a few words, "${standing.badge}"`);
    if (standing.act) assert.ok(FOOTAGE_WORDS.acts[standing.act], `${key}: its act has a word`);
  }
});

test("the words the canvas decided: bringing in, a day's allowance, room, signed out, whoever connected it left", () => {
  const said = (key) => footageStandingOf(STATES[key], clock);
  assert.equal(said("bringing_in").badge, "Bringing in 12 of 40");
  assert.equal(said("looking").say, "214 photos and videos found so far. The newest 50 come in first.");
  assert.equal(said("waits_tomorrow").badge, "40 wait for tomorrow");
  assert.equal(said("waits_room").badge, "12 wait for room");
  // Call 3: a wait while clips can step aside, and "Videos are full" when none can, saying what fills the minutes.
  assert.deepEqual(
    [said("videos_full").badge, said("videos_full").tone, said("videos_full").act],
    ["Videos are full", "you", "open_library"],
  );
  assert.equal(said("videos_full").note, "12 wait. 45 of your 60 minutes are videos you added.");
  const stepping = footage({
    folder: folder({
      counts: counts({ waits: { room: 12 } }),
      videos: { total: 3600, can_step_aside: 600, set_aside: 0, own: 3000, made: 0, found: 0 },
    }),
  });
  assert.equal(footageStandingOf(stepping, clock).key, "waits_room", "a clip can step aside: it waits");
  assert.deepEqual([said("library_full").badge, said("library_full").act], ["Library is full", "open_library"]);
  assert.equal(said("signed_out").say, `Google signed ${WHO} out, so nothing new comes in. What came in stays.`);
  assert.equal(
    said("connector_left").say,
    "Dana Ruiz connected this folder and has left the workspace. What came in stays.",
  );
  assert.equal(said("watching").say, "46 photos and videos in · Updated 2:14 PM");
  assert.equal(said("checking_left").badge, "Checking 23 that left");
  // Before anything has landed the line counts what is on its way, never "0 of".
  const first = footageStandingOf(footage({ folder: folder({ counts: counts({ in: 0, coming: 40 }) }) }), clock);
  assert.equal(first.badge, "Bringing in 40");
});

test("only what the owner must mend is theirs: every other standing ends by itself or asks nothing", () => {
  const yours = Object.keys(STATES).filter((key) => footageStandingOf(STATES[key], clock).tone === "you");
  assert.deepEqual(yours.sort(), ["cant_open", "connector_left", "library_full", "signed_out", "videos_full"]);
  for (const key of yours) assert.ok(footageStandingOf(STATES[key], clock).act, `${key} names the one thing to do`);
});

test("Connections' head counts a folder as needing attention only where someone must mend it, never for watching nothing", () => {
  const headOf = (dto) => {
    const row = connectionRows(
      {
        tz: "UTC",
        channels: [],
        whatsapp: null,
        lines: { rows: [], ready: false },
        lineRequestedAt: null,
        google: null,
        calendar: null,
        footage: dto,
      },
      Date.parse("2026-11-19T20:00:00Z"),
    ).find((line) => line.kind === "drive");
    return row.group === "connected" ? CONNECTION_GROUP_WORDS.connected.sub([row]) : null;
  };
  const asking = Object.keys(STATES).filter((key) => headOf(STATES[key]) === "1 connected · 1 needs attention");
  assert.deepEqual(asking.sort(), ["blocked", "connector_left", "library_full", "signed_out", "videos_full"]);
  // Drive connected and no folder watched, or the one it watched stopped, loses nothing: the head said "2 need attention"
  // over a row that said "Not watching" and offered nothing to mend (21 Nov 2026).
  assert.equal(headOf(STATES.not_watching), "1 connected");
  assert.equal(headOf(footage({ folder: folder({ state: "stopped" }) })), "1 connected");
});

test("Settings' row, Content's card and the Library's line say the same thing of one folder", () => {
  for (const [key, dto] of Object.entries(STATES)) {
    const standing = footageStandingOf(dto, clock);
    const row = connectionRows(
      {
        tz: "America/New_York",
        channels: [],
        whatsapp: null,
        lines: { rows: [], ready: false },
        lineRequestedAt: null,
        google: null,
        calendar: null,
        footage: dto,
      },
      Date.parse("2026-11-19T20:00:00Z"),
    ).find((line) => line.kind === "drive");
    assert.equal(row.stateWords, standing.badge, `${key}: the row's state`);
    if (!dto.folder) continue;
    const card = contentSourcesSaid({ places: [], film: [] }, true, { name: dto.folder.name, standing, offered: true });
    const line = card.lines.find((l) => l.place === "folder");
    assert.equal(line.status, standing.badge, `${key}: the card's line`);
    const above = footageLineOf(dto, standing);
    // The Library's line is absent where nothing needs saying, and otherwise leads with the same state or names it.
    if (above && !["signed_out", "connector_left", "cant_open", "waits_room"].includes(key))
      assert.equal(above.head, standing.badge, `${key}: the Library's line`);
  }
  assert.equal(
    footageLineOf(STATES.watching, footageStandingOf(STATES.watching, clock)),
    null,
    "quiet and well: no line",
  );
  assert.equal(footageLineOf(STATES.not_watching, footageStandingOf(STATES.not_watching, clock)), null);
});

test("a member who may not change it is offered nothing to press, and a workspace not offered it has no row to connect", () => {
  const rowOf = (dto) =>
    connectionRows(
      {
        tz: "UTC",
        channels: [],
        whatsapp: null,
        lines: { rows: [], ready: false },
        lineRequestedAt: null,
        google: null,
        calendar: null,
        footage: dto,
      },
      Date.now(),
    ).find((line) => line.kind === "drive");
  const reader = rowOf(
    footage({
      can_change: false,
      account: account({ health: "needs_reconnect" }),
      folder: folder({ state: "paused" }),
    }),
  );
  assert.deepEqual([reader.verb, reader.acts ?? []], [null, []], "they read where it stands, and press nothing");
  const owner = rowOf(STATES.watching);
  assert.deepEqual(
    owner.acts.map((act) => act.label),
    ["Check now", "Stop watching", "Disconnect"],
    "the quiet acts, the one that lets go last",
  );
  assert.equal(rowOf(footage({ offered: false, account: null, folder: null })).state, "later");
  assert.equal(rowOf(null).state, "later", "unread, it promises nothing");
});

test("a folder that can't be opened mends itself: its row stays joined with a quiet way on, and the card asks nothing", () => {
  const standing = footageStandingOf(STATES.cant_open, clock);
  // An address opens the sentence as it is written, never capitalised.
  assert.equal(
    standing.say,
    `${WHO} can no longer open “Salon clips”, and nothing was removed. Chanlytics carries on by itself once it opens.`,
  );
  const row = connectionRows(
    {
      tz: "UTC",
      channels: [],
      whatsapp: null,
      lines: { rows: [], ready: false },
      lineRequestedAt: null,
      google: null,
      calendar: null,
      footage: STATES.cant_open,
    },
    Date.now(),
  ).find((line) => line.kind === "drive");
  assert.equal(row.verb, null, "no loud press for a wait that ends by itself");
  assert.equal(row.tone, "warn", "its badge still says it in amber");
  assert.deepEqual(
    row.acts.map((act) => act.label),
    ["Choose another folder", "Check now", "Stop watching", "Disconnect"],
  );
  const card = contentSourcesSaid({ places: [], film: [] }, true, { name: "Salon clips", standing, offered: true });
  assert.deepEqual(card.folder, { note: "Nothing was removed. Chanlytics keeps trying.", tone: "rest", act: null });
  // A Workspace that blocks apps has nothing connected to let go: its row offers the steps alone.
  const blocked = connectionRows(
    {
      tz: "UTC",
      channels: [],
      whatsapp: null,
      lines: { rows: [], ready: false },
      lineRequestedAt: null,
      google: null,
      calendar: null,
      footage: STATES.blocked,
    },
    Date.now(),
  ).find((line) => line.kind === "drive");
  assert.deepEqual([blocked.verb?.label, blocked.acts ?? []], ["Copy the steps for them", []]);
});

test("the folder's sheet lists what came in, what waits and what was passed over, each with its reason", () => {
  const rows = footageSheetOf(STATES.watching, [
    { state: "waiting", why: "budget", videos: 30, photos: 10, name: null },
    { state: "too_big", why: "seconds", videos: 3, photos: 0, name: null },
    { state: "not_media", why: "kind", videos: 0, photos: 1, name: "IMG_1.CR3" },
    { state: "not_media", why: "empty", videos: 0, photos: 1, name: "empty.jpg" },
    { state: "failed", why: "stream", videos: 1, photos: 0, name: "IMG_2291.MOV" },
    { state: "listed", why: null, videos: 12, photos: 200, name: null },
  ]);
  assert.deepEqual(
    rows.map((row) => [row.head, row.count]),
    [
      ["In your Library", 46],
      ["Wait for tomorrow", 40],
      ["Too long to watch", 3],
      ["Not photos or videos AI can use", 2],
      ["Couldn't be brought in", 1],
      ["Older than 30 days", 212],
    ],
  );
  assert.equal(rows.at(-2).say, "“IMG_2291.MOV” was tried three times. Check that it plays in Drive.");
  // A file is named as its owner named it; everything around the name is the app's own words.
  for (const row of rows)
    assert.ok(!CODES.test(`${row.head} ${(row.say ?? "").replace(/“[^”]*”/g, "")}`), `"${row.head}" reads like a code`);
});
