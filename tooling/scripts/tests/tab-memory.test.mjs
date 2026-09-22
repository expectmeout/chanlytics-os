/**
 * What a tab keeps for its pages: where the member was in each view, and work half-done.
 *
 * Leads kept both in two slots of its own (clients-a.jsx LD_PLACE_SLOT, LD_FINDER_SLOT), and every other page kept
 * nothing -- a refresh, or a trip to another page, lost the Inbox's search, the list's scroll, a half-written reply.
 * One store now, for every page that has a place or a draft worth keeping (the loading standard, piece F and G): the
 * TAB's storage (a front desk's computer is shared), per workspace, the last twelve views of a page, a draft a day
 * old forgotten, a place left the way its view opens not remembered at all, and all of it gone at sign-out.
 * Run, never read: the module against a window whose storage is a Map.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    get size() {
      return m.size;
    },
    keys: () => [...m.keys()],
  };
};
let clock = Date.parse("2026-09-22T12:00:00Z");
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
globalThis.window = {
  location: { pathname: "/w/salon", hash: "" },
  sessionStorage: globalThis.sessionStorage,
  localStorage: globalThis.localStorage,
};
const { installTabMemory, clearTabMemory, TAB_SLOTS } =
  await import("../../../apps/dashboard/src/legacy-bridge/tab-memory.ts");
installTabMemory(globalThis.window, { now: () => clock });
const tm = globalThis.window.__tabMemory;
const at = (path) => {
  globalThis.window.location.pathname = path;
};

beforeEach(() => {
  clearTabMemory();
  at("/w/salon");
  clock = Date.parse("2026-09-22T12:00:00Z");
});

test("a place is kept per page and view, and read back as it was kept", () => {
  tm.keepPlace("leads", "clients/leads:s-1", { q: "nail", cursor: "l-3", top: 380 });
  tm.keepPlace("inbox", "done", { q: "friday" });
  assert.deepEqual(tm.place("leads", "clients/leads:s-1"), { q: "nail", cursor: "l-3", top: 380 });
  assert.deepEqual(tm.place("inbox", "done"), { q: "friday" });
  assert.equal(tm.place("leads", "clients/leads"), null, "another view has none");
  assert.equal(tm.place("inbox", "clients/leads:s-1"), null, "and another page's view of the same name is its own");
});

test("a place left the way its view opens is not remembered at all", () => {
  tm.keepPlace("leads", "v", { q: "nail", top: 380 });
  tm.keepPlace("leads", "v", { q: "", cursor: null, map: false, top: 0 });
  assert.equal(tm.place("leads", "v"), null);
});

test("the last twelve views of a page: the oldest goes, and a view kept again is the newest", () => {
  for (let i = 1; i <= 12; i += 1) tm.keepPlace("leads", `v${i}`, { top: i });
  tm.keepPlace("leads", "v1", { top: 100 });
  tm.keepPlace("leads", "v13", { top: 13 });
  assert.equal(tm.place("leads", "v2"), null, "the oldest went");
  assert.deepEqual(tm.place("leads", "v1"), { top: 100 }, "the one kept again stayed");
  assert.deepEqual(tm.place("leads", "v13"), { top: 13 });
  tm.keepPlace("inbox", "all", { q: "x" });
  assert.deepEqual(tm.place("leads", "v3"), { top: 3 }, "another page's places are counted apart");
});

test("a draft is kept per kind and key, and is forgotten after a day, or when dropped", () => {
  tm.keepDraft("leads-find", { words: "dentists in Queens" });
  tm.keepDraft("reply", "See you Friday", "th-1");
  assert.deepEqual(tm.draft("leads-find"), { words: "dentists in Queens" });
  assert.equal(tm.draft("reply", "th-1"), "See you Friday");
  assert.equal(tm.draft("reply", "th-2"), null, "another thread's reply is its own");
  tm.dropDraft("reply", "th-1");
  assert.equal(tm.draft("reply", "th-1"), null);
  clock += 24 * 60 * 60 * 1000 + 1;
  assert.equal(tm.draft("leads-find"), null, "a day old, it is forgotten");
});

test("each workspace keeps its own: an account in two never sees one's words in the other", () => {
  tm.keepPlace("leads", "clients/leads", { q: "nail" });
  tm.keepDraft("leads-find", { words: "gyms" });
  at("/w/other");
  assert.equal(tm.place("leads", "clients/leads"), null);
  assert.equal(tm.draft("leads-find"), null);
  at("/w/salon");
  assert.deepEqual(tm.place("leads", "clients/leads"), { q: "nail" });
});

test("it is the tab's storage, never the device's: a front desk's next person does not inherit it", () => {
  tm.keepPlace("leads", "v", { q: "nail" });
  tm.keepDraft("leads-find", { words: "gyms" });
  assert.equal(globalThis.localStorage.size, 0);
  assert.ok(globalThis.sessionStorage.size > 0);
});

test("signing out takes all of it, and the slots Leads kept before this store", () => {
  tm.keepPlace("leads", "v", { q: "nail" });
  tm.keepDraft("leads-find", { words: "gyms" });
  globalThis.sessionStorage.setItem("chanlytics.leads.place.v1", "{}");
  globalThis.sessionStorage.setItem("chanlytics.leads.finder.v1", "{}");
  globalThis.sessionStorage.setItem("something.else", "kept");
  clearTabMemory();
  assert.deepEqual(globalThis.sessionStorage.keys(), ["something.else"], "only what is not the app's own survives");
  assert.ok(TAB_SLOTS.includes("chanlytics.leads.place.v1") && TAB_SLOTS.includes("chanlytics.leads.finder.v1"));
});

test("a storage that refuses costs the memory, never the page", () => {
  const refusing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  const win = { location: { pathname: "/w/salon" }, sessionStorage: refusing };
  installTabMemory(win);
  assert.doesNotThrow(() => win.__tabMemory.keepPlace("leads", "v", { q: "x" }));
  assert.equal(win.__tabMemory.place("leads", "v"), null);
  assert.doesNotThrow(() => win.__tabMemory.keepDraft("leads-find", { words: "x" }));
  assert.equal(win.__tabMemory.draft("leads-find"), null);
});
