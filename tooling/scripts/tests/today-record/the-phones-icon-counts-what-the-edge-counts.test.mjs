/**
 * The phone app's icon counts what the edge counts (decision 0048; D1-phone-badge of the wiring plan, task 5.1).
 *
 * Before it sends a push the edge counts the icon's number from the bell's kept rows alone (contracts unreadFor over the
 * notification rows, packages/jobs push_send). Once the app was open the page posted the bell's own count, which also counts
 * the rows the page derives itself (a thread that needs you, a held draft, a missed call, an invitation): the icon read 2 with
 * the app closed and 5 once it was open. The page posts the kept rows' unread count now, and counts it with the edge's rule.
 *
 * Run on the contracts' two counts side by side over one set of rows, and on the bridge's bell, which holds both numbers.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { keptUnreadOf, unreadFor } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const iso = (min) => new Date(NOW - min * 60_000).toISOString();

/** The rows GET notifications answers: each with this person's marks on it. */
const row = (id, minutesAgo, over = {}) => ({
  id,
  kind: "handoff",
  title: `Row ${id}`,
  body: "Words.",
  route: "inbox",
  subject_type: null,
  subject_id: null,
  created_at: iso(minutesAgo),
  read: false,
  dismissed: false,
  ...over,
});
const ROWS = [
  row("n1", 5),
  row("n2", 15),
  row("n3", 25, { read: true }),
  row("n4", 35, { dismissed: true }),
  row("n5", 45),
  row("n6", 90),
];
/** The edge's way: its rows, the person's seen moment, and the marks table's rows. */
const edgeCount = (dto) =>
  unreadFor(
    dto.notifications.map((n) => ({ id: n.id, created_at: n.created_at })),
    dto.seen_at,
    dto.notifications.map((n) => ({
      notification_id: n.id,
      read_at: n.read ? "2026-09-26T11:59:00Z" : null,
      dismissed_at: n.dismissed ? "2026-09-26T11:59:00Z" : null,
    })),
  );

test("the page counts the kept rows' unread as the edge counts a push's badge: one rule, over the same rows and marks", () => {
  for (const seen_at of [null, iso(30), iso(1), iso(120)]) {
    const dto = { notifications: ROWS, seen_at };
    assert.equal(keptUnreadOf(dto), edgeCount(dto), `seen ${seen_at}: the same number`);
  }
  assert.equal(
    keptUnreadOf({ notifications: ROWS, seen_at: null }),
    4,
    "never opened: every row but the one read and the one dismissed",
  );
  assert.equal(keptUnreadOf({ notifications: ROWS, seen_at: iso(30) }), 2, "the seen moment hides what came before it");
  assert.equal(keptUnreadOf({ notifications: [], seen_at: null }), 0);
  assert.equal(keptUnreadOf(null), 0, "none before the bell's rows are read");
  assert.equal(keptUnreadOf(undefined), 0);
});

test("a Mark all read this device has made counts before the re-read lands, and an earlier moment than the server's changes nothing", () => {
  const dto = { notifications: ROWS, seen_at: iso(30) };
  assert.equal(keptUnreadOf(dto, NOW), 0, "everything is seen as of now");
  assert.equal(keptUnreadOf(dto, NOW - 120 * 60_000), keptUnreadOf(dto), "the server's later moment stands");
  assert.equal(keptUnreadOf(dto, 0), keptUnreadOf(dto), "and none of its own changes nothing");
});

test("a row the server closed counts on neither side, and the unread rows past the bell's list count on both (00421)", () => {
  const closed = row("n7", 3, { closed_at: iso(1) });
  const dto = { notifications: [...ROWS, closed], seen_at: null };
  const edge = unreadFor(
    dto.notifications.map((n) => ({ id: n.id, created_at: n.created_at, closed_at: n.closed_at ?? null })),
    null,
    [],
  );
  assert.equal(edge, 6, "the edge leaves out the closed row (no marks are given here: the six others count)");
  assert.equal(keptUnreadOf(dto), 4, "the page leaves it out too: what a hold's resolve closed asks nobody");
  // The bell lists its newest rows; the server counts the unread ones it did not list (`unread`), and the icon says them.
  assert.equal(keptUnreadOf({ ...dto, unread: 7 }), 7, "four listed and three older");
  assert.equal(keptUnreadOf({ ...dto, unread: 7 }, NOW), 0, "a Mark all read on this device covers the older rows too");
  // What the surfaces this tab holds settle (a run approved, a hold a teammate took) leaves the icon too.
  assert.equal(keptUnreadOf(dto, 0, new Set(["n1"])), 3);
});

/* ------------------------------------------------------ the bridge's bell ------------------------------------------------------ */

const bridge = await importSrc("apps/dashboard/src/legacy-bridge/notifications.ts");
const was = globalThis.window;
globalThis.window = {
  fetch: async () => new Response("{}", { status: 500 }),
  location: { pathname: "/w/marisas", hash: "" },
};
after(() => {
  globalThis.window = was;
});

/** A bell with two threads that need the owner, a held draft and an open invitation: rows only the page can derive. */
const bell = (dto) => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const win = {
    addEventListener() {},
    document: { visibilityState: "visible" },
    focus() {},
    location: { hash: "" },
    INBOX_DATA: {
      THREADS: [
        { id: "th-a", real: true, needsYou: true, who: "Ana", escalatedAtMs: Date.now() - 60_000 },
        { id: "th-b", real: true, needsYou: true, who: "Ben", escalatedAtMs: Date.now() - 120_000 },
        {
          id: "th-c",
          real: true,
          needsYou: false,
          who: "Cy",
          veto: { window: 600, endsAtMs: Date.now() + 300_000, messageId: "m-c", draft: "Friday works." },
        },
      ],
    },
    __LIVE: { now: [], recent: [] },
    __TEAM_INVITES: [{ id: "i1", email: "di@example.com", created_at: new Date(Date.now() - 3_600_000).toISOString() }],
    __NOTIFICATIONS: { dto },
  };
  return { api: bridge.installNotifications(win, storage), win };
};

test("the bell's whole count is the page's own; the icon is the kept rows' alone, the number the edge counted before the app opened", () => {
  const dto = { notifications: [row("n1", 5), row("n2", 15, { read: true })], seen_at: null };
  const { api } = bell(dto);
  assert.equal(api.keptUnread(), 1, "the one kept row not read: what the edge sent the icon while the app was closed");
  // Three derived rows and an invitation stand beside it on the bell, which the edge cannot count.
  assert.equal(api.unread(), 5, "the bell: the kept row, two threads that need you, a held draft and an invitation");
  assert.equal(api.keptUnread(), keptUnreadOf(dto), "and it is the rule's, not a second count");
  assert.equal(
    api.keptUnread(),
    edgeCount(dto),
    "REGRESSION: the icon read 2 with the app closed and 5 once it was open",
  );
});

test("Mark all read moves the icon at once, and reading a kept row moves it when the server's mark is back", () => {
  const dto = { notifications: [row("n1", 5), row("n2", 15)], seen_at: null };
  const { api, win } = bell(dto);
  assert.equal(api.keptUnread(), 2);
  api.seenAll();
  assert.equal(api.keptUnread(), 0, "this device's seen moment counts before the re-read");
  // The re-read lands with the server's marks: a row read there is not counted, here or on any device.
  win.__NOTIFICATIONS = { dto: { notifications: [row("n1", 5, { read: true }), row("n2", 15)], seen_at: iso(0) } };
  assert.equal(api.keptUnread(), 0);
  win.__NOTIFICATIONS = { dto: { notifications: [row("n1", 5, { read: true }), row("n2", 15)], seen_at: null } };
  assert.equal(api.keptUnread(), 0, "the device's own moment still stands over a copy that is older");
});
