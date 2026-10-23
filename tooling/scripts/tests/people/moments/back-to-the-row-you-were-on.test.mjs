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
    id: "",
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
    // Its rows, in the page's order, where the hold and the place ask where they begin (kit/motion/page-scroll.ts ROW).
    querySelectorAll(sel) {
      if (!sel.split(",").some((s) => s.trim() === "li")) return [];
      const out = [];
      const walk = (n) => n.children.forEach((c) => (c.name === "li" && out.push(c), walk(c)));
      walk(this);
      return out;
    },
    focus() {
      globalThis.document.activeElement = this;
    },
    // Brought into view as the window does it: no nearer the top or the foot than the root's scroll padding.
    scrollIntoView() {
      const r = this.getBoundingClientRect();
      const top = parseFloat(html.css.scrollPaddingTop) || 0;
      const foot = win.innerHeight - (parseFloat(html.css.scrollPaddingBottom) || 0);
      if (r.top < top) win.scrollY += r.top - top;
      else if (r.bottom > foot) win.scrollY += r.bottom - foot;
    },
    addEventListener() {},
    removeEventListener() {},
    // What a still picture of it asks (held-list.ts: a list put back comes back under one).
    setAttribute(k, v) {
      this[`@${k}`] = v;
    },
    removeAttribute(k) {
      delete this[`@${k}`];
    },
    cloneNode() {
      return element(`${this.name} copy`, { at: this.at, height: this.height });
    },
    after(node) {
      put(this.parentElement, node);
    },
    remove() {
      this.isConnected = false;
    },
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
// The tab bar's room at the foot (mobile.css: --bar-foot + 76px).
html.css.scrollPaddingBottom = "80px";
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
  activeElement: null,
  elementFromPoint: () => globalThis.document.at,
  getElementById: (id) => body.children[0]?.children[0]?.children.find((r) => r.id === id) ?? null,
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
const { scrollMade, scrollGivenBack, readersScroll } = fromDashboard("../surfaces/kit/motion/page-scroll.ts");

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
const people = ({ order = "drawn" } = {}) => {
  store.clear();
  heard.clear();
  body.children.length = 0;
  win.scrollY = 0;
  globalThis.document.activeElement = null;
  const scope = put(body, element("scope", { at: 220, height: 2400 }));
  const pane = put(scope, element("pane", { at: 220, height: 2400 }));
  const rows = Array.from({ length: 30 }, (_, i) => put(pane, element("li", { at: 220 + 80 * i, height: 80 })));
  rows.forEach((r, i) => (r.id = `client-p${i}`));
  // The rows' ids as the view orders them: as drawn, or (a list in groups, Leads' Needs review) in another order.
  const ids = rows.map((_, i) => `p${i}`);
  if (order === "reversed") ids.reverse();
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
  let place = null;
  const view = component(() => {
    place = usePlPlace({
      controls,
      page: "people",
      view: "all",
      ids,
      noun: "client",
      landed: true,
      selectionOf: "all",
    });
  });
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
  /** A row tapped: it takes focus, and so the cursor (the table's onFocus), as the person's page is about to open. */
  const press = (i) => {
    rows[i].focus();
    place.setCursor(`p${i}`);
    draw(false);
  };
  /** J or the down arrow: the cursor a row on, from the row that has focus. */
  const nextRow = () => {
    place.setCursor((c) => ids[ids.indexOf(c) + 1]);
    draw(false);
  };
  return { draw, awayAndBack, saved, rowAtTop, press, nextRow, rows };
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

test("Back from a row low on the screen scrolls nothing: the cursor the scope had is no move as it is shown again", async () => {
  const p = people();
  p.draw(false);
  p.draw(false);
  p.rowAtTop();
  // The seventh row, whole on the screen but in the tab bar's room at its foot (700 to 780 of 800, the room from 720).
  p.press(6);
  assert.equal(win.scrollY, 0, "a row tapped is where the finger is: nothing is brought into view");
  p.draw(true);
  globalThis.document.activeElement = null;
  p.draw(false);
  assert.equal(win.scrollY, 0, "the list stands where it stood: the scope's cursor, shown again, scrolled it 60px on");
  assert.equal(p.rows[6].getBoundingClientRect().top, 700);
});

/** A place a tab kept for People's list, as one did before: `top` scrolled, nothing typed, no cursor. */
const keep = (top) =>
  store.set("chanlytics.place.v1", JSON.stringify({ "acme|people|all": { q: "", cursor: null, top } }));

test("a scroll that never reached the rows is kept as the list's top", async () => {
  // Ruben, 22 Oct 2026: People, Leads and the Pipeline came back a little down after a refresh or a trip, their controls
  // and search under the frame's top. The place kept any settled scroll, and a thumb's short swipe or a landing a line in
  // the top pushed down left the list 40px down: every arrival and refresh after put it back so.
  const p = people();
  p.draw(false);
  p.draw(false);
  scrollEvent(300);
  await wait(400);
  assert.equal(p.saved()?.top, 300, "into the rows: kept as it was");
  // The first row begins 80px under the top's end (220 down the page, under a 140px top).
  scrollEvent(40);
  await wait(400);
  assert.equal(p.saved(), undefined, "short of the rows: the list's top, which is no place to keep");
});

test("where the rows begin is the first row drawn, whatever order the view keeps its rows in (a list in groups)", async () => {
  // Leads' Needs review draws its rows in groups, and hands the place its rows in their own order: the first of those
  // stood a group down, and a scroll well into the first group was taken for one short of the rows.
  const p = people({ order: "reversed" });
  p.draw(false);
  p.draw(false);
  scrollEvent(700);
  await wait(400);
  assert.equal(p.saved()?.top, 700);
});

test("a scroll a tab kept short of the rows is put back as the list's top, and one into them as it was", () => {
  const p = people();
  keep(40);
  p.draw(false);
  assert.equal(win.scrollY, 0, "the controls and the search in view");
  const again = people();
  keep(300);
  again.draw(false);
  assert.equal(win.scrollY, 300);
});

test("Back from a person the address opened puts the list's own place back, short of the rows as its top", () => {
  // Nothing held the list (the person was open from the first draw): the hold puts it at its top, and the place, kept by
  // the tab, is put back after, as on any arrival.
  const deep = people();
  keep(900);
  deep.draw(true);
  win.scrollY = 600; // read down the person's page
  deep.draw(false);
  assert.equal(win.scrollY, 900, "the place the tab kept");
  const short = people();
  keep(40);
  short.draw(true);
  win.scrollY = 600;
  short.draw(false);
  assert.equal(win.scrollY, 0, "the list's top");
});

test("Back from a person opened from a list scrolled short of its rows lands at its top, as a refresh does", async () => {
  const p = people();
  p.draw(false);
  p.draw(false);
  scrollEvent(40); // a thumb's short swipe, which tucked Safari's toolbar
  await wait(400);
  p.rowAtTop();
  p.draw(true);
  p.draw(false);
  assert.equal(win.scrollY, 0, "its controls and search in view");
});

test("a scroll the page made for itself (a sheet's lift) is not kept as the list's place: where the reader left it is", async () => {
  const p = people();
  p.draw(false);
  p.draw(false);
  scrollEvent(500);
  await wait(400);
  // A sheet lifts its row above it, from where the reader had left the list.
  let stands = true;
  scrollMade(
    html,
    500,
    () => stands,
    () => {},
  );
  scrollEvent(792);
  await wait(400);
  assert.equal(p.saved()?.top, 500, "the reader's place, not the lift");
  // The lift given back: what is heard is the reader's again.
  scrollGivenBack(html);
  scrollEvent(800);
  await wait(400);
  assert.equal(p.saved()?.top, 800);
  // A lift whose sheet went without giving it back stands no more: it is let go of.
  scrollMade(
    html,
    500,
    () => stands,
    () => {},
  );
  stands = false;
  scrollEvent(900);
  await wait(400);
  assert.equal(p.saved()?.top, 900);
});

test("a place put back under a scroll the page made (a sheet its address opened) is the reader's, and the scroll is made again from it", () => {
  const p = people();
  keep(300);
  // The sheet lifted its row before the place came back.
  const made = [];
  scrollMade(
    html,
    0,
    () => true,
    () => made.push(win.scrollY),
  );
  p.draw(false);
  assert.equal(win.scrollY, 300, "the place the tab kept");
  assert.deepEqual(made, [300], "the lift made again from it");
  assert.equal(readersScroll(html, 999), 300, "and that is the reader's place under it");
  scrollGivenBack(html);
});

test("a cursor moved by a key still brings its row into view, clear of the tab bar's room", () => {
  const p = people();
  p.draw(false);
  p.draw(false);
  p.press(6);
  p.nextRow();
  assert.equal(win.scrollY, 140, "the eighth row's foot stands at the room's edge, 720");
});
