/**
 * The tab's cache of its surfaces (surface-cache.ts), and a view a member saves.
 *
 * A reload paints the cached surfaces before anything is read again, and People takes a member's view from its copy
 * when it mounts. A column hidden, then F5: the cached People still held the view from before the save, so the column
 * came back, and the next save wrote the old columns to the server. A save now takes the cached People again, but only
 * an entry already cached for this workspace: a new one could carry no workspace, and the runner's guard
 * (surface-runner.ts) skips an entry with none.
 *
 * The real People surface, the real save and the real cache, over a window with sessionStorage and a fake fetch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const TID = "t-salon";
const CACHE = "chanlytics.surfaces.v1";
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
/** This member's views as the server holds them, and every view saved to it. */
const server = { views: { people: { sortBy: "last", sortDir: "desc", columns: {} } }, saved: [] };
globalThis.window = {
  location: { pathname: "/w/salon", search: "", hash: "#/clients", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  sessionStorage: globalThis.sessionStorage,
  localStorage: globalThis.localStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  __WORKSPACES: [{ id: TID, slug: "salon", name: "Salon", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: TID,
  fetch: async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/contacts") return json(200, { ok: true, data: { people: [], page: { q: null, offset: 0, limit: 1000, total: 0, has_more: false }, calendar: { state: "none", source: "your calendar" }, booking_link: null } });
    if (u.pathname === "/api/v1/segments") return json(200, { ok: true, data: { lists: [] } });
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views: server.views } });
    if (u.pathname === "/api/v1/views/people" && init.method === "PUT") {
      const { view } = JSON.parse(init.body);
      server.saved.push(view);
      return json(200, { ok: true, data: { views: { ...server.views, people: view } } });
    }
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  },
};
const quietly = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const { peopleOverride } = await quietly(() => import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts"));
const { saveView } = await import("../../../apps/dashboard/src/legacy-bridge/people-detail.ts");
const { snapshotSurface, hydrateSurfaceCache, clearSurfaceCache } = await import("../../../apps/dashboard/src/legacy-bridge/surface-cache.ts");

const HIDDEN = { sortBy: "last", sortDir: "desc", columns: { came_from: false } };
/** The People view in the tab's cache, as a reload would paint it. */
const cachedPeopleView = () => JSON.parse(globalThis.sessionStorage.getItem(CACHE) ?? "null")?.surfaces?.people?.__PEOPLE?.views?.people;
/** People read as the runner reads it, over an empty cache; with `cachedFor`, then cached as the runner caches a read, under that workspace. */
const peopleRead = async ({ cachedFor = null } = {}) => {
  clearSurfaceCache();
  await peopleOverride.apply();
  if (cachedFor) snapshotSurface(peopleOverride.key, peopleOverride.globals, cachedFor);
};

test("REGRESSION: a reload keeps the view a member saved -- the tab's cached People still held the view from before the save, so F5 put the old columns back", async () => {
  await peopleRead({ cachedFor: TID });
  assert.deepEqual(cachedPeopleView(), server.views.people, "cached as it was read");
  await saveView("people", HIDDEN);
  assert.deepEqual(server.saved.at(-1), HIDDEN, "the save went");
  assert.deepEqual(cachedPeopleView(), HIDDEN, "REGRESSION: and the cached People holds it");
  // F5: the cache is painted before anything is read again.
  delete globalThis.window.__PEOPLE;
  assert.deepEqual([...hydrateSurfaceCache()], ["people"]);
  assert.deepEqual(globalThis.window.__PEOPLE.views.people, HIDDEN, "so People mounts with the view saved");
});

test("with no People cached, a save caches nothing -- an entry made here could carry no workspace, and the runner's guard skips one with none", async () => {
  await peopleRead();
  await saveView("people", HIDDEN);
  assert.equal(globalThis.sessionStorage.getItem(CACHE), null, "no cache is made");
  // This workspace's cache holding another surface: People is not added to it.
  globalThis.window.__TODAY_PROBE = { n: 1 };
  snapshotSurface("today", ["__TODAY_PROBE"], TID);
  const before = globalThis.sessionStorage.getItem(CACHE);
  await saveView("people", { ...HIDDEN, sortBy: "name" });
  assert.equal(globalThis.sessionStorage.getItem(CACHE), before, "and a cache without People gains no People");
  delete globalThis.window.__TODAY_PROBE;
});

test("a cache of another workspace is left as it is: a save here writes nothing into it", async () => {
  await peopleRead({ cachedFor: "t-other" });
  const before = globalThis.sessionStorage.getItem(CACHE);
  assert.ok(before, "cached, under the other workspace");
  await saveView("people", HIDDEN);
  assert.equal(globalThis.sessionStorage.getItem(CACHE), before, "not a byte of it changed");
});
