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
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const TID = "t-salon";
const CACHE = "chanlytics.surfaces.v1";
/** The tab's storage, counting the writes to the cache's slot. */
let cacheWrites = 0;
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (k === CACHE) cacheWrites++;
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
  };
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const heard = {};
/** This member's views as the server holds them (a read always answers with these), every view saved to it, and while `held`, a save's reply waits for it. */
const server = { views: { people: { sortBy: "last", sortDir: "desc", columns: {} } }, saved: [], held: null };
globalThis.window = {
  location: {
    pathname: "/w/salon",
    search: "",
    hash: "#/clients",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  sessionStorage: globalThis.sessionStorage,
  localStorage: globalThis.localStorage,
  // What the page listens for: the cache writes what waits as the page is hidden.
  addEventListener: (type, fn) => (heard[type] ||= []).push(fn),
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  __WORKSPACES: [{ id: TID, slug: "salon", name: "Salon", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: TID,
  fetch: async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/contacts")
      return json(200, {
        ok: true,
        data: {
          people: [],
          page: { q: null, offset: 0, limit: 1000, total: 0, has_more: false },
          calendar: { state: "none", source: "your calendar" },
          booking_link: null,
        },
      });
    if (u.pathname === "/api/v1/segments") return json(200, { ok: true, data: { lists: [] } });
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views: server.views } });
    if (u.pathname === "/api/v1/views/people" && init.method === "PUT") {
      const { view } = JSON.parse(init.body);
      server.saved.push(view);
      if (server.held) await server.held;
      return json(200, { ok: true, data: { views: { ...server.views, people: view } } });
    }
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  },
};
const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { peopleOverride } = await quietly(
  () => import("../../../../../apps/dashboard/src/legacy-bridge/surfaces/people.ts"),
);
const { saveView } = await import("../../../../../apps/dashboard/src/legacy-bridge/people-detail.ts");
const {
  snapshotSurface,
  hydrateSurfaceCache,
  clearSurfaceCache,
  flushSurfaceCache,
  cachedTenant: cachedTenantNow,
} = await import("../../../../../apps/dashboard/src/legacy-bridge/surface-cache.ts");
/** The cache's slot as the next load reads it: after the page's hide, which writes what waits. */
const stored = () => (flushSurfaceCache(), globalThis.sessionStorage.getItem(CACHE));

const HIDDEN = { sortBy: "last", sortDir: "desc", columns: { came_from: false } };
/** The People view in the tab's cache, as a reload would paint it. */
const cachedPeopleView = () => JSON.parse(stored() ?? "null")?.surfaces?.people?.__PEOPLE?.views?.people;
/** People read as the runner reads it, over an empty cache; with `cachedFor`, then cached as the runner caches a read, under that workspace. */
const peopleRead = async ({ cachedFor = null } = {}) => {
  clearSurfaceCache();
  await peopleOverride.apply();
  if (cachedFor) snapshotSurface(peopleOverride.key, peopleOverride.globals, cachedFor);
};

// First in the file on purpose: each file runs in a process of its own, so People has not been read yet, as straight after F5.
test("REGRESSION: straight after F5 a save made while the load read is out survives the read -- the page is usable from the cache before it lands, and the read brought the old view back", async () => {
  // The last session's People, in the tab's cache, painted before anything is read.
  globalThis.window.__PEOPLE = { views: { people: server.views.people } };
  snapshotSurface(peopleOverride.key, peopleOverride.globals, TID);
  delete globalThis.window.__PEOPLE;
  hydrateSurfaceCache();
  const reading = peopleOverride.apply();
  const saving = saveView("people", HIDDEN);
  assert.deepEqual(
    globalThis.window.__PEOPLE.views.people,
    HIDDEN,
    "People mounted again before the read lands (Back) has the view",
  );
  assert.deepEqual(cachedPeopleView(), HIDDEN, "and so does a second F5");
  await saving;
  await reading;
  assert.deepEqual(
    globalThis.window.__PEOPLE.views.people,
    HIDDEN,
    "REGRESSION: the read landed with the server's older view, and it stood",
  );
  snapshotSurface(peopleOverride.key, peopleOverride.globals, TID);
  assert.deepEqual(cachedPeopleView(), HIDDEN, "and the runner caches what the read left");
});

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
  assert.equal(stored(), null, "no cache is made");
  // This workspace's cache holding another surface: People is not added to it.
  globalThis.window.__TODAY_PROBE = { n: 1 };
  snapshotSurface("today", ["__TODAY_PROBE"], TID);
  const before = stored();
  await saveView("people", { ...HIDDEN, sortBy: "name" });
  assert.equal(stored(), before, "and a cache without People gains no People");
  delete globalThis.window.__TODAY_PROBE;
});

test("a cache of another workspace is left as it is: a save here writes nothing into it", async () => {
  await peopleRead({ cachedFor: "t-other" });
  const before = stored();
  assert.ok(before, "cached, under the other workspace");
  await saveView("people", HIDDEN);
  assert.equal(stored(), before, "not a byte of it changed");
});

test("a save still waiting on its reply when a read of People begins is not undone by the read -- the server can answer the read before it takes the save", async () => {
  await peopleRead();
  const LISTS = { sortBy: "name", sortDir: "asc", columns: { lists: true } };
  let reply;
  server.held = new Promise((r) => {
    reply = r;
  });
  try {
    const saving = saveView("people", LISTS);
    const reading = peopleOverride.apply();
    reply();
    await saving;
    await reading;
  } finally {
    server.held = null;
  }
  assert.deepEqual(
    globalThis.window.__PEOPLE.views.people,
    LISTS,
    "the read began while the save waited, so the save stands",
  );
});

test("with no workspace active, a save writes nothing into the cache -- not even into an entry that carries no workspace", async () => {
  await peopleRead();
  // Cached before any workspace was known, so the entry names none.
  snapshotSurface(peopleOverride.key, peopleOverride.globals, null);
  const before = stored();
  const active = globalThis.window.__ACTIVE_WORKSPACE;
  delete globalThis.window.__ACTIVE_WORKSPACE;
  try {
    await saveView("people", HIDDEN);
    assert.equal(stored(), before, "not a byte of it changed");
  } finally {
    globalThis.window.__ACTIVE_WORKSPACE = active;
  }
});

test("signing out clears what the pages kept in the tab -- a view's place, a half-written draft -- with the cache: nothing the tab kept outlives the session that kept it", async () => {
  // The pages' one store (tab-memory.ts): an owner's words in a box, and a plan they had not approved.
  const { tabMemoryFor } = await import("../../../../../apps/dashboard/src/legacy-bridge/tab-memory.ts");
  const tm = tabMemoryFor({ location: { pathname: "/w/salon" }, sessionStorage: globalThis.sessionStorage });
  tm.keepPlace("leads", "clients/leads", { q: "nail", top: 380 });
  tm.keepDraft("leads-find", { words: "dentists in Queens" });
  // And the two slots Leads kept before the store, which a tab open across the deploy still holds.
  globalThis.sessionStorage.setItem(
    "chanlytics.leads.place.v1",
    JSON.stringify({ "salon|clients/leads": { q: "nail", top: 380 } }),
  );
  globalThis.sessionStorage.setItem(
    "chanlytics.leads.finder.v1",
    JSON.stringify({ ws: "salon|", words: "dentists in Queens" }),
  );
  globalThis.sessionStorage.setItem("something.else", "kept");
  clearSurfaceCache();
  assert.equal(tm.place("leads", "clients/leads"), null);
  assert.equal(tm.draft("leads-find"), null);
  assert.equal(globalThis.sessionStorage.getItem("chanlytics.leads.place.v1"), null);
  assert.equal(globalThis.sessionStorage.getItem("chanlytics.leads.finder.v1"), null);
  assert.equal(globalThis.sessionStorage.getItem("something.else"), "kept", "and only what is the app's own");
  globalThis.sessionStorage.removeItem("something.else");
});

test("a cache that would be too big sheds its biggest surfaces until it fits, rather than everything: Leads at 500 rows used to empty Today, Inbox and People with it", () => {
  clearSurfaceCache();
  const big = (n) => ({ rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, words: "x".repeat(2000) })) });
  globalThis.window.__TODAY_PROBE = { small: true };
  globalThis.window.__PEOPLE_PROBE = big(120); // ~240 KB
  globalThis.window.__LEADS_PROBE = big(1000); // ~2 MB: over the line on its own
  snapshotSurface("today", ["__TODAY_PROBE"], TID);
  snapshotSurface("people", ["__PEOPLE_PROBE"], TID);
  snapshotSurface("leads", ["__LEADS_PROBE"], TID);
  const kept = JSON.parse(stored() ?? "null");
  assert.ok(kept, "REGRESSION: the whole cache was removed, and every page booted cold");
  assert.deepEqual(
    Object.keys(kept.surfaces).sort(),
    ["people", "today"],
    "the surface that did not fit is the one left out",
  );
  assert.ok(stored().length < 2_000_000);
  delete globalThis.window.__TODAY_PROBE;
  delete globalThis.window.__PEOPLE_PROBE;
  delete globalThis.window.__LEADS_PROBE;
  clearSurfaceCache();
});

test("a surface may say what of itself the cache holds: Leads keeps its first hundred rows, which is all an instant paint needs", () => {
  clearSurfaceCache();
  globalThis.window.__LEADS_PROBE = {
    rows: Array.from({ length: 500 }, (_, i) => ({ id: `l${i}` })),
    next: { key: "k", id: "l499" },
    offered: 12,
    view: { list: "all" },
  };
  snapshotSurface("leads", ["__LEADS_PROBE"], TID, (snap) => ({
    ...snap,
    __LEADS_PROBE: { ...snap.__LEADS_PROBE, rows: snap.__LEADS_PROBE.rows.slice(0, 100), next: null, offered: 0 },
  }));
  const kept = JSON.parse(stored()).surfaces.leads.__LEADS_PROBE;
  assert.deepEqual(
    [kept.rows.length, kept.next, kept.offered, kept.view],
    [100, null, 0, { list: "all" }],
    "the first hundred, no page after them and nothing offered: the read that follows says the rest",
  );
  assert.equal(globalThis.window.__LEADS_PROBE.rows.length, 500, "and the page's own rows are untouched");
  delete globalThis.window.__LEADS_PROBE;
  clearSurfaceCache();
});

test("a boot's snapshots are one write, a second after the last: each used to parse, re-serialise and write the whole cache", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    clearSurfaceCache();
    cacheWrites = 0;
    for (const k of ["today", "inbox", "calendar", "people", "settings"]) {
      globalThis.window[`__${k}_PROBE`] = { k };
      snapshotSurface(k, [`__${k}_PROBE`], TID);
      mock.timers.tick(300);
    }
    assert.equal(cacheWrites, 0, "nothing written while snapshots keep landing");
    assert.equal(cachedTenantNow(), TID, "yet the tab reads what it holds: the runner's guard sees it");
    mock.timers.tick(1000);
    assert.equal(cacheWrites, 1, "one write for the boot");
    assert.deepEqual(Object.keys(JSON.parse(globalThis.sessionStorage.getItem(CACHE)).surfaces).sort(), [
      "calendar",
      "inbox",
      "people",
      "settings",
      "today",
    ]);
    // Snapshots that never stop still reach the tab's storage within five seconds of the first one waiting.
    cacheWrites = 0;
    for (let i = 0; i < 12; i++) {
      snapshotSurface("today", ["__today_PROBE"], TID);
      mock.timers.tick(600);
    }
    assert.ok(cacheWrites >= 1, `written while they kept coming: ${cacheWrites}`);
  } finally {
    for (const k of ["today", "inbox", "calendar", "people", "settings"]) delete globalThis.window[`__${k}_PROBE`];
    mock.timers.reset();
    clearSurfaceCache();
  }
});

test("the page's hide writes what waits, so a reload paints the latest; a sign-out drops it, so nothing is written after", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    clearSurfaceCache();
    globalThis.window.__HIDE_PROBE = { n: 1 };
    snapshotSurface("today", ["__HIDE_PROBE"], TID);
    assert.equal(globalThis.sessionStorage.getItem(CACHE), null, "waiting");
    for (const fn of heard.pagehide ?? []) fn(new Event("pagehide"));
    assert.ok(
      globalThis.sessionStorage.getItem(CACHE),
      "REGRESSION: a reload straight after a read painted the older cache",
    );
    // Signed out with a snapshot waiting: the clear drops it, and the write it was waiting for never comes.
    snapshotSurface("today", ["__HIDE_PROBE"], TID);
    clearSurfaceCache();
    mock.timers.tick(10_000);
    assert.equal(
      globalThis.sessionStorage.getItem(CACHE),
      null,
      "REGRESSION: customer rows written back after the session ended",
    );
    assert.equal(cachedTenantNow(), null);
  } finally {
    delete globalThis.window.__HIDE_PROBE;
    mock.timers.reset();
  }
});
