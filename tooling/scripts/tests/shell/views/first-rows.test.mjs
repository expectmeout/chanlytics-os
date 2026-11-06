/**
 * The rows a phone last showed, drawn before the app's code has run (contracts shell/first-rows.ts, the load speed review of
 * 6 Nov 2026). The document's script is run here over a stand-in for what a document gives it: it draws a copy only for the
 * address, the width and the very stylesheets it was kept under, never past a day, says no time on a copy some minutes old, keeps
 * a press for the frame to make again, and whatever it meets it leaves the outline standing. e2e/shell/first-rows.spec.ts holds
 * the same in a browser, against the frame's own rows.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dropFirstRows,
  FIRST_ROWS_ATTR,
  FIRST_ROWS_ID,
  FIRST_ROWS_OLDEST_MS,
  FIRST_ROWS_PAGES,
  FIRST_ROWS_SHEETS_ATTR,
  FIRST_ROWS_TEST,
  firstRowsOfPath,
  firstRowsScript,
  firstRowsSlot,
  firstRowsStand,
  homeBootScript,
  LAST_WORKSPACE_STORAGE,
  PRIMARY_PART,
} from "../../../../../packages/contracts/src/index.ts";
import { importSrc } from "../../_source.mjs";

const { homeHref, workspaceHref } = await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");

const SHEETS = ["/_next/static/a.css", "/_next/static/b.css"];
const NOW = 1_800_000_000_000;

/** A box the script hit-tests: where it stands on the screen. */
const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });

/** An element, as much of one as the script touches. */
function elementOf(tag = "div", attrs = {}, rect = box(0, 0, 0, 0)) {
  const a = { ...attrs };
  return {
    tag,
    id: "",
    className: "",
    innerHTML: "",
    removed: false,
    attrs: a,
    getAttribute: (k) => (k in a ? a[k] : null),
    setAttribute: (k, v) => void (a[k] = String(v)),
    removeAttribute: (k) => void delete a[k],
    hasAttribute: (k) => k in a,
    getBoundingClientRect: () => rect,
    remove() {
      this.removed = true;
    },
  };
}

/**
 * The script run at `pathname`, in a window `width` wide holding `kept` under `slot`, under `sheets`. Answers what it stamped,
 * the picture it drew, the listeners it left and the timers it set, or what it threw.
 */
function run({
  pathname = "/w/acme/inbox",
  search = "",
  hash = "",
  width = 393,
  sheets = SHEETS,
  kept,
  slot = firstRowsSlot("acme", "inbox"),
  raw,
  webdriver = false,
  testWord = null,
  storageThrows = false,
  now = NOW,
}) {
  const html = elementOf("html");
  html.classList = { add: (c) => void (html.attrs[`class:${c}`] = "") };
  const body = { children: [], appendChild: (c) => void body.children.push(c) };
  const made = [];
  const byId = () => body.children.find((c) => c.id === FIRST_ROWS_ID && !c.removed) ?? null;
  const document = {
    documentElement: html,
    body,
    querySelectorAll: (sel) => (sel.includes("stylesheet") ? sheets.map((h) => elementOf("link", { href: h })) : []),
    createElement: (tag) => {
      const e = elementOf(tag);
      e.parts = { tabs: [], rows: [] };
      e.querySelectorAll = (sel) => (sel.includes("tab-bar-tab") ? e.parts.tabs : e.parts.rows);
      made.push(e);
      return e;
    },
    getElementById: byId,
  };
  const stored = raw ?? (kept ? JSON.stringify(kept) : null);
  const localStorage = {
    getItem: (k) => {
      if (storageThrows) throw new Error("blocked");
      return k === slot ? stored : null;
    },
  };
  const sessionStorage = { getItem: (k) => (k === FIRST_ROWS_TEST ? testWord : null) };
  const listeners = {};
  const timers = [];
  const frames = [];
  let threw = null;
  const G = {
    document,
    localStorage,
    sessionStorage,
    location: { pathname, search, hash },
    navigator: { webdriver },
    innerWidth: width,
    Date: { now: () => now },
    performance: { now: () => 412.4 },
    requestAnimationFrame: (f) => frames.push(f),
    setTimeout: (f, ms) => timers.push({ f, ms }),
    addEventListener: (type, f) => void (listeners[type] = f),
    removeEventListener: (type) => void delete listeners[type],
  };
  try {
    new Function(...Object.keys(G), firstRowsScript())(...Object.values(G));
  } catch (e) {
    threw = e;
  }
  return { html, body, picture: made[0] ?? null, listeners, timers, frames, threw };
}

/** What the document's own run says of its sheets: a copy is kept under the same word. */
const sheetsWord = (sheets = SHEETS) => run({ sheets, pathname: "/login" }).html.attrs[FIRST_ROWS_SHEETS_ATTR];

const copy = (over = {}) => ({
  at: NOW - 60_000,
  width: 393,
  sheets: sheetsWord(),
  vars: "--frame-top: 124px;",
  html: '<div class="app-root"></div>',
  ...over,
});

test("the Inbox's and People's rows take the picture's place, as their first parts; Today's whole page does, by its last", () => {
  assert.equal(FIRST_ROWS_PAGES.inbox.part, PRIMARY_PART.inbox);
  assert.equal(FIRST_ROWS_PAGES.people.part, PRIMARY_PART.people);
  assert.equal(PRIMARY_PART.today, "queue");
  assert.equal(FIRST_ROWS_PAGES.today.part, "look");
});

test("a copy is of a page's bare address, and of no other", () => {
  assert.deepEqual(firstRowsOfPath("/w/acme/inbox"), { workspace: "acme", word: "inbox" });
  assert.deepEqual(firstRowsOfPath("/w/acme/people"), { workspace: "acme", word: "people" });
  assert.deepEqual(firstRowsOfPath("/w/acme/today"), { workspace: "acme", word: "today" });
  assert.deepEqual(
    firstRowsOfPath("/w/acme"),
    { workspace: "acme", word: "today" },
    "a workspace's address opens on Today",
  );
  for (const other of [
    "/w/acme/calendar",
    "/w/acme/inbox/th-1",
    "/w/acme/people/leads",
    "/w/acme/people/abc",
    "/",
    "/login",
  ])
    assert.equal(firstRowsOfPath(other), null, other);
});

test("a copy of Today is drawn at the workspace's bare address, and for an hour, where a list's is drawn for a day", () => {
  const today = (at, pathname = "/w/acme") =>
    run({ pathname, kept: copy({ at: NOW - at }), slot: firstRowsSlot("acme", "today") }).body.children.length;
  assert.equal(today(30 * 60_000), 1);
  assert.equal(today(30 * 60_000, "/w/acme/today"), 1);
  assert.equal(today(61 * 60_000), 0, "Today says the hours and the waits in its own sentences");
  assert.equal(
    run({ kept: copy({ at: NOW - 23 * 60 * 60_000 }) }).body.children.length,
    1,
    "a list leaves its times out",
  );
});

/** The home's script at an address, with `last` remembered: where it sent the tab. */
function fromHome({ pathname = "/", search = "", hash = "", last = "acme", storageThrows = false }) {
  let went = null;
  const location = { pathname, search, hash, replace: (to) => void (went = to) };
  const localStorage = {
    getItem: (k) => {
      if (storageThrows) throw new Error("blocked");
      return k === LAST_WORKSPACE_STORAGE ? last : null;
    },
  };
  new Function("location", "localStorage", homeBootScript())(location, localStorage);
  return went;
}

test("the home sends a tab on to the workspace it remembers before anything of the app has run, as the home itself would", () => {
  assert.equal(fromHome({}), workspaceHref("acme"));
  assert.equal(fromHome({ last: "café & co" }), workspaceHref("café & co"));
  assert.equal(fromHome({}), homeHref("acme", null, ""));
});

test("what is not the bare home, or remembers nothing, is left to the home's own code", () => {
  assert.equal(fromHome({ last: null }), null, "a first sign-in, or a cleared browser");
  assert.equal(fromHome({ pathname: "/w/acme" }), null);
  assert.equal(fromHome({ pathname: "/login" }), null);
  assert.equal(fromHome({ search: "?w=other" }), null, "a deep link names its own workspace");
  assert.equal(fromHome({ hash: "#/inbox" }), null);
  assert.equal(fromHome({ storageThrows: true }), null);
});

test("every document says which stylesheets it has, in one word for one set and another for another", () => {
  const a = run({ pathname: "/login" });
  assert.equal(a.threw, null);
  assert.ok(a.html.attrs[FIRST_ROWS_SHEETS_ATTR]);
  assert.equal(sheetsWord(), sheetsWord([...SHEETS]));
  assert.notEqual(sheetsWord(), sheetsWord(["/_next/static/a.css", "/_next/static/c.css"]));
});

test("a copy kept here, under these sheets, at this width, is drawn over the outline before anything of the app", () => {
  const r = run({ kept: copy() });
  assert.equal(r.threw, null);
  assert.equal(r.body.children.length, 1);
  assert.equal(r.picture.id, FIRST_ROWS_ID);
  assert.equal(r.picture.className, FIRST_ROWS_ID);
  assert.equal(r.picture.innerHTML, '<div class="app-root"></div>');
  assert.equal(r.picture.attrs.style, "--frame-top: 124px;");
  assert.ok("inert" in r.picture.attrs, "nothing in it is pressed or reached");
  assert.equal(r.picture.attrs["aria-hidden"], "true");
  assert.equal(r.html.attrs[FIRST_ROWS_ATTR], "inbox");
  assert.ok("class:legacy-on" in r.html.attrs, "the page's rules read what the frame stamps");
  assert.ok("data-page-top" in r.html.attrs);
  r.frames.forEach((f) => f());
  assert.equal(r.picture.attrs["data-at"], "412", "it says when it was painted");
});

test("a copy is drawn only where it may be", () => {
  const cases = {
    "another page": { pathname: "/w/acme/today" },
    "a thread": { pathname: "/w/acme/inbox/th-1" },
    "another workspace": { pathname: "/w/other/inbox" },
    "an address with a query": { search: "?see=x" },
    "an address with a route in its hash": { hash: "#/today" },
    "a desk": { width: 1280, kept: copy({ width: 1280 }) },
    "another width": { width: 430 },
    "other stylesheets": { sheets: ["/_next/static/z.css"] },
    "a day old": { kept: copy({ at: NOW - FIRST_ROWS_OLDEST_MS }) },
    "kept in the future": { kept: copy({ at: NOW + 60_000 }) },
    "a browser a suite drives": { webdriver: true },
    "nothing kept": { raw: "" },
  };
  for (const [what, at] of Object.entries(cases)) {
    const r = run({ kept: copy(), ...at });
    assert.equal(r.threw, null, what);
    assert.equal(r.body.children.length, 0, what);
    assert.equal(r.html.attrs[FIRST_ROWS_ATTR], undefined, what);
    assert.deepEqual(r.listeners, {}, what);
  }
});

test("a suite's own spec may ask to be let in", () => {
  assert.equal(run({ kept: copy(), webdriver: true, testWord: "1" }).body.children.length, 1);
});

test("what it cannot read leaves the outline standing, and throws nothing", () => {
  for (const at of [{ raw: "not json" }, { raw: "[]" }, { raw: "null" }, { storageThrows: true }]) {
    const r = run({ kept: copy(), ...at });
    assert.equal(r.threw, null, JSON.stringify(at));
    assert.equal(r.body.children.length, 0, JSON.stringify(at));
  }
});

test("a copy some minutes old says it has aged, and one kept a moment ago does not", () => {
  assert.ok(!("data-aged" in run({ kept: copy({ at: NOW - 60_000 }) }).picture.attrs));
  assert.ok("data-aged" in run({ kept: copy({ at: NOW - 6 * 60_000 }) }).picture.attrs);
});

test("the document lets the picture go by itself where no frame ever came to", () => {
  const r = run({ kept: copy() });
  assert.equal(r.timers.length, 1);
  assert.ok(r.timers[0].ms >= 10_000, "long enough for a slow line's code");
  r.timers[0].f();
  assert.equal(r.picture.removed, true);
  assert.equal(r.html.attrs[FIRST_ROWS_ATTR], undefined);
});

/** A press at a point on the picture, and what it did. */
function press(r, type, clientX, clientY) {
  const seen = { stopped: false, prevented: false };
  r.listeners[type]({
    type,
    clientX,
    clientY,
    stopPropagation: () => (seen.stopped = true),
    preventDefault: () => (seen.prevented = true),
  });
  return seen;
}

test("over the picture a press is kept: a thread, a person, or a place of the tab bar over them", () => {
  const r = run({ kept: copy() });
  const thread = elementOf("div", { "data-thread-id": "th-1" }, box(0, 100, 393, 60));
  const person = elementOf("tr", { "data-row-id": "p-9" }, box(0, 160, 393, 60));
  const tab = elementOf("a", {}, box(0, 180, 60, 60));
  r.picture.parts.rows = [thread, person];
  r.picture.parts.tabs = [elementOf("a", {}, box(100, 500, 60, 60)), tab];

  const down = press(r, "pointerdown", 30, 120);
  assert.ok(down.stopped && down.prevented, "the frame under it hears nothing");
  assert.ok("data-hover" in thread.attrs, "the finger's row lights as it lands");
  press(r, "click", 30, 120);
  assert.equal(r.picture.attrs["data-press"], "thread:th-1");

  press(r, "pointerdown", 200, 170);
  assert.ok(!("data-hover" in thread.attrs), "one row is lit at a time");
  press(r, "click", 200, 170);
  assert.equal(r.picture.attrs["data-press"], "row:p-9", "the last press is the one made");

  press(r, "click", 30, 200);
  assert.equal(r.picture.attrs["data-press"], "tab:1", "the tab bar stands over the rows");

  const elsewhere = press(r, "click", 380, 700);
  assert.ok(elsewhere.stopped);
  assert.equal(r.picture.attrs["data-press"], "tab:1", "a press on nothing changes nothing");
});

test("once the picture has gone a press is the page's, and the listeners leave", () => {
  const r = run({ kept: copy() });
  r.picture.remove();
  const seen = press(r, "click", 30, 120);
  assert.equal(seen.stopped, false);
  assert.deepEqual(r.listeners, {});
});

test("dropFirstRows and firstRowsStand read and let go of what the script stamped", () => {
  const r = run({ kept: copy() });
  const doc = {
    documentElement: r.html,
    getElementById: (id) => (id === FIRST_ROWS_ID ? r.picture : null),
  };
  assert.equal(firstRowsStand(doc), true);
  dropFirstRows(doc);
  assert.equal(r.picture.removed, true);
  assert.equal(firstRowsStand(doc), false);
});
