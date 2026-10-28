/**
 * The tab's cache of its surfaces (surface-cache.ts), and a view a member saves.
 *
 * A reload paints the cached surfaces before anything is read again, and People takes a member's view from its copy
 * when it mounts. A column hidden, then F5: the cached People still held the view from before the save, so the column
 * came back, and the next save wrote the old columns to the server. A save now takes the cached People again, but only
 * an entry already cached for this workspace: a new one could carry no workspace, and the runner's guard
 * (surface-runner.ts) skips an entry with none.
 *
 * The real People surface, the real save and the real cache, over a window with local storage and a fake fetch. The cache is
 * kept in local storage, one slot per workspace's address, and drawn for a day at most.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const TID = "t-salon";
/** A workspace's slot in the browser's local storage, by its address's word. */
const slot = (ws) => `chanlytics.surfaces.v2:${ws}`;
const CACHE = slot("salon");
/** A store as the browser's are, counting the writes to the cache's slots. */
let cacheWrites = 0;
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (k.startsWith("chanlytics.surfaces.v2:")) cacheWrites++;
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const heard = {};
/** The Inbox's threads and open holds as GET conversations and GET escalations answer them. */
const inboxWire = { conversations: [], escalations: [] };
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
    if (u.pathname === "/api/v1/conversations")
      return json(200, { ok: true, data: { conversations: inboxWire.conversations } });
    if (u.pathname === "/api/v1/escalations")
      return json(200, { ok: true, data: { escalations: inboxWire.escalations } });
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
const { peopleOverride } = await quietly(() => import("../../../../../apps/dashboard/src/surfaces/people/surface.ts"));
const { inboxOverride } = await quietly(() => import("../../../../../apps/dashboard/src/surfaces/inbox/surface.ts"));
const { saveView } = await import("../../../../../apps/dashboard/src/surfaces/people/people-detail.ts");
const { setSurfaceValue, surfaceValue } = await import("../../../../../apps/dashboard/src/surfaces/surface-values.ts");
const {
  snapshotSurface,
  hydrateSurfaceCache,
  clearSurfaceCache,
  flushSurfaceCache,
  cachedTenant: cachedTenantNow,
} = await import("../../../../../apps/dashboard/src/legacy-bridge/surface-cache.ts");
const { SURFACE_SHAPES } = await import("../../../../../apps/dashboard/src/legacy-bridge/surfaces/shapes.generated.ts");
/** The cache's slot as the next load reads it: after the page's hide, which writes what waits. */
const stored = (at = CACHE) => (flushSurfaceCache(), globalThis.localStorage.getItem(at));

const HIDDEN = { sortBy: "last", sortDir: "desc", columns: { came_from: false } };
/** The People view in the tab's cache, as a reload would paint it. */
const cachedPeopleView = () => JSON.parse(stored() ?? "null")?.surfaces?.people?.$value?.views?.people;
/** People read as the runner reads it, over an empty cache; with `cachedFor`, then cached as the runner caches a read, under that workspace. */
const peopleRead = async ({ cachedFor = null } = {}) => {
  clearSurfaceCache();
  await peopleOverride.apply();
  if (cachedFor) snapshotSurface(peopleOverride.key, [], cachedFor, undefined, peopleOverride.value);
};

// First in the file on purpose: each file runs in a process of its own, so People has not been read yet, as straight after F5.
test("REGRESSION: straight after F5 a save made while the load read is out survives the read -- the page is usable from the cache before it lands, and the read brought the old view back", async () => {
  // The last session's People, in the tab's cache, painted before anything is read.
  setSurfaceValue("people", { views: { people: server.views.people } });
  snapshotSurface(peopleOverride.key, [], TID, undefined, peopleOverride.value);
  setSurfaceValue("people", undefined);
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
  snapshotSurface(peopleOverride.key, [], TID, undefined, peopleOverride.value);
  assert.deepEqual(cachedPeopleView(), HIDDEN, "and the runner caches what the read left");
});

test("REGRESSION: a reload keeps the view a member saved -- the tab's cached People still held the view from before the save, so F5 put the old columns back", async () => {
  await peopleRead({ cachedFor: TID });
  assert.deepEqual(cachedPeopleView(), server.views.people, "cached as it was read");
  await saveView("people", HIDDEN);
  assert.deepEqual(server.saved.at(-1), HIDDEN, "the save went");
  assert.deepEqual(cachedPeopleView(), HIDDEN, "REGRESSION: and the cached People holds it");
  // F5: the cache is painted before anything is read again.
  setSurfaceValue("people", undefined);
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
  snapshotSurface(peopleOverride.key, [], null, undefined, peopleOverride.value);
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
    assert.deepEqual(Object.keys(JSON.parse(globalThis.localStorage.getItem(CACHE)).surfaces).sort(), [
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
    assert.equal(globalThis.localStorage.getItem(CACHE), null, "waiting");
    for (const fn of heard.pagehide ?? []) fn(new Event("pagehide"));
    assert.ok(
      globalThis.localStorage.getItem(CACHE),
      "REGRESSION: a reload straight after a read painted the older cache",
    );
    // Signed out with a snapshot waiting: the clear drops it, and the write it was waiting for never comes.
    snapshotSurface("today", ["__HIDE_PROBE"], TID);
    clearSurfaceCache();
    mock.timers.tick(10_000);
    assert.equal(
      globalThis.localStorage.getItem(CACHE),
      null,
      "REGRESSION: customer rows written back after the session ended",
    );
    assert.equal(cachedTenantNow(), null);
  } finally {
    delete globalThis.window.__HIDE_PROBE;
    mock.timers.reset();
  }
});

test("a snapshot after the write builds on the copy the tab keeps parsed: each one parsed the whole slot again, up to 2 MB, on every read", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const parse = JSON.parse;
  let parses = 0;
  try {
    clearSurfaceCache();
    globalThis.window.__PARSE_PROBE = { rows: [1, 2, 3] };
    snapshotSurface("today", ["__PARSE_PROBE"], TID);
    flushSurfaceCache();
    JSON.parse = (...a) => {
      parses += 1;
      return parse(...a);
    };
    for (let i = 0; i < 5; i++) {
      globalThis.window.__PARSE_PROBE = { rows: [i] };
      snapshotSurface("today", ["__PARSE_PROBE"], TID);
      flushSurfaceCache();
    }
    assert.equal(parses, 0, "REGRESSION: every snapshot after a write parsed the slot");
    assert.equal(cachedTenantNow(), TID);
    JSON.parse = parse;
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(CACHE)).surfaces.today.__PARSE_PROBE, { rows: [4] });
    // A slot written by anything else is read as it is: parsed again, never the copy.
    globalThis.localStorage.setItem(
      CACHE,
      JSON.stringify({
        build: process.env.NEXT_PUBLIC_BUILD_SHA || "dev",
        savedAt: Date.now(),
        at: "salon",
        tenant: "t-other",
        surfaces: {},
      }),
    );
    assert.equal(cachedTenantNow(), "t-other");
  } finally {
    JSON.parse = parse;
    delete globalThis.window.__PARSE_PROBE;
    mock.timers.reset();
    clearSurfaceCache();
  }
});

test("REGRESSION: a load at another workspace's address draws none of the rows cached at this one -- a phone's push for another workspace opened its address and drew this one's Inbox and name until the workspaces read landed", () => {
  clearSurfaceCache();
  const w = globalThis.window;
  w.__INBOX_PROBE = { THREADS: [{ id: "t1", who: "A customer of the salon's" }] };
  // The workspace surface's globals ride in the same cache: the name on the sidebar, and the id every guard reads.
  snapshotSurface("inbox", ["__INBOX_PROBE"], TID);
  snapshotSurface("workspace", ["__WORKSPACES", "__ACTIVE_WORKSPACE"], TID);
  flushSurfaceCache();
  const ws = w.__WORKSPACES;
  delete w.__INBOX_PROBE;
  delete w.__WORKSPACES;
  delete w.__ACTIVE_WORKSPACE;
  // The tab is sent to another workspace's address, and loads: the cache is restored before React draws anything.
  w.location.pathname = "/w/bayside/inbox";
  try {
    assert.deepEqual(
      [...hydrateSurfaceCache()],
      [],
      "REGRESSION: the salon's surfaces were drawn under bayside's address",
    );
    assert.equal(w.__INBOX_PROBE, undefined, "none of its rows");
    assert.equal(w.__WORKSPACES, undefined, "nor its name");
    assert.equal(w.__ACTIVE_WORKSPACE, undefined, "nor its id, which every read after would have taken as bayside's");
    assert.equal(globalThis.localStorage.getItem(slot("bayside")), null, "bayside's own slot holds nothing yet");
    assert.ok(globalThis.localStorage.getItem(CACHE), "and the salon's stays the salon's, for its own next load");
    assert.equal(cachedTenantNow(), null, "so the runner's guard has no other workspace to reload the tab for");
  } finally {
    w.location.pathname = "/w/salon";
    w.__WORKSPACES = ws;
    w.__ACTIVE_WORKSPACE = TID;
  }
});

test("off a workspace page (the home, on its way to one) the cache is drawn nowhere and left for its workspace's own load", () => {
  clearSurfaceCache();
  const w = globalThis.window;
  w.__TODAY_PROBE = { n: 1 };
  snapshotSurface("today", ["__TODAY_PROBE"], TID);
  flushSurfaceCache();
  delete w.__TODAY_PROBE;
  w.location.pathname = "/";
  try {
    assert.deepEqual([...hydrateSurfaceCache()], [], "the home draws none of a workspace's rows");
    assert.ok(globalThis.localStorage.getItem(CACHE), "and keeps them for the address it sends the tab to");
  } finally {
    w.location.pathname = "/w/salon";
  }
  assert.deepEqual([...hydrateSurfaceCache()], ["today"], "which draws them at once");
  delete w.__TODAY_PROBE;
  clearSurfaceCache();
});

test("REGRESSION: rows read at one workspace's address never join the cache of another -- with the workspaces read failed, the last workspace's id stayed, and the new one's rows were written under it", () => {
  clearSurfaceCache();
  const w = globalThis.window;
  w.__TODAY_PROBE = { whose: "the salon's" };
  snapshotSurface("today", ["__TODAY_PROBE"], TID);
  flushSurfaceCache();
  // At bayside's address, the id the page holds still says the salon (its workspaces read failed both tries).
  w.location.pathname = "/w/bayside";
  w.__INBOX_PROBE = { whose: "bayside's" };
  try {
    snapshotSurface("inbox", ["__INBOX_PROBE"], TID);
    const kept = JSON.parse(stored(slot("bayside")));
    assert.deepEqual(Object.keys(kept.surfaces), ["inbox"], "bayside's Inbox starts bayside's own slot");
    assert.equal(kept.at, "bayside", "the cache says whose address its rows were read at");
    assert.deepEqual(
      Object.keys(JSON.parse(stored(CACHE)).surfaces),
      ["today"],
      "REGRESSION: bayside's Inbox was written into the salon's cache, beside the salon's Today",
    );
  } finally {
    w.location.pathname = "/w/salon";
  }
  // Back at the salon's address: nothing of bayside's is drawn there, only the salon's own.
  delete w.__INBOX_PROBE;
  delete w.__TODAY_PROBE;
  assert.deepEqual([...hydrateSurfaceCache()], ["today"]);
  assert.equal(w.__INBOX_PROBE, undefined);
  delete w.__TODAY_PROBE;
  clearSurfaceCache();
});

test("a cache the server resolved for another workspace is not added to, even at the same address", () => {
  clearSurfaceCache();
  const w = globalThis.window;
  w.__TODAY_PROBE = { n: 1 };
  snapshotSurface("today", ["__TODAY_PROBE"], "t-other");
  w.__INBOX_PROBE = { n: 2 };
  snapshotSurface("inbox", ["__INBOX_PROBE"], TID);
  const kept = JSON.parse(stored());
  assert.deepEqual(Object.keys(kept.surfaces), ["inbox"], "the rows start a cache of their own workspace");
  assert.equal(kept.tenant, TID);
  delete w.__TODAY_PROBE;
  delete w.__INBOX_PROBE;
  clearSurfaceCache();
});

test("a snapshot older than a day is not drawn: a page waits for its reads, as on a first visit", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    clearSurfaceCache();
    const w = globalThis.window;
    w.__AGE_PROBE = { n: 1 };
    snapshotSurface("today", ["__AGE_PROBE"], TID);
    flushSurfaceCache();
    delete w.__AGE_PROBE;
    mock.timers.tick(23 * 3_600_000);
    assert.deepEqual([...hydrateSurfaceCache()], ["today"], "drawn within the day");
    delete w.__AGE_PROBE;
    mock.timers.tick(2 * 3_600_000);
    assert.deepEqual([...hydrateSurfaceCache()], [], "and not after it");
    assert.equal(w.__AGE_PROBE, undefined);
  } finally {
    delete globalThis.window.__AGE_PROBE;
    mock.timers.reset();
    clearSurfaceCache();
  }
});

test("REGRESSION: over its size the slot sheds what the page on screen does not draw first -- on Today it shed People, which Today draws, and kept the Inbox's threads, so every reload waited for People's read", () => {
  const w = globalThis.window;
  const was = w.location.hash;
  const book = (n) => ({ rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, words: "x".repeat(2000) })) });
  try {
    for (const [hash, kept, shed] of [
      ["#/today", ["people", "today"], "inbox"],
      ["#/inbox", ["inbox", "today"], "people"],
    ]) {
      clearSurfaceCache();
      w.location.hash = hash;
      setSurfaceValue("people", book(500)); // ~1 MB, People's book: Today draws it
      setSurfaceValue("inbox", book(600)); // ~1.2 MB, the Inbox's threads: Today does not
      setSurfaceValue("today", { small: true });
      for (const k of ["people", "inbox", "today"]) snapshotSurface(k, [], TID, undefined, k);
      const slot = JSON.parse(stored() ?? "null");
      assert.deepEqual(Object.keys(slot.surfaces).sort(), kept, `${hash}: ${shed} is the one left out`);
    }
  } finally {
    w.location.hash = was;
    clearSurfaceCache();
  }
});

test("a snapshot another build kept is drawn where its value's type is this build's, alone; not where the type changed, the checker cannot see it, a global stands beside it or it is a day old", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    clearSurfaceCache();
    const now = Date.now();
    const build = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
    const kept = (b, shape, at = now) => ({ build: b, shape, at });
    globalThis.localStorage.setItem(
      CACHE,
      JSON.stringify({
        build: "an-older-build",
        savedAt: now,
        at: "salon",
        tenant: TID,
        surfaces: {
          // The same type in both builds: drawn.
          today: { $value: { n: 1 }, $kept: kept("an-older-build", SURFACE_SHAPES.today) },
          // Its type changed since: read as a first visit reads it.
          people: { $value: { rows: [] }, $kept: kept("an-older-build", "a-type-since-changed") },
          // A global of the window's beside it, whose shape no checker holds.
          calendar: {
            $value: { n: 1 },
            __CALENDAR_PROBE: { n: 1 },
            $kept: kept("an-older-build", SURFACE_SHAPES.calendar),
          },
          // A type the checker cannot see all of: the build's alone.
          inbox: { $value: { n: 1 }, $kept: kept("an-older-build", null) },
          // This build's own, whatever its shape says.
          setup: { $value: { n: 1 }, $kept: kept(build, "anything") },
          // A day old, from this build or not.
          google: { $value: { n: 1 }, $kept: kept(build, SURFACE_SHAPES.google, now - 25 * 3_600_000) },
          // From before snapshots said what they were kept under: the slot's build's.
          channels: { $value: { n: 1 } },
        },
      }),
    );
    assert.equal(SURFACE_SHAPES.inbox, null, "the Inbox's value hides a type from the checker (shapes.generated.ts)");
    assert.deepEqual([...hydrateSurfaceCache()].sort(), ["setup", "today"]);
    assert.deepEqual(surfaceValue("today"), { n: 1 });
    assert.equal(globalThis.window.__CALENDAR_PROBE, undefined, "nothing of a snapshot not drawn reaches the window");
    assert.equal(globalThis.window.$kept, undefined, "and what a snapshot was kept under is never a global");
  } finally {
    delete globalThis.window.__CALENDAR_PROBE;
    mock.timers.reset();
    clearSurfaceCache();
  }
});

test("a value's type is fingerprinted all the way down: a field renamed three levels in changes it, the same type written another way does not, and one the checker cannot see into has none", async () => {
  const ts = (await import("typescript")).default;
  const { shapeOf } = await import("../../../gen/surface-shapes.mjs");
  const file = "/fixture/values.ts";
  const text = [
    "interface Row { id: string; tone: 'ok' | 'warn'; at?: number }",
    "type Same = { tone: 'warn' | 'ok'; id: string; at?: number };",
    "interface Tree { name: string; kids: Tree[] }",
    "export interface V {",
    "  a: { rows: Row[]; byId: Record<string, Row>; when: Date; pair: [string, number] };",
    "  b: { rows: Same[]; byId: Record<string, Same>; when: Date; pair: [string, number] };",
    "  c: { rows: { id: string; tone: 'ok' | 'warn'; at?: string }[]; byId: Record<string, Row>; when: Date; pair: [string, number] };",
    "  d: { rows: Row[]; raw: unknown };",
    "  e: Tree | null;",
    "}",
  ].join("\n");
  const options = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, types: [] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, ...rest) =>
    name === file ? ts.createSourceFile(name, text, language) : read(name, language, ...rest);
  host.fileExists = (name) => name === file || ts.sys.fileExists(name);
  const program = ts.createProgram({ rootNames: [file], options, host });
  const checker = program.getTypeChecker();
  let iface;
  ts.forEachChild(program.getSourceFile(file), (n) => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === "V") iface = n;
  });
  const of = (name) => {
    const prop = checker.getPropertyOfType(checker.getTypeAtLocation(iface.name), name);
    let hidden = false;
    const shape = shapeOf(
      checker,
      checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration),
      () => (hidden = true),
    );
    return { shape, hidden };
  };
  assert.equal(
    of("a").shape,
    of("b").shape,
    "an alias of the same type, its members in another order, is the same shape",
  );
  assert.notEqual(of("a").shape, of("c").shape, "a field's type changed inside an array's rows is another shape");
  assert.match(of("a").shape, /when:<Date>/, "a type of the standard library is said by name");
  assert.equal(of("d").hidden, true, "unknown hides what a snapshot holds: no fingerprint");
  assert.equal(of("a").hidden, false);
  assert.match(of("e").shape, /@Tree/, "a type that holds itself is said by name where it comes round again");
});

test("each snapshot says the build, its value's type and the time it was kept under", () => {
  clearSurfaceCache();
  setSurfaceValue("today", { n: 2 });
  snapshotSurface("today", [], TID, undefined, "today");
  const { $kept } = JSON.parse(stored()).surfaces.today;
  assert.equal($kept.build, process.env.NEXT_PUBLIC_BUILD_SHA || "dev");
  assert.equal($kept.shape, SURFACE_SHAPES.today);
  assert.ok(Math.abs(Date.now() - $kept.at) < 5_000);
  clearSurfaceCache();
});

test("a clear (a sign-in, a sign-out, a 401, a switch) drops every workspace's slot this browser kept, and nothing else of its storage", () => {
  clearSurfaceCache();
  const w = globalThis.window;
  w.__TODAY_PROBE = { n: 1 };
  snapshotSurface("today", ["__TODAY_PROBE"], TID);
  flushSurfaceCache();
  w.location.pathname = "/w/bayside";
  try {
    snapshotSurface("today", ["__TODAY_PROBE"], "t-bayside");
    flushSurfaceCache();
  } finally {
    w.location.pathname = "/w/salon";
  }
  globalThis.localStorage.setItem("chanlytics.theme", "dark");
  assert.ok(
    globalThis.localStorage.getItem(CACHE) && globalThis.localStorage.getItem(slot("bayside")),
    "two workspaces kept",
  );
  clearSurfaceCache();
  assert.equal(globalThis.localStorage.getItem(CACHE), null);
  assert.equal(globalThis.localStorage.getItem(slot("bayside")), null, "every workspace's, not only this address's");
  assert.equal(globalThis.localStorage.getItem("chanlytics.theme"), "dark", "and only the cache's own");
  globalThis.localStorage.removeItem("chanlytics.theme");
  delete w.__TODAY_PROBE;
});

/* ------------------------------ a refresh says the time it is ------------------------------ */

const ZONE = "America/New_York";
/** When the Inbox was read: 10:00 AM in the salon's zone, on 15 Sep. */
const READ_AT = Date.parse("2026-09-15T14:00:00Z");
/** When the tab is refreshed: 6:00 AM the next morning, inside the day a snapshot is drawn for. */
const PAINT_AT = READ_AT + 20 * 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const HOUR = 3_600_000;
const customer = (id, name) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+16465550123",
  email: null,
  consent: "opted_in",
  dnc: false,
  marketing_consent: null,
  proposal_url: null,
});
/** A conversation as GET conversations answers it: the customer wrote an hour before the read. */
const thread = (id, name, over = {}) => ({
  id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: iso(READ_AT - HOUR),
  last_message_at: iso(READ_AT - HOUR),
  last_inbound_at: iso(READ_AT - HOUR),
  contact: customer(`p-${id}`, name),
  messages: [
    {
      id: `m-${id}`,
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Can I move my appointment?",
      media: null,
      meta: null,
      status: "received",
      created_at: iso(READ_AT - HOUR),
      channel_ts: iso(READ_AT - HOUR),
    },
  ],
  ...over,
});

test("REGRESSION: a refresh paints the Inbox's times as the clock says them when it paints -- a row said '9:00 AM' on yesterday's thread and 'waiting 2h' on a wait of 22, until the read landed a beat later and moved the rows", async () => {
  const { toInboxThreadVM } = await import("@chanlytics/contracts");
  // Handled, waiting on you for two hours, and snoozed until 7:00 the next morning.
  const quiet = thread("c-quiet", "Sam Example");
  const waiting = thread("c-wait", "Rosa Example", { state: "needs_human" });
  const hold = {
    id: "e-wait",
    reason: "human_token",
    details: null,
    state: "open",
    created_at: iso(READ_AT - 2 * HOUR),
  };
  const napping = thread("c-nap", "Kim Example", { state: "snoozed", snooze_until: iso(READ_AT + 21 * HOUR) });
  inboxWire.conversations = [quiet, waiting, napping];
  inboxWire.escalations = [{ ...hold, conversation_id: waiting.id }];
  const holdOf = (dto) => (dto === waiting ? hold : null);
  const timesOf = (t) => [t.lastAt, t.lastAtFull, t.waited, t.waitingMin, t.wake];
  mock.timers.enable({ apis: ["Date"], now: READ_AT });
  try {
    clearSurfaceCache();
    await quietly(() => inboxOverride.apply());
    snapshotSurface(
      inboxOverride.key,
      inboxOverride.globals ?? [],
      TID,
      inboxOverride.trimSnapshot,
      inboxOverride.value,
    );
    flushSurfaceCache();
    const read = surfaceValue("inbox").THREADS;
    assert.deepEqual(
      read.map(timesOf),
      [
        ["9:00 AM", "9:00 AM", undefined, undefined, undefined],
        ["9:00 AM", "9:00 AM", "2h", 120, undefined],
        ["9:00 AM", "9:00 AM", undefined, undefined, "Sep 16"],
      ],
      "the read says its clock's words",
    );

    // F5 the next morning: the cache is drawn before anything is read again.
    mock.timers.setTime(PAINT_AT);
    setSurfaceValue("inbox", undefined);
    assert.deepEqual([...hydrateSurfaceCache()], ["inbox"]);
    const painted = surfaceValue("inbox").THREADS;
    const now = inboxWire.conversations.map((dto) => toInboxThreadVM(dto, holdOf(dto), ZONE, new Date(PAINT_AT)));
    assert.deepEqual(
      painted.map(timesOf),
      now.map(timesOf),
      "REGRESSION: the rows painted the words of the clock that read them, until the next read",
    );
    assert.deepEqual(
      painted.map(timesOf),
      [
        ["Sep 15", "Sep 15", undefined, undefined, undefined],
        ["Sep 15", "Sep 15", "22h", 1320, undefined],
        ["Sep 15", "Sep 15", undefined, undefined, "7:00 AM"],
      ],
      "yesterday's time is its date, the wait is the morning's, and the snooze wakes at seven today",
    );
    assert.deepEqual(
      painted.map((t) => t.lastAtMs),
      read.map((t) => t.lastAtMs),
      "the moments are the read's: only the words are said again",
    );
  } finally {
    mock.timers.reset();
    inboxWire.conversations = [];
    inboxWire.escalations = [];
    setSurfaceValue("inbox", undefined);
    clearSurfaceCache();
  }
});

test("a snapshot that does not say the zone its times were said in is painted as it was kept: a zone guessed would move the rows the other way", async () => {
  clearSurfaceCache();
  const { toInboxThreadVM } = await import("@chanlytics/contracts");
  const kept = toInboxThreadVM(thread("c-old", "Lee Example"), null, ZONE, new Date(READ_AT));
  setSurfaceValue("inbox", {
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    THREADS: [kept],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: { doneThisWeek: 0 },
  });
  snapshotSurface("inbox", [], TID, undefined, "inbox");
  flushSurfaceCache();
  setSurfaceValue("inbox", undefined);
  hydrateSurfaceCache();
  assert.equal(
    surfaceValue("inbox").THREADS[0].lastAt,
    "9:00 AM",
    "a snapshot written before the zone was kept with it",
  );
  setSurfaceValue("inbox", undefined);
  clearSurfaceCache();
});
