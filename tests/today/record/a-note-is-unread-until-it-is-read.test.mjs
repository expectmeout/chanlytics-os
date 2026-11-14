/**
 * A note is unread until it is read (decision 0124; the bell's stage 1).
 *
 * The bell kept one moment a member, when they last looked, and it answered two questions: what is new since the look
 * (the number) and what have they read (a row's dot). Closing the bell and Mark all read both wrote it, so a look read
 * everything, and Mark all read went with the dots without a press. A second moment beside it, how far the member has
 * read, is what the dots read now: Mark all read moves it, a look does not. The number is counted as it was.
 *
 * Run on the contracts' rule over the rows GET notifications answers, on the bell's rows (bellFeed), and on the bridge's
 * bell with a stand-in for the server's door.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  applyReadState,
  BELL_READ_WORDS,
  bellReadThroughMs,
  buildNotificationFeed,
  keptUnreadOf,
  serverNotificationRows,
  unreadFor,
} from "@chanlytics/contracts";
import { bellFeed } from "../../../apps/dashboard/src/bridge/surfaces/hold-rows.ts";
import { importSrc } from "../../_source.mjs";
import { settingsRead } from "./_world.mjs";
import { until } from "../../shared/_until.mjs";

const NOW = Date.parse("2026-11-11T15:00:00Z");
const ago = (min) => NOW - min * 60_000;
const iso = (ms) => new Date(ms).toISOString();

/** A kept row as GET notifications answers it, `at` its moment. */
const rowAt = (id, at, over = {}) => ({
  id,
  kind: "booking",
  title: `Row ${id}`,
  body: "Words.",
  route: "calendar",
  subject_type: null,
  subject_id: null,
  created_at: iso(at),
  read: false,
  dismissed: false,
  ...over,
});
const row = (id, min, over) => rowAt(id, ago(min), over);
/** An Inbox thread that needs a person, waiting `min` minutes: the row the browser derives. */
const thread = (id, min) => ({ id, real: true, needsYou: true, who: "Dani", escalatedAtMs: ago(min) });
const dots = (rows) => rows.map((r) => [r.key, r.unread]);

test("a look reads nothing: a row newer than the read-through moment keeps its dot, whenever the member last looked", () => {
  const dto = {
    notifications: [row("a", 5), row("b", 30), row("c", 90)],
    seen_at: iso(ago(1)),
    read_through_at: iso(ago(60)),
  };
  assert.equal(bellReadThroughMs(dto), ago(60));
  assert.deepEqual(
    dots(serverNotificationRows(dto)),
    [
      ["n:a", true],
      ["n:b", true],
      ["n:c", false],
    ],
    "REGRESSION: the look a minute ago read every note",
  );
  assert.deepEqual(
    dots(serverNotificationRows({ ...dto, notifications: [row("a", 5, { read: true }), row("b", 30)] })),
    [
      ["n:a", false],
      ["n:b", true],
    ],
    "a note read where it stands loses its own dot, and no other",
  );
});

test("the number is counted as it was, from the look: the page's icon and the edge's badge do not read the new moment", () => {
  const dto = {
    notifications: [row("a", 5), row("b", 30), row("c", 90)],
    seen_at: iso(ago(10)),
    read_through_at: iso(ago(60)),
  };
  assert.equal(keptUnreadOf(dto), 1, "one note since the look, though two wear a dot");
  assert.equal(
    unreadFor(
      dto.notifications.map((n) => ({ id: n.id, created_at: n.created_at })),
      dto.seen_at,
      [],
    ),
    1,
    "the edge's count before a push is the same number",
  );
  assert.equal(keptUnreadOf({ ...dto, seen_at: iso(ago(1)) }), 0, "a look clears the number");
});

test("a server that says no read-through moment reads as it did: the dots follow the look; none known reads nothing", () => {
  const before = { notifications: [row("a", 5), row("b", 30)], seen_at: iso(ago(10)) };
  assert.equal(bellReadThroughMs(before), ago(10));
  assert.deepEqual(dots(serverNotificationRows(before)), [
    ["n:a", true],
    ["n:b", false],
  ]);
  const never = { notifications: [row("a", 5)], seen_at: null, read_through_at: null };
  assert.equal(bellReadThroughMs(never), 0);
  assert.deepEqual(dots(serverNotificationRows(never)), [["n:a", true]]);
  assert.equal(bellReadThroughMs(null), 0);
  assert.equal(bellReadThroughMs(undefined), 0);
  assert.deepEqual(serverNotificationRows(null), []);
});

test("a row the browser derives follows the same moment: read through, or read where it stands, never by a look", () => {
  const items = buildNotificationFeed({ threads: [thread("t1", 5), thread("t9", 120)], now: NOW });
  const looked = { seenAt: NOW, read: [], dismissed: [], alerts: false };
  assert.deepEqual(dots(applyReadState(items, looked, ago(30))), [
    ["needs:t1", true],
    ["needs:t9", false],
  ]);
  assert.deepEqual(dots(applyReadState(items, { ...looked, read: ["needs:t1"] }, 0)), [
    ["needs:t1", false],
    ["needs:t9", true],
  ]);
  assert.deepEqual(dots(applyReadState(items, { ...looked, dismissed: ["needs:t9"] }, 0)), [["needs:t1", true]]);
});

test("the bell's rows: this device's last look reads nothing once the server says how far the member has read", () => {
  const derived = buildNotificationFeed({ threads: [thread("t1", 5)], now: NOW });
  const device = { seenAt: NOW, read: [], dismissed: [], alerts: false };
  const kept = { notifications: [row("a", 5)], seen_at: iso(NOW), read_through_at: iso(ago(60)) };
  assert.deepEqual(
    bellFeed({ derived, device, kept }).map((r) => r.unread),
    [true, true],
    "looked at a moment ago, read through an hour ago: both wear a dot",
  );
  assert.deepEqual(
    bellFeed({ derived, device, kept: { ...kept, read_through_at: iso(NOW) } }).map((r) => r.unread),
    [false, false],
    "Mark all read reads the derived row and the kept one together",
  );
  assert.deepEqual(
    bellFeed({ derived, device, kept: null }).map((r) => r.unread),
    [false],
    "before the bell's rows are read, this device's last look stands in, as it did",
  );
});

test("the bell's words for what is read: what a press did, the check, the closed bell's name and tip, a save that failed", () => {
  assert.equal(BELL_READ_WORDS.done(1), "1 marked read");
  assert.equal(BELL_READ_WORDS.done(9), "9 marked read");
  assert.equal(BELL_READ_WORDS.unread, "Unread", "REGRESSION: the section over unread notes said New after a look");
  assert.equal(BELL_READ_WORDS.readOneOf("9 calls"), "Mark read: 9 calls");
  // The closed bell: what is new since the look; once looked at, what is still unread; else its name alone.
  assert.equal(BELL_READ_WORDS.name(6, 8), "Notifications, 6 new");
  assert.equal(BELL_READ_WORDS.name(0, 3), "Notifications, 3 unread");
  assert.equal(BELL_READ_WORDS.name(0, 0), "Notifications");
  assert.equal(BELL_READ_WORDS.tip(6, 8), "6 new — what needs you");
  assert.equal(BELL_READ_WORDS.tip(0, 3), "3 unread");
  assert.equal(BELL_READ_WORDS.tip(0, 0), undefined, "nothing to say over a bell with nothing in it");
  // A save that failed says what happened, where the notes stand now, and the one thing to do.
  assert.match(BELL_READ_WORDS.readFailed, /didn't save.*unread again.*once more/);
  assert.match(BELL_READ_WORDS.undoFailed, /didn't save.*stay read/);
});

/* ------------------------------------------------------ the bridge's bell ------------------------------------------------------ */

const bridge = await importSrc("apps/dashboard/src/bridge/notifications.ts");
// The bell reads the open invitations from the settings surface (its `invites`; a name on its own window, `__TEAM_INVITES`,
// until 11 Nov 2026): every bell here is a workspace whose team read landed with none open.
const { setSurfaceValue: landRead } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
landRead("settings", settingsRead());
const requests = [];
/** The server's door, standing in: what it answers a mark, as its data; nothing is a refusal. Each test says its own. */
const door = { answer: () => null };
const envelope = (data) =>
  data
    ? new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } })
    : new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "stand-in" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
const was = globalThis.window;
globalThis.window = {
  // The request is what is read. No surface runner is mounted here, so a write that lands reads no surface again.
  fetch: async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    requests.push({ url: String(url), method: init?.method, body });
    return envelope(init?.method === "PUT" ? await door.answer(body) : null);
  },
  location: { pathname: "/w/marisas", hash: "", origin: "https://app.chanlytics.com", assign() {} },
};
after(() => {
  globalThis.window = was;
});

const puts = () =>
  requests.filter((r) => r.method === "PUT" && r.url.includes("/api/v1/notifications")).map((r) => r.body);
/** A moment `min` minutes before the real clock, which the bridge reads. */
const live = (min) => new Date(Date.now() - min * 60_000).toISOString();
const liveRow = (id, min) => rowAt(id, Date.now() - min * 60_000);
/** A millisecond past a kept row's moment: what Mark all read reads up to when that row is the newest the tab holds. */
const justPast = (kept) => iso(Date.parse(kept.created_at) + 1);
/** A failed write's second try comes this soon here, not after the app's two seconds. */
const RETRY_MS = 5;
/** A bell on a device of its own, over the rows the workspace keeps; `hear` says a surface was read again. */
const bell = (dto) => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const heard = {};
  const win = {
    addEventListener: (ev, fn) => (heard[ev] ??= []).push(fn),
    document: { visibilityState: "visible" },
    focus() {},
    location: { hash: "" },
    INBOX_DATA: { THREADS: [] },
    __LIVE: { now: [], recent: [] },
    __NOTIFICATIONS: dto ? { dto } : null,
  };
  const hear = (ev) => (heard[ev] ?? []).forEach((fn) => fn());
  return { api: bridge.installNotifications(win, storage, RETRY_MS), win, hear };
};
const feedDots = (api) => api.feed().map((r) => [r.id, r.unread]);
/** The door as 00622 answers: a read says where the member stood (`stood`), an Undo the moment it went back to. */
const answering = (stood) => (body) =>
  body.read_all
    ? { seen_at: live(0), read_through_at: body.read_through, was: stood }
    : body.read_through
      ? { seen_at: null, read_through_at: body.read_through, was: null }
      : { seen_at: live(0) };
/** A bell with one unread note five minutes old and one read, thirty: read through twenty minutes ago. */
const twoNotes = () => {
  const through = live(20);
  const dto = { notifications: [liveRow("a", 5), liveRow("b", 30)], seen_at: live(20), read_through_at: through };
  return { through, dto, ...bell(dto) };
};
const ONE_UNREAD = [
  ["n:a", true],
  ["n:b", false],
];
const NONE_UNREAD = [
  ["n:a", false],
  ["n:b", false],
];

test("closing the bell is a look: the number starts again, the look is written, and every dot stays", async () => {
  requests.length = 0;
  door.answer = answering(null);
  const { api } = bell({ notifications: [liveRow("a", 5), liveRow("b", 30)], seen_at: null, read_through_at: null });
  assert.equal(api.unread(), 2);
  api.seenAll();
  await until(() => puts().length > 0, "the look is written");
  assert.deepEqual(puts(), [{ seen: true }], "a look writes the look, and reads nothing");
  assert.equal(api.unread(), 0, "the number starts again from the look");
  assert.deepEqual(
    feedDots(api),
    [
      ["n:a", true],
      ["n:b", true],
    ],
    "REGRESSION: closing the bell read every note, and Mark all read went with the dots",
  );
});

test("Mark all read reads the notes this tab holds, up to the newest and no further: a note that arrives after keeps its dot", async () => {
  requests.length = 0;
  const { api, dto, through, win, hear } = twoNotes();
  door.answer = answering(through);
  assert.deepEqual(feedDots(api), ONE_UNREAD);
  const press = api.readAll();
  assert.equal(press.read, 1, "how many notes the press read");
  assert.deepEqual(feedDots(api), NONE_UNREAD, "at once, before the server answers");
  assert.equal(api.unread(), 0);
  assert.equal(await press.saved, true);
  const upTo = justPast(dto.notifications[0]);
  assert.deepEqual(
    puts(),
    [{ read_all: true, read_through: upTo }],
    "REGRESSION: it sent no moment, and the server read every note up to the press, seen or not",
  );
  // A note lands and the bell's rows are read again: the server says how far the press read.
  const late = rowAt("late", Date.now() + 1_000);
  win.__NOTIFICATIONS = { dto: { ...dto, notifications: [late, ...dto.notifications], read_through_at: upTo } };
  hear("surface:notifications");
  assert.deepEqual(
    feedDots(api),
    [["n:late", true], ...NONE_UNREAD],
    "the note that was not on the screen is unread, held press or not",
  );
});

test("Undo goes back to where the server says the member stood, after the read it undoes, and leaves the look", async () => {
  requests.length = 0;
  const { api, dto } = twoNotes();
  // Another device read up to two minutes ago since this tab's rows were read: the door answers that moment.
  const stood = live(2);
  let answerRead;
  const held = new Promise((r) => (answerRead = r));
  door.answer = async (body) => {
    if (body.read_all) await held;
    return answering(stood)(body);
  };
  const press = api.readAll();
  const undone = press.undo();
  assert.deepEqual(feedDots(api), ONE_UNREAD, "at once: the dots where this tab held them");
  assert.equal(api.unread(), 0, "an Undo leaves the look where it is: the number does not come back");
  await until(() => puts().length > 0, "the read is written");
  assert.deepEqual(
    puts(),
    [{ read_all: true, read_through: justPast(dto.notifications[0]) }],
    "REGRESSION: the Undo left with the read, and on a slow line could land ahead of it and be lost",
  );
  answerRead();
  assert.equal(await undone, true);
  assert.deepEqual(
    puts().at(-1),
    { read_through: stood },
    "REGRESSION: it sent this tab's own idea of where the dots stood, wrong once another device had read",
  );
  assert.deepEqual(feedDots(api), NONE_UNREAD, "what the other device had read stays read");
});

test("a read that does not save is tried once more, then said: the dots are back at once, and there is nothing to undo", async () => {
  requests.length = 0;
  const { api } = twoNotes();
  door.answer = () => null;
  const press = api.readAll();
  assert.deepEqual(feedDots(api), NONE_UNREAD, "at once, as ever");
  assert.equal(await press.saved, false, "REGRESSION: a failed Mark all read was silent");
  assert.equal(puts().length, 2, "tried once more");
  assert.deepEqual(feedDots(api), ONE_UNREAD, "the dots are back now, not at the next read");
  assert.equal(await press.undo(), true, "nothing was saved, so nothing is put back and nothing more is said");
  assert.equal(puts().length, 2);
  assert.deepEqual(feedDots(api), ONE_UNREAD);
});

test("a read that saves on its second try may have landed on its first: Undo takes the earlier moment", async () => {
  requests.length = 0;
  const { api, through } = twoNotes();
  let tries = 0;
  // The first try reached the door and its answer was lost, so the second finds the member already read up to it.
  door.answer = (body) => {
    if (!body.read_all) return answering(null)(body);
    tries += 1;
    return tries === 1 ? null : answering(body.read_through)(body);
  };
  const press = api.readAll();
  assert.equal(await press.saved, true);
  assert.equal(await press.undo(), true);
  assert.deepEqual(puts().at(-1), { read_through: through }, "back to where this tab held the dots");
});

test("an Undo that does not save says so, and the notes stay read", async () => {
  requests.length = 0;
  const { api, dto, through, win } = twoNotes();
  door.answer = (body) => (body.read_all ? answering(through)(body) : null);
  const press = api.readAll();
  assert.equal(await press.saved, true);
  // The read landed, and the bell's rows as read again say so.
  win.__NOTIFICATIONS = { dto: { ...dto, read_through_at: justPast(dto.notifications[0]) } };
  assert.equal(await press.undo(), false);
  assert.equal(puts().filter((p) => !p.read_all).length, 2, "tried once more");
  assert.deepEqual(feedDots(api), NONE_UNREAD, "as the server has them");
});

test("with no note in the tab, Mark all read is a look: nothing the tab never showed is read", async () => {
  requests.length = 0;
  door.answer = answering(null);
  const { api } = bell(null);
  const press = api.readAll();
  assert.equal(press.read, 0);
  assert.equal(await press.saved, true);
  await until(() => puts().length > 0, "the look is written");
  assert.deepEqual(puts(), [{ seen: true }], "REGRESSION: with the rows not read yet it read every kept note");
});

test("a group is read by one press: the server's rows in one write, a derived row on this device", async () => {
  requests.length = 0;
  door.answer = () => ({ read: 2 });
  const { api, win } = bell({
    notifications: [liveRow("a", 5), liveRow("b", 6), liveRow("c", 7)],
    seen_at: null,
    read_through_at: null,
  });
  win.INBOX_DATA.THREADS = [thread("t1", 5)];
  assert.deepEqual(
    feedDots(api).filter(([, unread]) => unread).length,
    4,
    "three kept notes and a thread that needs a person",
  );
  api.readMany(["n:a", "n:b", "needs:t1"]);
  await until(() => puts().length > 0, "the group is written");
  assert.deepEqual(puts(), [{ ids: ["a", "b"], read: true }], "one write for the group, not one a note");
  assert.equal(Object.fromEntries(feedDots(api))["needs:t1"], false, "the derived row is read on this device");
  assert.equal(Object.fromEntries(feedDots(api))["n:c"], true, "a note outside the group keeps its dot");
});
