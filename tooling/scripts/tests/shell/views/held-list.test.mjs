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
        if (data) return n.dataset[data[1].replace(/-(.)/g, (_, c) => c.toUpperCase())] !== undefined;
        return n.name === s || s === `[role="${n.name}"]`;
      };
      for (let n = this; n; n = n.parentElement) if (sel.split(",").some((s) => is(n, s.trim()))) return n;
      return null;
    },
    querySelector: () => null,
    attrs: new Set(),
    setAttribute(name) {
      this.attrs.add(name);
    },
    removeAttribute(name) {
      this.attrs.delete(name);
    },
    hasAttribute(name) {
      return this.attrs.has(name);
    },
    toggleAttribute(name, on) {
      if (on) this.attrs.add(name);
      else this.attrs.delete(name);
    },
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
body.append = (node) => put(body, node);
const win = {
  innerHeight: 800,
  scrollY: 0,
  coarse: true,
  reduced: false,
  matchMedia: (q) => ({ matches: q.includes("coarse") ? win.coarse : q.includes("reduce") ? win.reduced : false }),
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
  createElement: (tag) => element(tag),
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
const { useHeldList, heldUnder, heldAlong, showHeld, heldPutBack, cameBack, carriedOver, pushesOver } = fromDashboard(
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
 * between (it hides a scope under Activity); `leave` runs their clean-ups. A draw answers what the hook answered, and
 * `arrival` is how the row's page comes in over the list, where the page says.
 */
const page = (list, arrival) => {
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
    const opens = useHeldList(held, () => list, arrival);
    changes();
    for (const ef of effects) {
      if (!ef.due) continue;
      ef.due = false;
      if (typeof ef.cleanup === "function") ef.cleanup();
      ef.cleanup = ef.fn();
    }
    return opens;
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
  // Its rows, in the page's order, where the hold asks for them (kit/motion/page-scroll.ts ROW).
  list.querySelectorAll = (sel) => (sel.includes('[role="option"]') ? rows : []);
  fire("pointerdown");
  win.scrollY = scrolled;
  // The row under the frame's top, as the screen shows it now.
  globalThis.document.at = rows.find((r) => r.getBoundingClientRect().bottom > 141) ?? null;
  calls.length = 0;
  idle.length = 0;
  return { main, list, rows };
};

/** A desk's People: the table scrolls in a box of its own, 700px tall from 100px down, 960px through 30 rows of 80px. */
const desk = () => {
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
  calls.length = 0;
  return { list, box };
};

/** The row's page as it is drawn over the list, as wide as the phone: what a push moves. */
const rowPage = () => {
  const el = put(body, element("page"));
  el.offsetWidth = 375;
  return el;
};
/** As long as a push takes to land (kit/motion/swipe.ts PUSH), and a little more. */
const landed = () => new Promise((resolve) => setTimeout(resolve, 480));

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
  // Fixed and the screen's width while it shows, it is cut clear of the point over the window's foot Safari reads
  // (page-scroll.ts clearOfFoot): a list Safari read there kept its bar's band once back in its page.
  const bottom = Math.round(list.getBoundingClientRect().bottom);
  assert.equal(list.style.clipPath, `inset(0 0 max(0px, ${bottom}px - 100dvh + var(--foot-clear, 0px)) 0)`);
  showHeld(false);
  assert.equal(list.dataset.held, "");
  assert.equal(list.style.clipPath, "", "and whole again once the carry is over");
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

test("a row's page opened by its address (a refresh in it, the bell, a link) holds nothing, and its list lands at its top as it goes", () => {
  // Ruben, 22 Oct 2026, after #1807: Conversations still came back from a thread with its channels under the frame's top.
  // The thread's address had opened it, so nothing held the list; the thread followed its newest message down the window
  // (on an iPhone every page has the room of Safari's toolbar to scroll), and its own Back closed it where it stood.
  // The thread takes the screen: the frame's top draws nothing over it.
  const top = element("frame-top", { height: 0 });
  top.offsetHeight = 0;
  top.hasAttribute = () => false;
  top.toggleAttribute = () => {};
  const stopTop = watchFrameTop(top);
  const { list } = inbox();
  const p = page(list);
  p.draw(true);
  assert.equal(list.dataset.held, undefined, "nothing held: the list was never on the screen");
  win.scrollY = 40; // the thread at its newest message: the window's foot
  calls.length = 0;
  // Its own Back: the top is drawn again over the list, before its observer says so.
  top.offsetHeight = 134;
  p.draw(false);
  assert.deepEqual(calls, [["to", 0]], "the list at its top, before the paint");
  assert.equal(html.style["--frame-top"], "134px", "under the top as it will be painted");
  assert.equal(heldPutBack(list), false, "nothing put back: a page that keeps its own place puts it back after");
  stopTop();
  p.leave();
});

test("a list nothing held at its top already is not scrolled, and on a desk its own box is left as it was", () => {
  const phone = inbox({ scrolled: 0 });
  const p = page(phone.list);
  p.draw(true);
  p.draw(false);
  assert.deepEqual(calls, [], "nothing to move");
  p.leave();
  const { list, box } = desk();
  const d = page(list);
  d.draw(true);
  d.draw(false);
  assert.equal(box.scrollTop, 960, "the table's box keeps its scroll");
  assert.deepEqual(calls, [], "and the window is left alone");
  d.leave();
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
  const { list, box } = desk();
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
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
  const [ground, copy] = heldAlong();
  assert.equal(
    ground.className,
    "carry-ground",
    "the sheet of ground the page slides over goes first (components.css)",
  );
  assert.ok(
    ground.parentElement === body && ground.hasAttribute("aria-hidden"),
    "on the body, hidden from a screen reader",
  );
  assert.ok(copy && copy !== date, "then a copy of what it drew there");
  assert.equal(copy["@inert"], "", "inert, and hidden from a screen reader");
  assert.ok(copy.parentElement === body, "out of the frame's top, beside it");
  assert.deepEqual(
    [copy.style.position, copy.style.top, copy.style.left, copy.style.width, copy.style.height],
    ["fixed", "10px", "16px", "343px", "32px"],
    "where it stood on the screen",
  );
  showHeld(false);
  assert.equal(copy.isConnected, false, "gone once the page is let go or settles back, when the frame draws it again");
  assert.equal(ground.isConnected, false, "the sheet too");
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

test("the list under a carried page is cut where the frame's top drawn over it ends: its head never reads through the dimmed top", () => {
  // What of the list stood under the frame's top was hidden by the top's ground; under a page carried away both are dimmed,
  // and Campaigns' search and first row read through its name and strip (22 Oct 2026).
  const top = element("frame-top", { height: 134 });
  top.box = () => ({ top: 0 });
  top.offsetHeight = 134;
  top.hasAttribute = () => false;
  top.toggleAttribute = () => {};
  const stop = watchFrameTop(top);
  const { list } = inbox();
  const p = page(list);
  p.draw(false);
  p.draw(true);
  // Held, it is fixed where it stood on the screen: scrolled 1,500 down, its head far above the top's foot.
  list.box = () => ({ top: Number.parseFloat(list.style.top) });
  showHeld(true);
  const box = list.getBoundingClientRect();
  assert.equal(box.top, 220 - 1500);
  assert.equal(
    list.style.clipPath,
    `inset(${134 - box.top}px 0 max(0px, ${Math.round(box.bottom)}px - 100dvh + var(--foot-clear, 0px)) 0)`,
    "cut from the top's foot, in the list's own box, and clear of the window's foot as before",
  );
  showHeld(false);
  assert.equal(list.style.clipPath, "", "whole again once the carry is over");
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

test("the row a page is opened from is lit as it opens, before a picture is made of the list, and after, until a touch", () => {
  // Under a person carried back to People lay a picture of the list, which has no :hover of its own: the row the finger
  // had opened lit only as the person went (Ruben, 20 Oct 2026, "highlight the selected row before swiping back").
  const { list, rows } = inbox();
  const opened = rows[18];
  const name = put(opened, element("name"));
  // What a tap leaves under :hover: the row and the words in it, the deepest last.
  list.querySelectorAll = (sel) => (sel === ":hover" ? [opened, name] : []);
  const p = page(list);
  p.draw(false);
  p.draw(true);
  assert.ok(opened.hasAttribute("data-hover"), "lit as its page opens, so a picture made after carries it");
  assert.equal(rows[17].hasAttribute("data-hover"), false, "and no other row");
  p.draw(false);
  assert.ok(opened.hasAttribute("data-hover"), "still lit once the list is back, as the finger's last tap leaves it");
  fire("pointerdown");
  assert.equal(opened.hasAttribute("data-hover"), false, "the next touch lets it go");
  // A page left with its row open lets go of the row too; one opened from elsewhere lights nothing.
  p.draw(true);
  assert.ok(opened.hasAttribute("data-hover"));
  p.leave();
  assert.equal(opened.hasAttribute("data-hover"), false, "a page left lets go of its row");
  list.querySelectorAll = () => [];
  const elsewhere = page(list);
  elsewhere.draw(false);
  elsewhere.draw(true);
  assert.equal(
    rows.some((r) => r.hasAttribute("data-hover")),
    false,
    "nothing under the finger in the list: nothing lit",
  );
  elsewhere.leave();
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
  /** The table's hook drawn on its mount, its ref given the table as React gives it. */
  const arrives = (table) => {
    react.useRef = (v) => ({ current: v });
    react.useCallback = (fn) => fn;
    useRowsArrive()(table);
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

test("on a phone the row's page is pushed in over the list it was opened from, once React is done with the draw", async () => {
  // Ruben, 20 Oct 2026: "make it motion transition to the page cleanly like iphone imessage". The page is marked as it is
  // drawn, so no entrance of its own plays (a thread's, a person's), and moved in from the screen's right edge after the
  // draw (kit/motion/swipe.ts pushIn), over the screen a thumb carrying it back would uncover.
  const { list } = inbox();
  const el = rowPage();
  const p = page(list, { page: () => el, going: carriedOver });
  assert.equal(p.draw(false), false);
  assert.equal(p.draw(true), true, "this draw opens the row's page over the list");
  assert.ok(el.hasAttribute("data-pushed"), "marked before the paint");
  assert.equal(el.style.transform, undefined, "not moved inside React's draw");
  await Promise.resolve();
  assert.equal(el.style.transform, "translate3d(0, 0, 0)", "on its way in from the far side");
  assert.match(el.style.transition, /^transform 420ms /);
  assert.ok(el.hasAttribute("data-going"), "carried over the list, as a thumb carries it");
  assert.equal(list.dataset.held, "shown", "the list shows under it");
  assert.ok(html.attrs.has("data-carrying"), "with the frame's chrome over it");
  assert.equal(list.style.translate, "-112px 0", "going under, to the left");
  assert.equal(heldAlong()[0].className, "carry-ground", "the sheet of ground it slides over comes in with it");
  // The page itself wears nothing of the ground: the sheet is the ground, laid where the window's is (components.css).
  assert.equal(el.style["--going-at"], undefined, "no measure of the page is written to it");
  assert.equal(p.draw(true), false, "a draw after it opens nothing");
  await landed();
  assert.equal(el.hasAttribute("data-going"), false, "landed");
  assert.equal(list.dataset.held, "", "the list out of sight again");
  assert.ok(!html.attrs.has("data-carrying"));
  assert.deepEqual(heldAlong(), [], "the sheet gone");
  assert.deepEqual([el.style.transform, list.style.translate], ["", ""], "nothing left on either");
  assert.ok(el.hasAttribute("data-pushed"), "still marked while it stands over the list");
  p.draw(false);
  assert.equal(el.hasAttribute("data-pushed"), false, "let go of with the list");
  p.leave();
});

test("a list its page keeps out of the document is pictured at once when the row's page is pushed in over it", async () => {
  const { list } = inbox();
  const el = rowPage();
  const p = page(list, { page: () => el, going: carriedOver });
  p.draw(false);
  p.draw(true, () => (list.shown = false));
  assert.equal(idle.length, 0, "not left until the phone is idle: the push uncovers it now");
  const [copy] = heldUnder();
  assert.ok(copy && copy !== list, "the picture, to come in over");
  await Promise.resolve();
  assert.equal(copy.dataset.held, "shown");
  await landed();
  assert.equal(copy.dataset.held, "");
  list.shown = true;
  p.draw(false);
  assert.equal(copy.isConnected, false);
  p.leave();
});

test("no push where the list has a box of its own (a desk), under reduced motion, or for a row's page opened elsewhere", async () => {
  const el = rowPage();
  const arrival = { page: () => el, going: carriedOver };
  const untouched = () => !el.hasAttribute("data-pushed") && el.style.transform === undefined;
  // A desk: the table scrolls in its own box, and a person's page fades in over it (clients.css, data-over).
  const atDesk = page(desk().list, arrival);
  atDesk.draw(false);
  assert.equal(atDesk.draw(true), true, "opened over the list all the same");
  assert.ok(untouched(), "nothing pushed on a desk");
  atDesk.draw(false);
  atDesk.leave();
  const { list } = inbox();
  win.reduced = true;
  try {
    const still = page(list, arrival);
    still.draw(false);
    still.draw(true);
    assert.ok(untouched(), "under reduced motion the page is simply there");
    still.draw(false);
    still.leave();
  } finally {
    win.reduced = false;
  }
  const elsewhere = page(list, arrival);
  assert.equal(elsewhere.draw(true), false, "opened from the bell or a link: over no list");
  elsewhere.leave();
  await Promise.resolve();
  assert.ok(untouched(), "and nothing moves it after");
});

test("a press may wait for the row's page only where it would be pushed in: the window scrolls the list, motion not reduced", () => {
  // People's press waits for a person not read yet, so the page the push takes is theirs (people-route.tsx openPerson): by
  // the hold's own reading of the list, so it never waits where nothing is pushed.
  const { list } = inbox();
  assert.equal(pushesOver(list), true, "a phone: the window scrolls the list");
  win.reduced = true;
  try {
    assert.equal(pushesOver(list), false, "reduced motion: the page is simply there");
  } finally {
    win.reduced = false;
  }
  list.shown = false;
  assert.equal(pushesOver(list), false, "a list not on the screen");
  assert.equal(pushesOver(null), false);
  assert.equal(pushesOver(desk().list), false, "a desk: the table scrolls in a box of its own");
});

test("a list put back where the window scrolls it comes back hidden under a picture of it, which gives way once drawn", () => {
  // The window jumps as the list comes back, and an iPhone draws the window's new place a frame after the jump: the list
  // stood blank for that frame under the frame's head, strip and tab bar (Ruben, 20 Oct 2026). The picture is fixed to the
  // screen, so it is drawn wherever the window is; the two change places after the screen has drawn the list twice.
  const frames = [];
  win.requestAnimationFrame = (fn) => frames.push(fn);
  try {
    const { list } = inbox();
    const p = page(list);
    p.draw(false);
    p.draw(true);
    win.scrollY = 0;
    p.draw(false);
    const cover = list.parentElement.children.find((c) => c !== list && c.dataset.held === "shown");
    assert.ok(cover, "a picture of the list, shown");
    assert.equal(cover["@inert"], "", "a still copy: inert");
    assert.equal(cover.style.top, `${220 - 1500}px`, "where the list stood");
    assert.equal(list.style.visibility, "hidden", "the list back in its place under it, hidden");
    assert.equal(list.dataset.held, undefined, "and let go");
    frames.shift()();
    assert.ok(cover.isConnected, "kept for the frame the jump is drawn in");
    frames.shift()();
    assert.equal(cover.isConnected, false, "then gone");
    assert.equal(list.style.visibility, undefined, "and the list shown");
    // People's list, kept out of the document under the person: its picture is the one it lands under.
    p.draw(true, () => (list.shown = false));
    idle.shift()();
    const [picture] = heldUnder();
    list.shown = true;
    p.draw(false);
    assert.ok(
      picture.isConnected && picture.dataset.held === "shown",
      "the picture that stood in for it stays over it",
    );
    frames.splice(0).forEach((fn) => fn());
    frames.splice(0).forEach((fn) => fn());
    assert.equal(picture.isConnected, false);
    p.leave();
    // A desk's list is put back in its own box, which does not jump: no picture over it.
    const atDesk = desk();
    const d = page(atDesk.list);
    d.draw(false);
    d.draw(true);
    d.draw(false);
    assert.equal(atDesk.list.style.visibility, undefined, "a desk's list is simply back");
    d.leave();
  } finally {
    delete win.requestAnimationFrame;
  }
});

test("a list left at its top lands at its top: the frame's top grown by a line while away is drawn in its room, the list's head in view", () => {
  // Ruben, 22 Oct 2026: Conversations came back from a thread with its channels under the frame's top, and stayed so. A
  // line had joined the top while the thread stood (a newer version ready, after the day's deploys): held to the row you
  // were on, the list was scrolled by the line's height to keep that row still, and its own head went under the top.
  const top = element("frame-top", { height: 0 });
  top.offsetHeight = 134;
  top.hasAttribute = () => false;
  top.toggleAttribute = () => {};
  const stopTop = watchFrameTop(top);
  const { list, rows } = inbox({ scrolled: 0 });
  const p = page(list);
  p.draw(false);
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  p.draw(true);
  // While away the top grows by 40px, and the column under it starts that much further down.
  top.offsetHeight = 174;
  for (const r of rows) r.at += 40;
  calls.length = 0;
  p.draw(false);
  assert.equal(html.style["--frame-top"], "174px", "the top as it will be painted");
  assert.equal(win.scrollY, 0, "the list at its top, its head in view under the taller top");
  assert.equal(
    row.getBoundingClientRect().top,
    was + 40,
    "the row you were on stands under the line, not held over it",
  );
  stopTop();
  p.leave();
});

test("a list left at its top lands at its top: a row added above while away shows at the top, the rows under it a row lower", () => {
  const { list, rows } = inbox({ scrolled: 0 });
  const p = page(list);
  p.draw(false);
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  p.draw(true);
  for (const r of rows) r.at += 80; // a new conversation at the top
  p.draw(false);
  assert.equal(win.scrollY, 0);
  assert.equal(row.getBoundingClientRect().top, was + 80, "a row lower, with the new one in view above it");
  p.leave();
});
/**
 * The frame's top, watched as the shell watches it (kit/head/frame-top.ts), `height` tall; answers how to stop. While it
 * is watched, the view's top under it, the root's scroll padding, is read from the top's measured height as mobile.css
 * reads it (--frame-top-at, 6px here, + --frame-top): a measure taken late is read late.
 */
const frameTopOf = (height) => {
  const top = element("frame-top", { height: 0 });
  top.offsetHeight = height;
  top.hasAttribute = () => false;
  top.toggleAttribute = () => {};
  Object.defineProperty(html.css, "scrollPaddingTop", {
    configurable: true,
    enumerable: true,
    get: () => `${(Number.parseFloat(html.style["--frame-top"]) || 0) + 6}px`,
    set: () => {},
  });
  const stopTop = watchFrameTop(top);
  const stop = () => {
    stopTop();
    Object.defineProperty(html.css, "scrollPaddingTop", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: "140px",
    });
  };
  return { top, stop };
};
/** The frame's top grown (or shrunk) by `by`: the column under it starts that much further down. */
const topGrows = (top, rows, by) => {
  top.offsetHeight += by;
  for (const r of rows) r.at += by;
};

test("a list left short of its rows lands at its top: its head part under the frame's top (a short swipe that tucks Safari's toolbar) comes back whole", () => {
  // The rows begin 80px down the list's scroll (220 down the page, under a 140px top). Scrolled by 40, its head stood part
  // under the top as the row opened, and Back put it back so: the channels under the top, the search right under it, as
  // a refresh never did (People's place puts such a scroll back as the top).
  const { list } = inbox({ scrolled: 40 });
  const p = page(list);
  p.draw(false);
  p.draw(true);
  calls.length = 0;
  p.draw(false);
  assert.equal(win.scrollY, 0, "at its top, its head in view");
  p.leave();
});

test("a list scrolled into its rows keeps its row as far under the frame's top as it stood: a line grown over it while away takes its own room", () => {
  // Held to its place on the screen, the row was scrolled on by the line's height: the row you were on went under the
  // line, and what stood over it went under the top.
  const { top, stop } = frameTopOf(134);
  const { list, rows } = inbox({ scrolled: 300 });
  const p = page(list);
  p.draw(false);
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  p.draw(true);
  topGrows(top, rows, 40);
  calls.length = 0;
  p.draw(false);
  assert.equal(html.style["--frame-top"], "174px", "the top as it will be painted, measured before it is read");
  assert.equal(win.scrollY, 300, "scrolled as it was, under the taller top");
  assert.equal(row.getBoundingClientRect().top, was + 40, "the row as far under the top as it stood");
  stop();
  p.leave();
});

test("a line that joins the frame's top the moment after the Back takes its own room too: the row is kept under it", () => {
  const { top, stop } = frameTopOf(134);
  const { list, rows } = inbox({ scrolled: 300 });
  const p = page(list);
  p.draw(false);
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  p.draw(true);
  p.draw(false);
  assert.equal(win.scrollY, 300, "landed where it was left");
  topGrows(top, rows, 40);
  sized(top);
  assert.equal(win.scrollY, 300, "not scrolled on by the line");
  assert.equal(row.getBoundingClientRect().top, was + 40);
  stop();
  p.leave();
});

test("a frame's top shorter at the landing than it stood holds the row where it stood on the screen, until it is whole again", () => {
  // What this holds is the floor under the growth (Math.max(0, ...)): the top is drawn again as the Back lands (the
  // list's head names its page a moment after), and a row held under a top still short would stand that much higher,
  // then drop as the top came whole.
  const { top, stop } = frameTopOf(134);
  const { list, rows } = inbox();
  const p = page(list);
  p.draw(false);
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  p.draw(true);
  win.scrollY = 0;
  topGrows(top, rows, -34);
  p.draw(false);
  assert.equal(row.getBoundingClientRect().top, was, "where it stood on the screen");
  topGrows(top, rows, 34);
  sized(top);
  assert.equal(row.getBoundingClientRect().top, was, "and there still, the top whole again");
  stop();
  p.leave();
});

test("on a desk a table's box moved down while away keeps the row as far under the box's top as it stood", () => {
  // A line over the frame (a desk's status line) moves the table's box down: the row goes down with it, and the box is
  // scrolled as it was, not on by the line to hold the row where it stood on the screen.
  const { list, box } = desk();
  const row = globalThis.document.at;
  const was = row.getBoundingClientRect().top;
  const p = page(list);
  p.draw(false);
  p.draw(true);
  box.box = () => ({ top: 140 });
  for (const r of box.children) r.box = () => ({ top: r.at + 40 - box.scrollTop });
  box.scrollTop = 0; // a box hidden with its page forgets where it was scrolled
  p.draw(false);
  assert.equal(box.scrollTop, 960, "scrolled as it was");
  assert.equal(row.getBoundingClientRect().top, was + 40, "the row 40px lower, with its box");
  assert.deepEqual(calls, [], "and the window left alone");
  p.leave();
});
