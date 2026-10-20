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
      for (let n = this; n; n = n.parentElement) if (sel.split(",").some((s) => n.name === s.trim())) return n;
      return null;
    },
    contains(other) {
      for (let n = other; n; n = n.parentElement) if (n === this) return true;
      return false;
    },
    after(node) {
      this.parentElement.children.push(node);
      node.parentElement = this.parentElement;
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
const html = element("html", { height: 4000 });
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
  setTimeout: (fn) => idle.push(fn),
  clearTimeout() {},
};
globalThis.window = win;
globalThis.getComputedStyle = win.getComputedStyle;
globalThis.document = {
  body,
  documentElement: html,
  scrollingElement: html,
  at: null,
  elementFromPoint: () => globalThis.document.at,
};
Object.defineProperty(html, "scrollTop", {
  get: () => win.scrollY,
  set: (v) => {
    win.scrollY = v;
  },
});

/* ------------------------------ the hook, drawn by hand ------------------------------ */

const react = fromDashboard("react");
const { useHeldList, heldUnder, showHeld, heldPutBack } = fromDashboard("../surfaces/kit/motion/held-list.ts");

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
  assert.equal(heldUnder(), list, "what stands for it under a thumb is the list itself");
  showHeld(true);
  assert.equal(list.dataset.held, "shown", "a thumb carrying the page away shows it");
  showHeld(false);
  assert.equal(list.dataset.held, "");
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
  assert.equal(heldUnder(), null);
});

test("a list its page keeps out of the document (People's tabs) is stood in for by a picture, made when idle, on a touch screen", () => {
  const { list } = inbox();
  const p = page(list);
  p.draw(false);
  // People's scope, hidden by React's Activity in the draw that opens the person.
  p.draw(true, () => (list.shown = false));
  assert.equal(list.dataset.held, "", "held, so its rows and its place hear nothing of the window");
  assert.equal(list.style.top, undefined, "nothing to place: it is out of the document");
  assert.equal(heldUnder(), null, "no picture yet");
  assert.equal(idle.length, 1, "made when the phone is idle");
  idle.shift()();
  const copy = heldUnder();
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
