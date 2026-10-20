/**
 * Back to your place (apps/dashboard/src/surfaces/kit/motion/held-list.ts): open a row of a list, come back by any Back, and
 * the list is where you left it, the row you were on where it stood (Ruben, 20 Oct 2026, "as iMessage does").
 *
 * On a phone the window scrolls the list, and the row's page took the window: an open thread held the page to one screen,
 * so the window's scroll fell to the top and nothing put it back; a person's page took People down and built it again. The
 * hold takes the list's place in the draw that opens the row's page, holds the list where it stood out of sight, and puts
 * it back in the draw that ends it.
 *
 * Run against the hook itself, drawn by hand, on a window, a list and its rows that answer what it asks of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fromDashboard = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../../apps/dashboard/src/legacy-bridge/_.js"),
);

/* ------------------------------ what stands in for a browser ------------------------------ */

/** A style the hold writes to and clears. */
const styleOf = () => {
  const style = {
    removeProperty(name) {
      delete style[name];
    },
  };
  return style;
};

/** An element: where it stands in the page (`at`, its top in the document, moved by the window's scroll), its height. */
const element = (name, { at = 0, height = 60, left = 0, width = 375, css = {} } = {}) => {
  const el = {
    name,
    at,
    height,
    css: { overflowY: "visible", scrollPaddingTop: "0px", ...css },
    style: styleOf(),
    dataset: {},
    children: [],
    parentElement: null,
    isConnected: true,
    shown: true,
    scrollTop: 0,
    scrollHeight: height,
    clientHeight: height,
    get firstElementChild() {
      return this.children[0] ?? null;
    },
    getClientRects() {
      return this.shown && this.isConnected ? [{}] : [];
    },
    getBoundingClientRect() {
      const box = this.box?.();
      const top = box ? box.top : this.at - win.scrollY - (this.inside?.scrollTop ?? 0);
      return { top, bottom: top + this.height, left, width, height: this.height };
    },
    closest(sel) {
      const is = (n, s) => {
        const data = /^\[data-([a-z-]+)\]$/.exec(s);
        return data ? n.dataset[data[1].replace(/-(.)/g, (_, c) => c.toUpperCase())] !== undefined : n.name === s;
      };
      for (let n = this; n; n = n.parentElement) if (sel.split(",").some((s) => is(n, s.trim()))) return n;
      return null;
    },
    querySelector: () => null,
    contains(other) {
      for (let n = other; n; n = n.parentElement) if (n === this) return true;
      return false;
    },
    after(node) {
      this.parentElement.children.push(node);
      node.parentElement = this.parentElement;
      node.isConnected = true;
    },
    remove() {
      this.isConnected = false;
    },
    cloneNode() {
      const copy = element(`${this.name} copy`, { at, height, left, width });
      copy.querySelectorAll = () => [];
      copy.removeAttribute = () => {};
      copy.setAttribute = (k, v) => (copy[`@${k}`] = v);
      return copy;
    },
    querySelectorAll: () => [],
  };
  return el;
};

const put = (parent, child) => {
  parent.children.push(child);
  child.parentElement = parent;
  return child;
};

const calls = [];
const idle = [];
/** What the window was asked to run later, and what it hears, by kind. */
const timers = [];
const heard = new Map();
/** The window hears `kind` (a touch, a key), as a browser tells every listener. */
const fire = (kind) => [...(heard.get(kind) ?? [])].forEach((fn) => fn({ type: kind }));
/** Each ResizeObserver made, with the boxes it watches; `sized(box)` is the browser telling them that box was laid out. */
const observers = new Set();
globalThis.ResizeObserver = class {
  constructor(fn) {
    this.fn = fn;
    this.boxes = new Set();
    observers.add(this);
  }
  observe(box) {
    this.boxes.add(box);
  }
  disconnect() {
    this.boxes.clear();
    observers.delete(this);
  }
};
const sized = (box) => [...observers].filter((o) => o.boxes.has(box)).forEach((o) => o.fn([]));
const html = element("html", { height: 4000 });
// The document's own marks (data-carrying) and the frame's top's height (--frame-top), as the hold writes them.
html.attrs = new Set();
html.toggleAttribute = (name, on) => (on ? html.attrs.add(name) : html.attrs.delete(name));
html.removeAttribute = (name) => html.attrs.delete(name);
html.style.setProperty = (name, value) => (html.style[name] = value);
/** The frame's chrome over every page (data-chrome), and its places by id (frame-head.tsx), where a case draws them. */
const frame = { chrome: [], ids: {} };
const body = put(html, element("body", { height: 4000 }));
const win = {
  innerHeight: 800,
  scrollY: 0,
  coarse: true,
  matchMedia: (q) => ({ matches: q.includes("coarse") ? win.coarse : false }),
  getComputedStyle: (el) => el.css,
  scrollTo(x, y) {
    calls.push(["to", y]);
    win.scrollY = y;
  },
  scrollBy(x, y) {
    calls.push(["by", y]);
    win.scrollY += y;
  },
  requestIdleCallback: (fn) => idle.push(fn),
  cancelIdleCallback() {},
  setTimeout: (fn) => timers.push(fn),
  clearTimeout(id) {
    timers[id - 1] = null;
  },
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
  querySelectorAll: (sel) => (sel === "[data-chrome]" ? frame.chrome : []),
  getElementById: (id) => frame.ids[id] ?? null,
};
Object.defineProperty(html, "scrollTop", {
  get: () => win.scrollY,
  set: (v) => {
    win.scrollY = v;
  },
});

/* ------------------------------ the hook, drawn by hand ------------------------------ */

const react = fromDashboard("react");
const { useHeldList, heldUnder, heldAlong, showHeld, heldPutBack, cameBack } = fromDashboard(
  "../surfaces/kit/motion/held-list.ts",
);
const { crumbsShown, stripShown, useCrumbsShown, useHeadUnder } = fromDashboard("../surfaces/kit/head/standing.ts");
const { watchFrameTop } = fromDashboard("../surfaces/kit/head/frame-top.ts");
const { useRowsArrive } = fromDashboard("../surfaces/kit/motion/use-rows-arrive.ts");
// The head's store read as a draw would read it.
react.useSyncExternalStore = (subscribe, now) => now();

/**
 * One page drawing the hook: its refs kept between draws, in the order it asks for them, and its layout effects run after
 * each draw whose inputs changed, as React runs them before the paint; `changes` is what React does to the page in
 * between (it hides a scope under Activity); `leave` runs their clean-ups.
 */
const page = (list) => {
  const refs = [];
  const effects = [];
  const draw = (held, changes = () => {}) => {
    let r = 0;
    let e = 0;
    react.useRef = (v) => ((refs[r] ??= { current: v }), refs[r++]);
    react.useLayoutEffect = (fn, deps) => {
      const at = e++;
      const was = effects[at];
      if (was && deps && was.deps && deps.every((d, i) => Object.is(d, was.deps[i]))) return;
      effects[at] = { fn, deps, cleanup: was?.cleanup, due: true };
    };
    useHeldList(held, () => list);
    changes();
    for (const ef of effects) {
      if (!ef.due) continue;
      ef.due = false;
      if (typeof ef.cleanup === "function") ef.cleanup();
      ef.cleanup = ef.fn();
    }
  };
  const leave = () => effects.forEach((ef) => typeof ef.cleanup === "function" && ef.cleanup());
  return { draw, leave };
};

/**
 * A phone's Inbox: the frame's top 140px tall over a list of 30 rows, 80px each, the list starting 220px down the page;
 * scrolled to `scrolled`, with the row at the top of what shows found where the list asks.
 */
const inbox = ({ scrolled = 1500 } = {}) => {
  html.css.scrollPaddingTop = "140px";
  const main = put(body, element("main", { height: 3000 }));
  const list = put(main, element("list", { at: 220, height: 2400 }));
  const rows = Array.from({ length: 30 }, (_, i) => put(list, element("option", { at: 220 + 80 * i, height: 80 })));
  fire("pointerdown");
  win.scrollY = scrolled;
  // The row under the frame's top, as the screen shows it now.
  globalThis.document.at = rows.find((r) => r.getBoundingClientRect().bottom > 141) ?? null;
  calls.length = 0;
  idle.length = 0;
  return { main, list, rows };
};

/* ------------------------------------------ cases ------------------------------------------ */

test("a row opened from a list scrolled down: the list is held where it stood, out of sight, and the row's page starts at the top", () => {
  const { list, rows } = inbox();
  const p = page(list);
  p.draw(false);
  p.draw(true);
  assert.equal(list.dataset.held, "", "held");
  assert.equal(list.style.top, `${220 - 1500}px`, "fixed where it stood on the screen");
  assert.equal(list.style.width, "375px");
  assert.equal(list.style.height, "2400px");
  assert.deepEqual(calls, [["to", 0]], "the row's page has the window, from its top");
  assert.deepEqual(heldUnder(), [list], "what stands for it under a thumb is the list itself");
  showHeld(true);
  assert.equal(list.dataset.held, "shown", "a thumb carrying the page away shows it");
  assert.ok(html.attrs.has("data-carrying"), "and the document says so: the frame lets go of none of its chrome");
  showHeld(false);
  assert.equal(list.dataset.held, "");
  assert.ok(!html.attrs.has("data-carrying"));
  assert.ok(rows[17].isConnected);
  p.leave();
});

test("as the row's page goes, by any Back, the list is put back with the row you were on where it stood, before the paint", () => {
  const { list, rows } = inbox();
  const p = page(list);
  p.draw(false);
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  p.draw(true);
  // The thread held the page to one screen: the window's scroll fell to the top.
  win.scrollY = 0;
  calls.length = 0;
  p.draw(false);
  assert.equal(list.dataset.held, undefined, "let go");
  assert.equal(list.style.top, undefined, "with no style of its own left");
  assert.equal(row.getBoundingClientRect().top, was, "the row stands where it stood");
  assert.equal(win.scrollY, 1500);
  assert.equal(heldPutBack(rows[3]), true, "the page that keeps its own place is told, once");
  assert.equal(heldPutBack(rows[3]), false);
  p.leave();
});

test("a row added above while you were away moves nothing you see: the row you were on is put back where it stood", () => {
  const { list, rows } = inbox();
  const p = page(list);
  p.draw(false);
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  p.draw(true);
  win.scrollY = 0;
  for (const r of rows) r.at += 80; // a new conversation at the top
  p.draw(false);
  assert.equal(row.getBoundingClientRect().top, was);
  assert.equal(win.scrollY, 1580, "the window moved by the row added, so the list did not");
  p.leave();
});

test("with the row gone (archived, answered elsewhere), the scroll is put back as it was", () => {
  const { list } = inbox();
  const p = page(list);
  p.draw(false);
  const row = globalThis.document.at;
  p.draw(true);
  win.scrollY = 0;
  row.isConnected = false;
  calls.length = 0;
  p.draw(false);
  assert.deepEqual(calls, [["to", 1500]]);
  p.leave();
});

test("a row's page opened from elsewhere (the bell, a link) holds nothing and puts nothing back", () => {
  const { list } = inbox();
  const p = page(list);
  p.draw(true);
  assert.equal(list.dataset.held, undefined);
  win.scrollY = 0;
  calls.length = 0;
  p.draw(false);
  assert.deepEqual(calls, []);
  p.leave();
});

test("a page left while a row is open lets its list go as it is, and puts nothing back", () => {
  const { list } = inbox();
  const p = page(list);
  p.draw(false);
  p.draw(true);
  calls.length = 0;
  p.leave();
  assert.equal(list.dataset.held, undefined);
  assert.equal(list.style.top, undefined);
  assert.deepEqual(calls, []);
  assert.deepEqual(heldUnder(), []);
});

test("a list its page keeps out of the document (People's tabs) is stood in for by a picture, made when idle, on a touch screen", () => {
  const { list } = inbox();
  const p = page(list);
  p.draw(false);
  // People's scope, hidden by React's Activity in the draw that opens the person.
  p.draw(true, () => (list.shown = false));
  assert.equal(list.dataset.held, "", "held, so its rows and its place hear nothing of the window");
  assert.equal(list.style.top, undefined, "nothing to place: it is out of the document");
  assert.deepEqual(heldUnder(), [], "no picture yet");
  assert.equal(idle.length, 1, "made when the phone is idle");
  idle.shift()();
  const [copy] = heldUnder();
  assert.ok(copy && copy !== list, "the picture");
  assert.equal(copy.dataset.held, "");
  assert.equal(copy.style.top, `${220 - 1500}px`, "where the list stood");
  assert.equal(copy["@inert"], "", "inert, and hidden from a screen reader");
  assert.equal(copy["@aria-hidden"], "true");
  showHeld(true);
  assert.equal(copy.dataset.held, "shown");
  // The person goes: People's scope is shown again, then put back.
  list.shown = true;
  win.scrollY = 600; // where the person's page was scrolled
  p.draw(false);
  assert.equal(copy.isConnected, false, "the picture goes");
  assert.equal(win.scrollY, 1500, "and the list is where it was");
  p.leave();
});

test("no picture where no thumb can carry the row's page away (a desk)", () => {
  const { list } = inbox();
  win.coarse = false;
  const p = page(list);
  p.draw(false);
  p.draw(true, () => (list.shown = false));
  assert.equal(idle.length, 0);
  win.coarse = true;
  list.shown = true;
  p.draw(false);
  p.leave();
});

test("on a desk the box that scrolls the list is put back, never the window", () => {
  html.css.scrollPaddingTop = "0px";
  const main = put(body, element("main", { height: 900 }));
  const list = put(main, element("list", { at: 0, height: 900 }));
  const box = put(list, element("table-box", { at: 100, height: 700, css: { overflowY: "auto" } }));
  box.scrollHeight = 2400;
  box.box = () => ({ top: 100 });
  const rows = Array.from({ length: 30 }, (_, i) => {
    const r = put(box, element("tr", { at: 100 + 80 * i, height: 80 }));
    r.box = () => ({ top: r.at - box.scrollTop });
    return r;
  });
  win.scrollY = 0;
  box.scrollTop = 960;
  globalThis.document.at = rows.find((r) => r.getBoundingClientRect().bottom > 101);
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  calls.length = 0;
  const p = page(list);
  p.draw(false);
  p.draw(true);
  assert.deepEqual(calls, [], "the window is left alone");
  box.scrollTop = 0; // a box hidden with its page forgets where it was scrolled
  p.draw(false);
  assert.equal(row.getBoundingClientRect().top, was);
  assert.equal(box.scrollTop, 960);
  assert.deepEqual(calls, []);
  p.leave();
});

test("under a row's page carried away lies the whole screen it goes back to: the list, and the frame's chrome over it as it stood", () => {
  // Ruben, 20 Oct 2026: the head, the strip of views and the tab bar came in at once as the Back landed. They are drawn
  // under the page as the thumb carries it, as the list had them when the row opened: the head and the strip as they
  // stood then (a person's page has none of its own), the frame's top, the tab bar and Ask's circle with the list.
  const { list } = inbox();
  const top = element("frame-top", { at: 0, height: 134 });
  const bar = element("tab-bar", { at: 768, height: 62 });
  const hidden = element("phone-ask");
  hidden.shown = false;
  frame.chrome = [top, bar, hidden];
  crumbsShown(["Inbox"]);
  stripShown({ page: "inbox", param: null, views: null });
  const p = page(list);
  p.draw(false);
  p.draw(true);
  // The row's page is drawn: its own crumbs, and no strip of its own.
  crumbsShown(["Inbox", "Ravi Menon"]);
  stripShown(null);
  assert.equal(useHeadUnder(), null, "while the row's page stands, the head is its own");
  showHeld(true);
  assert.deepEqual(heldUnder(), [list, top, bar], "the list, then what of the frame's chrome is drawn");
  assert.deepEqual(useCrumbsShown(), ["Inbox"], "the head says what it said over the list");
  assert.deepEqual(useHeadUnder().strip, { page: "inbox", param: null, views: null }, "and its strip is the list's");
  showHeld(false);
  assert.equal(useHeadUnder(), null, "settled back: the head is the page's own again");
  assert.deepEqual(useCrumbsShown(), ["Inbox", "Ravi Menon"]);
  frame.chrome = [];
  p.leave();
});

test("what the row's page drew in the frame's top for itself goes with the page, a still copy where it stood", () => {
  // A person's ‹ People, and ‹ › in the bell's place, stand in the frame's top, which draws the list's date under the page
  // as it is carried: a copy of them is carried with the page instead, laid where they stood, out of the frame's top.
  const { list } = inbox();
  const column = put(body, element("frame-top", { at: 0, height: 44 }));
  column.dataset.chrome = "";
  const date = put(column, element("date-place", { at: 10, height: 32, left: 16, width: 343 }));
  date.querySelector = (sel) => (sel === ".pg-back" ? {} : null);
  date.box = () => ({ top: 10 });
  frame.ids["pg-dateline"] = date;
  const p = page(list);
  p.draw(false);
  p.draw(true);
  showHeld(true);
  const [copy] = heldAlong();
  assert.ok(copy && copy !== date, "a copy of it");
  assert.equal(copy["@inert"], "", "inert, and hidden from a screen reader");
  assert.ok(copy.parentElement === body, "out of the frame's top, beside it");
  assert.deepEqual(
    [copy.style.position, copy.style.top, copy.style.left, copy.style.width, copy.style.height],
    ["fixed", "10px", "16px", "343px", "32px"],
    "where it stood on the screen",
  );
  showHeld(false);
  assert.equal(copy.isConnected, false, "gone once the page is let go or settles back, when the frame draws it again");
  assert.deepEqual(heldAlong(), []);
  delete frame.ids["pg-dateline"];
  p.leave();
});

test("while a thumb carries the row's page, the frame's top keeps its height, so the page under the finger never moves", () => {
  // The top draws its chrome again under the page, and the page starts under the top (--frame-top): measured as it grew,
  // the page went down by all of it under the finger. Held, it is measured again once the carry is over.
  const top = element("frame-top", { height: 0 });
  top.offsetHeight = 0;
  top.hasAttribute = () => false;
  top.toggleAttribute = () => {};
  const stop = watchFrameTop(top);
  assert.equal(html.style["--frame-top"], "0px");
  const { list } = inbox();
  const p = page(list);
  p.draw(false);
  p.draw(true);
  showHeld(true);
  top.offsetHeight = 134;
  sized(top);
  assert.equal(html.style["--frame-top"], "0px", "the chrome drawn again under the page moves nothing");
  showHeld(false);
  assert.equal(html.style["--frame-top"], "134px", "measured once the carry is over");
  stop();
  p.leave();
});

test("what is drawn again over the list once the Back has landed moves nothing: the row is kept where it stood, before the paint", async () => {
  // People's name and its strip are drawn over its list after the draw that puts it back (the page says its standing as it
  // is drawn, the frame its crumbs), the column starts under the frame's top, and a count is read again: each moved the list
  // on an iPhone, which keeps no row in view as Chromium does (Ruben, 20 Oct 2026, "a layout shift on the table page when
  // swiping back"). Watched as the list and the top are sized, which is after each is laid out and before the paint.
  const top = element("frame-top", { height: 0 });
  top.offsetHeight = 100;
  top.hasAttribute = () => false;
  top.toggleAttribute = () => {};
  const stopTop = watchFrameTop(top);
  const { list, rows } = inbox();
  const p = page(list);
  p.draw(false);
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  p.draw(true);
  win.scrollY = 0;
  p.draw(false);
  assert.equal(row.getBoundingClientRect().top, was);
  assert.ok(cameBack(rows[3]), "what is drawn again as it comes back is told it came back, as often as it asks");
  assert.ok(cameBack(rows[3]));
  // The head grows by People's name: the top is sized, and the column under it starts 33px further down.
  top.offsetHeight = 133;
  for (const r of rows) r.at += 33;
  sized(top);
  assert.equal(html.style["--frame-top"], "133px");
  assert.equal(row.getBoundingClientRect().top, was, "under the head as drawn, where it stood");
  // A count above the rows read again: the list is sized.
  for (const r of rows) r.at += 4;
  sized(list);
  assert.equal(row.getBoundingClientRect().top, was, "and again");
  await Promise.resolve();
  assert.equal(cameBack(rows[3]), false, "the draw done, it is a list like any other");
  // Touched, the list is the reader's: what moves it after that is theirs to see.
  fire("pointerdown");
  for (const r of rows) r.at += 10;
  sized(list);
  assert.equal(row.getBoundingClientRect().top, was + 10, "nothing kept once the screen is touched");
  stopTop();
  p.leave();
});

test("the row is kept only for a moment, and no longer than until another row opens", () => {
  const { list, rows } = inbox();
  const p = page(list);
  p.draw(false);
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  p.draw(true);
  p.draw(false);
  assert.equal(timers.length > 0, true, "the moment is timed");
  timers.splice(0).forEach((fn) => fn && fn());
  for (const r of rows) r.at += 20;
  sized(list);
  assert.equal(row.getBoundingClientRect().top, was + 20, "the moment over, nothing is kept");
  // Put back again, then another row opened at once: the keeping of the first ends as the second is held.
  for (const r of rows) r.at -= 20;
  p.draw(true);
  p.draw(false);
  const second = page(list);
  second.draw(false);
  globalThis.document.at = rows[5];
  second.draw(true);
  const scrolled = win.scrollY;
  for (const r of rows) r.at += 50;
  sized(list);
  assert.equal(win.scrollY, scrolled, "a list held again is not scrolled by the keeping before it");
  second.leave();
  p.leave();
});

test("a list coming back from under the row it opened is where it was left: its rows do not rise in again", async () => {
  // React's Activity draws People's kept scope as a mount as the person goes, so its table rose in again, every row faded up
  // 4px under the finger's let-go (Ruben, 20 Oct 2026). A table that arrives anywhere else still rises.
  const rose = [];
  const tableIn = (parent) => {
    const table = put(parent, element("table"));
    const row = { animate: () => rose.push(table) };
    table.querySelectorAll = (sel) => (sel === ":scope > tbody > tr" ? [row] : []);
    return table;
  };
  /** The table's hook drawn on its mount, its layout effect run as React runs it. */
  const arrives = (table) => {
    let mount = null;
    react.useRef = (v) => ({ current: v });
    react.useLayoutEffect = (fn) => (mount = fn);
    useRowsArrive().current = table;
    mount();
  };
  const { list } = inbox();
  const p = page(list);
  p.draw(false);
  p.draw(true);
  const held = tableIn(list);
  arrives(held);
  assert.deepEqual(rose, [], "drawn while held, in the draw that puts it back");
  p.draw(false);
  arrives(held);
  assert.deepEqual(rose, [], "nor once it is back, in that same draw (development draws a mount twice)");
  await Promise.resolve();
  arrives(tableIn(list));
  assert.equal(rose.length, 1, "a table that arrives after, rises");
  p.leave();
});
