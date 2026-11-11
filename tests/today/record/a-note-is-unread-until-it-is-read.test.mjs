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

test("what Mark all read says it did", () => {
  assert.equal(BELL_READ_WORDS.done(1), "1 marked read");
  assert.equal(BELL_READ_WORDS.done(9), "9 marked read");
});

/* ------------------------------------------------------ the bridge's bell ------------------------------------------------------ */

const bridge = await importSrc("apps/dashboard/src/bridge/notifications.ts");
const requests = [];
const was = globalThis.window;
globalThis.window = {
  // The server's door, standing in: the request is what is read, and its refusal keeps the write from refreshing a surface.
  fetch: async (url, init) => {
    requests.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "stand-in" } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  },
  location: { pathname: "/w/marisas", hash: "", origin: "https://app.chanlytics.com", assign() {} },
};
after(() => {
  globalThis.window = was;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const puts = () =>
  requests.filter((r) => r.method === "PUT" && r.url.includes("/api/v1/notifications")).map((r) => r.body);
/** A moment `min` minutes before the real clock, which the bridge reads. */
const live = (min) => new Date(Date.now() - min * 60_000).toISOString();
const liveRow = (id, min) => rowAt(id, Date.now() - min * 60_000);
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
    __TEAM_INVITES: [],
    __NOTIFICATIONS: { dto },
  };
  const hear = (ev) => (heard[ev] ?? []).forEach((fn) => fn());
  return { api: bridge.installNotifications(win, storage), win, hear };
};
const feedDots = (api) => api.feed().map((r) => [r.id, r.unread]);

test("closing the bell is a look: the number starts again, the look is written, and every dot stays", async () => {
  requests.length = 0;
  const { api } = bell({ notifications: [liveRow("a", 5), liveRow("b", 30)], seen_at: null, read_through_at: null });
  assert.equal(api.unread(), 2);
  api.seenAll();
  await settle();
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

test("Mark all read reads every note at once and tells the server; Undo puts the dots back where they stood, and leaves the look", async () => {
  requests.length = 0;
  const through = live(20);
  const dto = { notifications: [liveRow("a", 5), liveRow("b", 30)], seen_at: live(20), read_through_at: through };
  const { api, win, hear } = bell(dto);
  assert.deepEqual(feedDots(api), [
    ["n:a", true],
    ["n:b", false],
  ]);
  const press = api.readAll();
  assert.equal(press.read, 1, "how many notes the press read");
  assert.deepEqual(
    feedDots(api),
    [
      ["n:a", false],
      ["n:b", false],
    ],
    "at once, before the server answers",
  );
  assert.equal(api.unread(), 0);
  await settle();
  assert.deepEqual(puts(), [{ read_all: true }]);

  press.undo();
  assert.deepEqual(
    feedDots(api),
    [
      ["n:a", true],
      ["n:b", false],
    ],
    "the dots as they stood",
  );
  assert.equal(api.unread(), 0, "an Undo leaves the look where it is: the number does not come back");
  await settle();
  assert.deepEqual(
    puts().at(-1),
    { read_through: through },
    "back to the moment it stood at, never one of this device's",
  );

  // The bell's rows are read again after the write landed: the server's own moment is the bell's again.
  win.__NOTIFICATIONS = { dto: { ...dto, read_through_at: live(0) } };
  hear("surface:notifications");
  assert.deepEqual(feedDots(api), [
    ["n:a", false],
    ["n:b", false],
  ]);
});
