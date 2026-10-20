/**
 * Back from a person to the row you were on (apps/dashboard/src/surfaces/people/people-route.tsx, hooks/use-place.ts, kit
 * motion/held-list.ts; Ruben, 20 Oct 2026: "they can swipe back to go back exactly where they were").
 *
 * People keeps each view's place in the tab: how far its list was scrolled, saved once a scroll settles, put back as the
 * view opens. A person's page is drawn over the scope it was opened from, which React keeps out of sight under them (its
 * Activity), so the place's effects stop as they open and start again as they go. Three things could go wrong there:
 * - a scroll that had not settled as a row was pressed went with its timer, so Back found the place before it;
 * - the window's scroll to the person's top, heard before the scope's effects stopped, was saved as the list's place;
 * - the hold put the row you were on back where it stood, and the place then put the list back again, by a count of
 *   pixels, where the rows had moved (a row added above while you were away).
 *
 * Run against the place keeper and the hold themselves, each in a component drawn by hand: their state kept between draws,
 * the hold's layout effects run before the paint and the place's effects after it, as React runs them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fromDashboard = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../../apps/dashboard/src/legacy-bridge/_.js"),
);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ what stands in for a browser ------------------------------ */

const matches = (n, sel) =>
  sel.split(",").some((s) => {
    const one = s.trim();
    if (one === "[data-held]") return n.dataset.held !== undefined;
    if (one.startsWith(".")) return n.className === one.slice(1);
    return n.name === one;
  });

/** An element: its top in the document (`at`, moved by the window's scroll), its height, and whether React hides it. */
const element = (name, { at = 0, height = 60 } = {}) => {
  const style = {
    removeProperty(k) {
      delete style[k];
    },
  };
  return {
    name,
    at,
    height,
    className: "",
    css: { overflowY: "visible", scrollPaddingTop: "0px" },
    style,
    dataset: {},
    children: [],
    parentElement: null,
    isConnected: true,
    hidden: false,
    get firstElementChild() {
      return this.children[0] ?? null;
    },
    getClientRects() {
      for (let n = this; n; n = n.parentElement) if (n.hidden) return [];
      return [{}];
    },
    getBoundingClientRect() {
      const top = this.at - win.scrollY;
      return { top, bottom: top + this.height, left: 0, width: 375, height: this.height };
    },
    closest(sel) {
      for (let n = this; n; n = n.parentElement) if (matches(n, sel)) return n;
      return null;
    },
    contains(other) {
      for (let n = other; n; n = n.parentElement) if (n === this) return true;
      return false;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
};
const put = (parent, child) => {
  parent.children.push(child);
  child.parentElement = parent;
  return child;
};

const store = new Map();
const heard = new Map();
const html = element("html", { height: 4000 });
html.css.scrollPaddingTop = "140px";
const body = put(html, element("body", { height: 4000 }));
const win = {
  location: { pathname: "/w/acme/people" },
  sessionStorage: {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  innerHeight: 800,
  scrollY: 0,
  matchMedia: (q) => ({ matches: q.includes("coarse") }),
  getComputedStyle: (el) => el.css,
  scrollTo(x, y) {
    win.scrollY = y;
  },
  scrollBy(x, y) {
    win.scrollY += y;
  },
  // The hold's still picture of a list kept out of the document waits for the phone to be idle: never, here.
  requestIdleCallback: () => 0,
  cancelIdleCallback() {},
  addEventListener: (kind, fn) => (heard.get(kind) ?? heard.set(kind, new Set()).get(kind)).add(fn),
  removeEventListener: (kind, fn) => heard.get(kind)?.delete(fn),
};
globalThis.window = win;
globalThis.getComputedStyle = win.getComputedStyle;
globalThis.document = {
  body,
  documentElement: html,
  scrollingElement: html,
  at: null,
  elementFromPoint: () => globalThis.document.at,
  getElementById: () => null,
};
Object.defineProperty(html, "scrollTop", {
  get: () => win.scrollY,
  set: (v) => {
    win.scrollY = v;
  },
});

/** The browser telling the page the window has scrolled (`to`, where given): a frame after it moved. */
const scrollEvent = (to = win.scrollY) => {
  win.scrollY = to;
  for (const fn of heard.get("scroll") ?? []) fn();
};

/* ------------------------------ the hooks, drawn by hand ------------------------------ */

const react = fromDashboard("react");
const { usePlPlace } = fromDashboard("../surfaces/people/hooks/use-place.ts");
const { useHeldList } = fromDashboard("../surfaces/kit/motion/held-list.ts");

/**
 * One component: its hooks' cells kept between draws in the order it asks for them, and its effects, each run after a draw
 * whose inputs changed. `hide` is React's Activity taking it out of sight: its effects stop in the commit's passive phase,
 * after the layout effects, and every one starts again once `show` brings it back.
 */
const component = (render) => {
  const cells = [];
  const effects = [];
  let hidden = false;
  let stopping = false;
  return {
    draw(...args) {
      let i = 0;
      let e = 0;
      react.useRef = (v) => ((cells[i] ??= { current: v }), cells[i++]);
      react.useState = (v) => {
        const cell = (cells[i++] ??= { v: typeof v === "function" ? v() : v });
        return [cell.v, (n) => (cell.v = typeof n === "function" ? n(cell.v) : n)];
      };
      const record = (kind) => (fn, deps) => {
        const at = e++;
        const was = effects[at];
        const same = was && deps && was.deps && deps.every((d, k) => Object.is(d, was.deps[k]));
        if (same && !was.due) return;
        effects[at] = { kind, fn, deps, cleanup: was?.cleanup, due: true };
      };
      react.useEffect = record("passive");
      react.useLayoutEffect = record("layout");
      render(...args);
    },
    run(kind) {
      if (hidden) {
        if (kind !== "passive" || !stopping) return;
        stopping = false;
        for (const ef of effects) {
          if (typeof ef.cleanup === "function") ef.cleanup();
          ef.cleanup = undefined;
          ef.due = true;
        }
        return;
      }
      for (const ef of effects) {
        if (ef.kind !== kind || !ef.due) continue;
        ef.due = false;
        if (typeof ef.cleanup === "function") ef.cleanup();
        ef.cleanup = ef.fn();
      }
    },
    hide() {
      if (!hidden) stopping = true;
      hidden = true;
    },
    show() {
      hidden = false;
    },
  };
};

/**
 * People on a phone: the frame's top 140px over a list of 30 rows, 80px each, from 220px down, in its scope's root; the
 * scope's pane is what its place keeper scrolls (the window, on a phone). The route holds the scope under a person
 * (`draw(true)`), and the scope keeps its view's place.
 */
const people = () => {
  store.clear();
  heard.clear();
  body.children.length = 0;
  win.scrollY = 0;
  const scope = put(body, element("scope", { at: 220, height: 2400 }));
  const pane = put(scope, element("pane", { at: 220, height: 2400 }));
  const rows = Array.from({ length: 30 }, (_, i) => put(pane, element("li", { at: 220 + 80 * i, height: 80 })));
  const nothing = () => {};
  const controls = {
    phone: true,
    setBulkSheet: nothing,
    selectMode: false,
    setSelectMode: nothing,
    sel: new Set(),
    setSel: nothing,
    toggleSel: nothing,
    setAllMatching: nothing,
    clearSelection: nothing,
    q: "",
    setQ: nothing,
    searchRef: { current: null },
    scrollRef: { current: pane },
  };
  const route = component((person) => useHeldList(person, () => scope));
  const view = component(() =>
    usePlPlace({ controls, page: "people", view: "all", ids: [], noun: "client", landed: true, selectionOf: "all" }),
  );
  /**
   * The route drawn with a person open or not, and the scope under it, out of sight while one is: React's commit, the
   * scope hidden or shown, then the layout effects (the hold), `beforePassive`, then the effects after the paint.
   */
  const draw = (person, { beforePassive = () => {} } = {}) => {
    route.draw(person);
    view.draw();
    scope.hidden = person;
    if (person) view.hide();
    else view.show();
    view.run("layout");
    route.run("layout");
    beforePassive();
    view.run("passive");
    route.run("passive");
  };
  /** The scope taken out of sight and shown again with no person over it (Leads, then People again). */
  const awayAndBack = (meanwhile) => {
    scope.hidden = true;
    view.hide();
    view.run("passive");
    meanwhile();
    scope.hidden = false;
    view.show();
    view.draw();
    view.run("layout");
    view.run("passive");
  };
  const saved = () => {
    for (const v of store.values()) {
      const place = JSON.parse(v)["acme|people|all"];
      if (place) return place;
    }
    return undefined;
  };
  // The row under the frame's top, as the screen shows it now; the hold finds it there.
  const rowAtTop = () => (globalThis.document.at = rows.find((r) => r.getBoundingClientRect().bottom > 141) ?? null);
  return { draw, awayAndBack, saved, rowAtTop, rows };
};

/* ------------------------------------------ cases ------------------------------------------ */

test("a scroll not yet settled as a row is pressed is kept: Back finds the list where it was, not where it was before", async () => {
  const p = people();
  p.draw(false);
  p.draw(false);
  scrollEvent(1200);
  await wait(400);
  assert.equal(p.saved()?.top, 1200, "a scroll that settled is kept");
  scrollEvent(1500);
  p.rowAtTop();
  // Pressed at once: the scope's effects stop before their save was due, and the save they were waiting on is made.
  p.draw(true);
  assert.equal(p.saved()?.top, 1500);
});

test("the window's scroll to the person's top, heard before the scope's effects stop, is no scroll of the list", async () => {
  const p = people();
  p.draw(false);
  p.draw(false);
  scrollEvent(1500);
  await wait(400);
  p.rowAtTop();
  // The hold takes the window to the person's top, and the browser says so before React has stopped the scope's effects.
  p.draw(true, { beforePassive: () => scrollEvent() });
  assert.equal(win.scrollY, 0, "the person's page starts at its top");
  assert.equal(p.saved()?.top, 1500, "the list's place is where it was, not the person's 0");
});

test("as the person goes the row you were on is put back where it stood, once: the place does not move it again", async () => {
  const p = people();
  p.draw(false);
  p.draw(false);
  scrollEvent(1500);
  await wait(400);
  const row = p.rowAtTop();
  const stood = row.getBoundingClientRect().top;
  p.draw(true);
  // A row added above while they were away: everything under it is 80px further down the page.
  for (const r of p.rows) r.at += 80;
  p.draw(false);
  assert.equal(row.getBoundingClientRect().top, stood, "the row you were on stands where it stood");
  assert.equal(win.scrollY, 1580, "and the place's 1500, a count of pixels, was not put back over it");
  // The browser tells the page where the hold scrolled it, and that is the list's place from now on.
  scrollEvent();
  await wait(400);
  assert.equal(p.saved()?.top, 1580);
  // Shown again later with no person over it (Leads, then People): its place is put back as it always was.
  p.awayAndBack(() => (win.scrollY = 0));
  assert.equal(win.scrollY, 1580, "the next showing puts the place back: the hold's word is taken once");
});
