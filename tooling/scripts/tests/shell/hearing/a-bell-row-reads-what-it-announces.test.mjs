/**
 * A bell row reads what it announces (docs/decisions/0047, task 1.2 of the wiring plan; N2, NS-2, F6, F7a, F7b, S1-02, S1-10, S1-13).
 *
 * The server rings the bell for the changes it most wants an owner to see -- a template approved or blocked, a booking email held for
 * a look, people added from the calendar, offers by email paused -- and each row's button opens the page that is about it. That page was
 * drawn from a surface the live feed does not feed (appointment_notices, contacts and mailboxes were on no feed, and templates were not
 * until task 2.1), so the owner followed the announcement to a page that had not heard it. A kept row is now the signal for the table
 * behind it: the bell's own surface compares the rows it reads with the ones it read before (never on its first read, a backlog), and
 * for each NEW row of a kind that names surfaces it reads those whose page is on screen and keeps the others for their page
 * (surface-registry.ts whereDrawn). A template's rows name none (task 3.3): Settings hears the table, and the pages that offer a message
 * are made of its read.
 *
 * Run on the real bell surface and the real runner, over the real overrides each row names (their reads recorded), a window whose
 * address is the page on screen, and the registry's own rule for which page reads what it was kept for as it comes on screen.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { SERVER_NOTIFICATION_KINDS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.dispatchEvent ??= () => true;
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** What the bell's read answers. */
let served = [];
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const route = u.pathname.replace("/api/v1/", "");
  if (route === "notifications") return json(200, { ok: true, data: { notifications: served, seen_at: null } });
  if (route === "conversations") return json(200, { ok: true, data: { conversations: [] } });
  if (route === "escalations") return json(200, { ok: true, data: { escalations: [] } });
  return json(404, { ok: false, error: { code: "not_found", message: "no" } });
};

const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { readWhatWasMissed } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const { notificationsOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surfaces/notifications.ts");
const { NOTICE_ABOUT, aboutNotice } = await importSrc("apps/dashboard/src/legacy-bridge/surfaces/notice-re-reads.ts");
const { settingsOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surfaces/settings.ts");
const { inboxOverride } = await importSrc("apps/dashboard/src/surfaces/inbox/surface.ts");
const { calendarOverride } = await importSrc("apps/dashboard/src/surfaces/calendar/surface.ts");
const { peopleOverride } = await importSrc("apps/dashboard/src/surfaces/people/surface.ts");
const { playbooksOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");
const { broadcastsOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts");

/** The surfaces a bell row can name. */
const ABOUT = [
  settingsOverride,
  inboxOverride,
  calendarOverride,
  peopleOverride,
  playbooksOverride,
  broadcastsOverride,
];
/** Turns of the loop for a read fired and not waited for to be made and answered. */
const flush = async () => {
  for (let i = 0; i < 12; i += 1) {
    for (let j = 0; j < 20; j += 1) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};
const at = (hash) => {
  globalThis.location.hash = hash;
};

/** The runner, with a surface of no interest so it reads nothing of the bell's until the test does. */
const stop = startSurfaces([{ key: "nothing-in-particular", apply: async () => {} }], () => () => {});
await flush();
after(() => stop());

let seq = 0;
const NOW = Date.parse("2026-10-11T12:00:00Z");
/** One kept row, as GET notifications answers it. */
const row = (kind, route = null, over = {}) => ({
  id: `n-${(seq += 1)}`,
  kind,
  title: `A ${kind} row`,
  body: "",
  route,
  subject_type: null,
  subject_id: null,
  created_at: new Date(NOW + seq * 1000).toISOString(),
  read: false,
  dismissed: false,
  ...over,
});
/** The bell reads again, with these rows beside the ones it already holds. */
const bellReads = async (...rows) => {
  served = [...served, ...rows];
  await notificationsOverride.apply();
  await flush();
};

/**
 * The surfaces a bell row can name, each read recorded in place of the read (bar the ones a test runs for itself), until the test ends.
 * Answers the list of keys read since.
 */
function recording(t, { run = [] } = {}) {
  const read = [];
  for (const o of ABOUT) {
    o.apply.mock?.restore();
    if (!run.includes(o.key)) t.mock.method(o, "apply", async () => void read.push(o.key));
  }
  return read;
}

/**
 * What each page reads as it comes on screen, from what was kept for it: every route in turn, from a start no page is on, so each move
 * is news. Draining: what a page reads it no longer owes, so the next test starts owing nothing.
 */
const EVERY_PAGE = [
  "#/messages",
  "#/inbox",
  "#/calendar",
  "#/admin/workspace",
  "#/clients",
  "#/campaigns",
  "#/broadcasts",
];
function owedOnArrival(routes = EVERY_PAGE) {
  const win = {
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  const read = [];
  at("#/__nowhere");
  const stopHearing = readWhatWasMissed(ABOUT, (keys) => read.push(...keys), win);
  const owed = {};
  try {
    for (const hash of routes) {
      at(hash);
      read.length = 0;
      win.on?.();
      owed[hash] = [...read];
    }
  } finally {
    stopHearing();
    at("#/today");
  }
  return owed;
}
const drain = () => owedOnArrival();
const owedKeys = (owed) => Object.values(owed).flat().sort();

test("the first read of the bell finds a backlog and re-reads nothing: the rows that were there are not news", async (t) => {
  at("#/messages");
  served = [
    row("template_ready", "messages"),
    row("booking_notice", "admin/workspace"),
    row("calendar_people", "clients"),
    row("sweep", "outbound"),
  ];
  const read = recording(t);
  await notificationsOverride.apply();
  await flush();
  assert.deepEqual(read, [], "the backlog reads no surface");
  assert.deepEqual(owedKeys(drain()), [], "and keeps none for its page");
  at("#/today");
});

test("a template approved or blocked reads nothing and keeps nothing for a page: Settings hears templates on the feed, and the Library, the Inbox's reply box and both composers are made of its read", async (t) => {
  // Task 3.3: the Inbox kept its own copy of the templates for five minutes, and Campaigns' composers read their own, so the row had
  // to read three surfaces (and forget the Inbox's copy). They draw the settings read now, which the feed tells in every tab at once.
  for (const kind of ["template_ready", "template_blocked"]) {
    for (const hash of ["#/messages", "#/inbox", "#/campaigns", "#/broadcasts", "#/today"]) {
      drain();
      at(hash);
      const read = recording(t);
      await bellReads(row(kind, "messages"));
      assert.deepEqual(read, [], `${kind} on ${hash}: no surface is read for it`);
      assert.deepEqual(owedKeys(owedOnArrival()), [], `${kind} on ${hash}: and none is kept for a page`);
    }
    assert.equal(aboutNotice({ kind, route: "messages" }), null, `${kind}: it names no surface`);
    assert.match(NOTICE_ABOUT[kind], /Settings/, `${kind}: and says which page hears it`);
  }
  // The feed does tell Settings of a template, in every tab, wherever it is; the pages that offer a message do not ask to be read.
  const change = { table: "templates", event: "UPDATE", row: {} };
  for (const hash of ["#/today", "#/inbox", "#/campaigns", "#/broadcasts", "#/messages"]) {
    at(hash);
    assert.equal(wantsRefresh(settingsOverride, "templates", change), true, `Settings hears a template on ${hash}`);
    assert.equal(wantsRefresh(inboxOverride, "templates", change), false, `the Inbox does not: ${hash}`);
    assert.equal(wantsRefresh(broadcastsOverride, "templates", change), false, `nor Sent's composer: ${hash}`);
  }
  at("#/today");
});

test("a booking email held for a look is read where the board, or the Business tab that lists the held emails, is on screen", async (t) => {
  // Settings > Business draws the held list from the Calendar's read (open-bookings.tsx): the pane the bell's own button opens.
  for (const hash of ["#/calendar", "#/admin/workspace", "#/admin/workspace/calendar", "#/admin"]) {
    drain();
    at(hash);
    const read = recording(t);
    await bellReads(row("booking_notice", "admin/workspace"));
    assert.deepEqual(read, ["calendar"], `read on ${hash}`);
    assert.deepEqual(owedKeys(owedOnArrival()), [], `${hash}: and nothing is owed to another page`);
  }
});

test("a held email that arrives while the owner is elsewhere is read as they reach the Business tab by the bell's button, or the board", async (t) => {
  for (const [arrive, other] of [
    ["#/admin/workspace", "#/calendar"],
    ["#/calendar", "#/admin/workspace"],
  ]) {
    drain();
    at("#/today");
    const read = recording(t);
    await bellReads(row("booking_notice", "admin/workspace"));
    assert.deepEqual(read, [], "nothing is read from Today");
    assert.deepEqual(owedOnArrival([arrive])[arrive], ["calendar"], `${arrive}: read once as it comes on screen`);
    assert.deepEqual(owedOnArrival([other])[other], [], `${other}: and no longer owed`);
  }
});

test("people added from the calendar are read where People is on screen, and kept for it elsewhere", async (t) => {
  drain();
  at("#/clients");
  let read = recording(t);
  await bellReads(row("calendar_people", "clients"));
  assert.deepEqual(read, ["people"]);
  assert.deepEqual(owedKeys(owedOnArrival()), []);

  at("#/inbox");
  read = recording(t);
  await bellReads(row("calendar_people", "clients"));
  assert.deepEqual(read, [], "the Inbox's page does not draw People's list");
  assert.deepEqual(owedOnArrival(["#/clients"])["#/clients"], ["people"], "People reads them as it comes on screen");
});

test("offers by email paused (a sweep row opening Campaigns) are read by the composers where they are on screen; a sending domain held opens Connections, which hears its table", async (t) => {
  // Campaigns' home draws Sent's runs for the pause on offers (W-review-facts-rules-2): both composers are read there.
  for (const [hash, here] of [
    ["#/campaigns", ["playbooks", "broadcasts"]],
    ["#/outbound", ["playbooks"]],
    ["#/broadcasts", ["broadcasts"]],
  ]) {
    drain();
    at(hash);
    const read = recording(t);
    await bellReads(row("sweep", "outbound"));
    assert.deepEqual(read, here, `read on ${hash}`);
    assert.deepEqual(
      owedKeys(owedOnArrival()),
      ["broadcasts", "playbooks"].filter((k) => !here.includes(k)),
      `${hash}: the other composer is kept for its page`,
    );
  }
  drain();
  at("#/today");
  const away = recording(t);
  await bellReads(row("sweep", "outbound"));
  assert.deepEqual(away, []);
  assert.deepEqual(owedOnArrival(["#/campaigns", "#/broadcasts"]), {
    "#/campaigns": ["playbooks", "broadcasts"],
    "#/broadcasts": [],
  });

  drain();
  at("#/campaigns");
  const held = recording(t);
  await bellReads(row("sweep", "admin/integrations"), row("sweep", null));
  assert.deepEqual(held, [], "a sweep that opens Connections reads no composer");
  assert.deepEqual(owedKeys(owedOnArrival()), []);
});

test("a row that names no surface reads none: every other kind is read by its own page, and says why", async (t) => {
  const named = new Set(["booking_notice", "calendar_people", "opted_out", "sweep"]);
  drain();
  at("#/today");
  const read = recording(t);
  const others = SERVER_NOTIFICATION_KINDS.filter((k) => !named.has(k));
  await bellReads(...others.map((k) => row(k, "today")));
  assert.deepEqual(read, [], `${others.length} kinds, none of them a read`);
  assert.deepEqual(owedKeys(drain()), []);
});

test("every kind the edge keeps is decided: it names the surfaces it is about, or says which page hears the table behind it", () => {
  assert.deepEqual(
    Object.keys(NOTICE_ABOUT).sort(),
    [...SERVER_NOTIFICATION_KINDS].sort(),
    "a kind added to the edge's list without a decision here is a red build",
  );
  const reads = SERVER_NOTIFICATION_KINDS.filter((kind) => aboutNotice({ kind, route: "outbound" }) !== null).sort();
  assert.deepEqual(reads, ["booking_notice", "calendar_people", "opted_out", "sweep"]);
  for (const kind of SERVER_NOTIFICATION_KINDS) {
    const entry = NOTICE_ABOUT[kind];
    const decided = typeof entry === "function" ? entry({ kind, route: "inbox" }) : entry;
    if (typeof decided === "string") assert.ok(decided.trim().length > 20, `${kind}: say why nothing is read`);
    else assert.ok(decided.surfaces().length > 0, `${kind}: names at least one surface`);
  }
  // A kind from a newer server is no news to this tab.
  assert.equal(aboutNotice({ kind: "something_new", route: null }), null);
  // The template rows are the Library's, the Inbox's picker's and both composers': Settings hears the table, and they draw its read.
  for (const kind of ["template_ready", "template_blocked"])
    assert.match(NOTICE_ABOUT[kind], /Settings, the one read of the templates/, `${kind} says who hears it`);
});

test("a row the bell has seen is no news: marking it read, or a second read of the same rows, reads nothing; two new rows naming a surface read it once", async (t) => {
  drain();
  at("#/calendar");
  const read = recording(t);
  const kept = row("booking_notice", "admin/workspace");
  await bellReads(kept);
  assert.deepEqual(read, ["calendar"]);
  read.length = 0;
  // The same rows again, one now read, then dismissed, then put back: nothing new arrived.
  for (const over of [{ read: true }, { dismissed: true }, { dismissed: false }]) {
    served = served.map((n) => (n.id === kept.id ? { ...n, ...over } : n));
    await notificationsOverride.apply();
    await flush();
  }
  assert.deepEqual(read, [], "a mark made on a row is not a new row");
  await bellReads(row("booking_notice", "admin/workspace"), row("booking_notice", "admin/workspace"));
  assert.deepEqual(read, ["calendar"], "two new rows that name the same surface read it once");
  drain();
  at("#/today");
});
