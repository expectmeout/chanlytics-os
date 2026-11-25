/**
 * A boot stands on what the device holds (bridge/surface-runner.ts over hearing/kept.ts; 25 Nov 2026), run on the real
 * runner over surfaces whose reads the test counts, with copies the device "kept" and a feed's record of the test's own.
 *
 * Every load read every page's rows again once the page on screen was drawn. Now the surfaces of the pages not on screen
 * whose copies the device holds are read only where the workspace's topic told of a change since the copy was read; the
 * rest stand as live, dated when their copy was read. The page on screen is read as it always was.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
const windowListeners = new Map();
globalThis.window.addEventListener = (type, fn) => {
  if (!windowListeners.has(type)) windowListeners.set(type, new Set());
  windowListeners.get(type).add(fn);
};
globalThis.window.removeEventListener = (type, fn) => windowListeners.get(type)?.delete(fn);
globalThis.window.dispatchEvent = (e) => {
  for (const fn of [...(windowListeners.get(e.type) ?? [])]) fn(e);
  return true;
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
globalThis.document = { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} };

const { startSurfaces } = await importSrc("apps/dashboard/src/bridge/surface-runner.ts");
const { getSurfaceStatuses, markHydrated, noteReadAt, readAtOf } = await importSrc(
  "apps/dashboard/src/bridge/surface-status.ts",
);

const MIN = 60_000;
/** Noon in New York, 24 Nov 2026: a copy read minutes or hours before it is the business's own today. */
const NOON = Date.parse("2026-11-24T17:00:00Z");

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r));
};

let turn = 0;
/**
 * A load: surfaces of this test's own (their keys carry the test's turn, so one test's copies are no other's), copies the
 * device kept `kept` minutes ago, and a feed's record that answers `notices` (null: it cannot say them all).
 */
async function loaded(t, { kept = {}, notices = [] } = {}) {
  turn += 1;
  const key = (name) => `${name}-${turn}`;
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOON });
  const reads = [];
  const surface = (name, extra) => ({
    key: key(name),
    apply: async () => void reads.push(name),
    ...extra,
  });
  const overrides = [
    surface("inbox", { fresh: "live", refreshOnTables: ["messages", "conversations"] }),
    surface("calendar", { fresh: "live", refreshOnTables: ["appointments"] }),
    surface("people", { fresh: "its-page", refreshOnTables: ["contacts", "appointments"] }),
    surface("views", { fresh: "own-change" }),
  ];
  // What the cache restored before anything was read (surface-cache.ts hydrateSurfaceCache): drawn, and dated.
  markHydrated(Object.keys(kept).map(key));
  for (const [name, minutes] of Object.entries(kept)) noteReadAt(key(name), NOON - minutes * MIN);
  const asked = [];
  const catchUp = async (since) => {
    asked.push(since);
    return notices;
  };
  const stop = startSurfaces(overrides, () => () => {}, catchUp);
  // The page on screen draws nothing of these, and its wait for its own draw runs out by the clock.
  for (let i = 0; i < 6; i += 1) {
    await flush();
    t.mock.timers.tick(2_000);
  }
  await flush();
  return { reads, asked, stop, key, statusOf: (name) => getSurfaceStatuses().get(key(name)) };
}
const told = (table, minutesAgo, event = "UPDATE") => ({
  table,
  event,
  statuses: null,
  at: new Date(NOON - minutesAgo * MIN).toISOString(),
});

test("a first load, on a device that holds nothing, reads every surface, and asks the feed's record nothing for it", async (t) => {
  const page = await loaded(t);
  assert.deepEqual([...page.reads].sort(), ["calendar", "inbox", "people", "views"]);
  assert.deepEqual(page.asked, []);
  page.stop();
});

test("a load on a device that holds the pages' rows reads none of them again where nothing was told since", async (t) => {
  const page = await loaded(t, { kept: { inbox: 2, calendar: 40, people: 15, views: 2 } });
  assert.deepEqual(page.reads, ["views"], "but the surface the feed tells nothing: its boot read is its only word");
  assert.deepEqual(page.asked, [NOON - 40 * MIN], "the feed's record asked once, since the oldest copy");
  for (const name of ["inbox", "calendar", "people"]) assert.equal(page.statusOf(name), "live", name);
  assert.equal(readAtOf(page.key("calendar")), NOON - 40 * MIN, "each still dated when its copy was read, never now");
  page.stop();
});

test("only what was told of since its copy is read", async (t) => {
  const page = await loaded(t, {
    kept: { inbox: 2, calendar: 40, people: 15 },
    // A visit changed twenty minutes ago: after the Calendar's copy, before People's. And a message a minute ago.
    notices: [told("appointments", 20), told("messages", 1, "INSERT")],
  });
  assert.deepEqual([...page.reads].sort(), ["calendar", "inbox", "views"]);
  assert.equal(page.statusOf("people"), "live", "People's copy was read after the visit changed: it holds it");
  page.stop();
});

test("where the feed's record cannot say every notice, everything is read as it always was", async (t) => {
  const page = await loaded(t, { kept: { inbox: 2, calendar: 40, people: 15 }, notices: null });
  assert.deepEqual([...page.reads].sort(), ["calendar", "inbox", "people", "views"]);
  page.stop();
});

test("a copy from the business's yesterday is read: what counts the day so far turned with the day", async (t) => {
  // Thirteen hours before noon in New York is the evening before.
  const page = await loaded(t, { kept: { inbox: 13 * 60, calendar: 30 } });
  assert.deepEqual([...page.reads].sort(), ["inbox", "people", "views"]);
  assert.equal(page.statusOf("calendar"), "live");
  page.stop();
});
