/**
 * It moves as one: a thumb's gestures and an overlay's leaving (data-bits touchSwipe, leaving).
 *
 * On a phone a sheet, the lead's peek and Ask's palette were closed only by their buttons, or at best by a flick read at
 * the touch's end, and an open thread only by its arrow. Every overlay also went in one frame. Now a let-go follows the
 * finger (the wash behind fading with it), leaves the way it was pulled or settles back, and an overlay React takes
 * away leaves by a still copy of itself.
 *
 * Run against data-bits itself, on elements that answer what the helpers ask of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

let reduced = false;
const styleOf = (over = {}) => ({ overflowY: "visible", overflowX: "visible", ...over });
globalThis.window = {
  matchMedia: (q) => ({ matches: q.includes("reduce") ? reduced : true }),
  getComputedStyle: (n) => styleOf(n.__style),
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
};
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  body: { appendChild() {} },
  createElement: () => ({ style: {} }),
};
globalThis.React = {
  createElement: () => null,
  useState: (v) => [v, () => {}],
  useEffect() {},
  useRef: (v) => ({ current: v }),
  Fragment: "Fragment",
};
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { touchSwipe, leaving, leaveOverlay } = globalThis.window;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** An element the gesture moves: its style, its size, what stands before it, whether it is still on screen. */
const element = (over = {}) => ({
  style: {},
  offsetHeight: 600,
  offsetWidth: 375,
  scrollHeight: 600,
  clientHeight: 600,
  scrollWidth: 375,
  clientWidth: 375,
  scrollTop: 0,
  parentElement: null,
  previousElementSibling: null,
  isConnected: true,
  getClientRects: () => [1],
  matches: () => false,
  ...over,
});
const wash = () => element({ className: "sb-sheet-backdrop" });

/** A touch from (x, y) through each step, ending at the last. */
const drag = (h, el, from, ...steps) => {
  h.onTouchStart({ touches: [{ clientX: from[0], clientY: from[1] }], currentTarget: el, target: el.__target || el });
  for (const [x, y] of steps) h.onTouchMove({ touches: [{ clientX: x, clientY: y }], currentTarget: el });
  const [x, y] = steps.at(-1) || from;
  h.onTouchEnd({ changedTouches: [{ clientX: x, clientY: y }], currentTarget: el });
};

test("a pull down follows the finger, and the wash behind fades with it", () => {
  const w = wash();
  const el = element({ previousElementSibling: w });
  const h = touchSwipe({ onDown: () => {} });
  h.onTouchStart({ touches: [{ clientX: 100, clientY: 100 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 102, clientY: 104 }], currentTarget: el });
  assert.equal(el.style.transform, undefined, "under 8px, nothing is taken");
  h.onTouchMove({ touches: [{ clientX: 102, clientY: 160 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(0, 60px, 0)");
  assert.equal(el.style.transition, "none", "while the finger holds it, it moves at once");
  assert.equal(w.style.opacity, "0.9", "a tenth of the way down, a tenth of the wash gone");
  h.onTouchCancel({ currentTarget: el });
});

test("let go short of a third, it settles back; past it, it leaves the way it was pulled, and then it closes", async () => {
  const closed = [];
  const el = element({ previousElementSibling: wash() });
  const h = touchSwipe({ onDown: () => closed.push(1) });
  drag(h, el, [100, 100], [100, 110], [100, 120]);
  assert.equal(el.style.transform, "translate3d(0, 0, 0)", "20px: back where it was");
  assert.deepEqual(closed, []);
  await wait(280);
  assert.equal(el.style.transform, "", "and the page's own rules own it again");

  const gone = element({ previousElementSibling: wash(), isConnected: false });
  drag(h, gone, [100, 100], [100, 200], [100, 400]);
  assert.equal(gone.style.transform, "translate3d(0, 100%, 0)", "300px of 600: away");
  assert.equal(gone.previousElementSibling.style.opacity, "0");
  assert.deepEqual(closed, [], "the close waits for the leaving");
  await wait(220);
  assert.deepEqual(closed, [1]);
});

test("a page that asks first keeps its sheet: it leaves, the page asks, and it settles back to show the question", async () => {
  const el = element();
  let asked = 0;
  const h = touchSwipe({ onDown: () => (asked += 1) });
  drag(h, el, [100, 100], [100, 300], [100, 400]);
  await wait(200);
  assert.equal(asked, 1);
  assert.equal(
    el.style.transform,
    "translate3d(0, 100%, 0)",
    "judged only once React has had its commit: no frame back in view",
  );
  await wait(80);
  assert.equal(el.style.transform, "translate3d(0, 0, 0)", "still on screen after the close: back");
});

test("a thread swipes back across, following the finger, and the page is told while it moves", async () => {
  const back = [];
  const grabs = [];
  const el = element();
  const h = touchSwipe({ onBack: () => back.push(1), when: () => true, onGrab: (_, on) => grabs.push(on) });
  h.onTouchStart({ touches: [{ clientX: 60, clientY: 300 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 140, clientY: 306 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(80px, 0, 0)");
  assert.deepEqual(grabs, [true], "the list is drawn under it");
  h.onTouchEnd({ changedTouches: [{ clientX: 260, clientY: 310 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(100%, 0, 0)");
  await wait(220);
  assert.deepEqual(back, [1]);
  await wait(80);
  assert.deepEqual(grabs, [true, false]);
  // From the screen's edge the browser's own back is the thumb's, and a swipe left is nothing to a thread.
  const edge = element();
  drag(h, edge, [10, 300], [120, 300], [200, 300]);
  const left = element();
  drag(h, left, [200, 300], [120, 300], [40, 300]);
  assert.equal(edge.style.transform, undefined);
  assert.equal(left.style.transform, undefined);
});

test("a drawer slides away to the left under the finger, its wash fading, and its own rules take it after the close", async () => {
  const closed = [];
  const w = wash();
  const el = element({ offsetWidth: 248, previousElementSibling: w });
  const h = touchSwipe({ onAway: () => closed.push(1), when: () => true });
  h.onTouchStart({ touches: [{ clientX: 200, clientY: 300 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 138, clientY: 304 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(-62px, 0, 0)");
  assert.equal(w.style.opacity, "0.75", "a quarter of its width away, a quarter of the wash gone");
  h.onTouchMove({ touches: [{ clientX: 260, clientY: 304 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(0px, 0, 0)", "never past where it stands open");
  h.onTouchEnd({ changedTouches: [{ clientX: 180, clientY: 304 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(0, 0, 0)", "20px: back where it was");
  assert.deepEqual(closed, []);
  await wait(280);

  drag(h, el, [200, 300], [150, 302], [100, 304]);
  assert.equal(el.style.transform, "translate3d(-100%, 0, 0)", "100px of 248, past a third: away");
  assert.equal(w.style.opacity, "0");
  await wait(200);
  assert.deepEqual(closed, [1]);
  await wait(80);
  // A drawer is slid shut by its own rules (mobile.css), not taken away, so they take it from where it was let go.
  assert.equal(el.style.transform, "");
  assert.equal(el.style.transition, "");
  assert.equal(w.style.opacity, "");

  const ends = element({ offsetWidth: 248 });
  h.onTouchStart({ touches: [{ clientX: 220, clientY: 300 }], currentTarget: ends, target: ends });
  h.onTouchEnd({ changedTouches: [{ clientX: 120, clientY: 302 }], currentTarget: ends });
  assert.deepEqual(closed, [1, 1], "a slide the browser reports only at its ends still closes it");

  // A scroll down its list is never a slide, and nothing opens a drawer: a swipe to the right is nothing to it.
  const list = element({ offsetWidth: 248 });
  drag(h, list, [120, 300], [124, 360], [126, 460]);
  drag(h, list, [10, 300], [120, 300], [220, 300]);
  assert.equal(list.style.transform, undefined);
  assert.deepEqual(closed, [1, 1]);
});

test("what takes a drag of its own keeps it: a field, a row that scrolls across, a list scrolled down", () => {
  const closed = [];
  const h = touchSwipe({ onDown: () => closed.push(1), onBack: () => closed.push(2) });
  const sheet = element();
  sheet.__target = element({ matches: (sel) => sel.includes("textarea"), parentElement: sheet });
  drag(h, sheet, [100, 100], [100, 200], [100, 400]);
  const row = element({ scrollWidth: 900, clientWidth: 375, __style: { overflowX: "auto" } });
  const strip = element();
  strip.__target = element({ parentElement: row });
  row.parentElement = strip;
  drag(h, strip, [100, 100], [200, 100], [300, 100]);
  // A short sheet is its own scroller: scrolled down, a pull down scrolls it back up.
  const scrolled = element({ scrollHeight: 1200, clientHeight: 500, scrollTop: 90, __style: { overflowY: "auto" } });
  drag(h, scrolled, [100, 100], [100, 200], [100, 400]);
  assert.deepEqual(closed, []);
  assert.equal(scrolled.style.transform, undefined);
});

test("a flick read only at its ends still walks a pile, and still pulls down from the top", () => {
  const went = [];
  const h = touchSwipe({
    onLeft: () => went.push("next"),
    onRight: () => went.push("prev"),
    onDown: () => went.push("down"),
  });
  const el = element();
  h.onTouchStart({ touches: [{ clientX: 300, clientY: 200 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 240, clientY: 204 }], currentTarget: el });
  h.onTouchEnd({ changedTouches: [{ clientX: 180, clientY: 206 }], currentTarget: el });
  drag(h, el, [300, 200], [440, 204]);
  assert.deepEqual(went, ["next", "prev"], "REGRESSION guard: a move that follows nothing still reads as a swipe");
});

test("under reduced motion the finger still carries it, and the rest happens at once", () => {
  reduced = true;
  try {
    const closed = [];
    const el = element();
    const h = touchSwipe({ onDown: () => closed.push(1) });
    drag(h, el, [100, 100], [100, 300], [100, 400]);
    assert.deepEqual(closed, [1], "no leaving to wait for");
  } finally {
    reduced = false;
  }
});

/* ------------------------------------ a page ------------------------------------ */
// A page under a strip, walked across on a phone (surface-tabs.jsx stripPager answers `pages`).

const pager = (over = {}) => ({ prev: true, next: true, go() {}, ...over });

test("a page follows the thumb across, both ways, and says how far toward the tab beside it is", () => {
  const seen = [];
  const el = element();
  const h = touchSwipe({ pages: () => pager({ follow: (p, step, how) => seen.push([p, step, how]) }) });
  h.onTouchStart({ touches: [{ clientX: 200, clientY: 300 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 125, clientY: 304 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(-75px, 0, 0)");
  assert.deepEqual(seen.at(-1), [0.2, 1, "move"], "75px of 375: a fifth of the way to the next");
  h.onTouchMove({ touches: [{ clientX: 275, clientY: 304 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(75px, 0, 0)");
  assert.deepEqual(seen.at(-1), [0.2, -1, "move"]);
  h.onTouchCancel({ currentTarget: el });
  assert.equal(seen.at(-1)[2], "settle");
  assert.equal(el.style.transform, "translate3d(0, 0, 0)");
});

test("past the last tab a page gives a quarter of the drag, 48px at most, and settles back", () => {
  const went = [];
  const el = element();
  const h = touchSwipe({ pages: () => pager({ next: false, go: (s) => went.push(s) }) });
  h.onTouchStart({ touches: [{ clientX: 300, clientY: 300 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 220, clientY: 300 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(-20px, 0, 0)");
  h.onTouchMove({ touches: [{ clientX: 40, clientY: 300 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(-48px, 0, 0)");
  h.onTouchEnd({ changedTouches: [{ clientX: 40, clientY: 300 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(0, 0, 0)", "a flick at a dead end is still nothing");
  assert.deepEqual(went, []);
});

test("let go past a third, a page leaves the way it went, and then the tab beside is pressed", async () => {
  const went = [];
  const hows = [];
  const el = element();
  const h = touchSwipe({
    pages: () => pager({ prev: false, follow: (p, s, how) => hows.push(how), go: (s) => went.push(s) }),
  });
  drag(h, el, [300, 300], [240, 300], [160, 300]);
  assert.equal(el.style.transform, "translate3d(-375px, 0, 0)", "away, a page's width");
  assert.equal(hows.at(-1), "leave");
  assert.deepEqual(went, [], "the tab waits for the leaving");
  await wait(220);
  assert.deepEqual(went, [1]);
  // Short of a flick and of a third, it settles back.
  const near = element();
  drag(h, near, [300, 300], [285, 300], [280, 300]);
  assert.equal(near.style.transform, "translate3d(0, 0, 0)");
  assert.deepEqual(went, [1]);
});

test("a page whose strip is inside it moves everything but the strip: what it names moves, the view itself stays", async () => {
  const el = element();
  const bar = element();
  const rows = element();
  const h = touchSwipe({ pages: () => pager({ moving: [bar, rows] }) });
  h.onTouchStart({ touches: [{ clientX: 300, clientY: 300 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 200, clientY: 300 }], currentTarget: el });
  assert.equal(bar.style.transform, "translate3d(-100px, 0, 0)");
  assert.equal(rows.style.transform, "translate3d(-100px, 0, 0)");
  assert.equal(el.style.transform, undefined, "the view, and the strip in it, stay where they are");
  h.onTouchEnd({ changedTouches: [{ clientX: 60, clientY: 300 }], currentTarget: el });
  assert.equal(rows.style.transform, "translate3d(-375px, 0, 0)");
  await wait(220);
  assert.equal(el.style.transform, undefined);
});

test("a page never moves from the screen's edges, where the page refuses the touch, or where a thread goes back", () => {
  const went = [];
  const h = touchSwipe({ pages: (el, from) => (from && from.__own ? null : pager({ go: (s) => went.push(s) })) });
  const left = element();
  drag(h, left, [10, 300], [120, 300], [200, 300]);
  const right = element();
  drag(h, right, [365, 300], [250, 300], [150, 300]);
  const own = element();
  own.__target = element({ __own: true, parentElement: own });
  drag(h, own, [200, 300], [100, 300], [20, 300]);
  assert.deepEqual(went, []);
  for (const el of [left, right, own]) assert.equal(el.style.transform, undefined);
  const both = touchSwipe({ onBack: () => {}, when: () => true, pages: () => pager({ go: (s) => went.push(s) }) });
  const thread = element();
  drag(both, thread, [60, 300], [140, 300], [260, 300]);
  assert.equal(thread.style.transform, "translate3d(100%, 0, 0)", "a swipe right in a thread is its Back");
  assert.deepEqual(went, []);
});

test("a page that stays (the Calendar's days) leaves, turns, and comes back in from the side it is going to", async () => {
  const went = [];
  const moves = [];
  const style = {};
  const el = element({
    style: new Proxy(style, {
      set: (o, k, v) => {
        if (k === "transform") moves.push(v);
        o[k] = v;
        return true;
      },
    }),
  });
  const h = touchSwipe({ pages: () => pager({ stays: true, go: (s) => went.push(s) }) });
  drag(h, el, [300, 300], [240, 300], [160, 300]);
  assert.equal(style.transform, "translate3d(-375px, 0, 0)", "away first, as any page");
  await wait(220);
  assert.deepEqual(went, [1], "then the next days");
  assert.deepEqual(
    moves.slice(-2),
    ["translate3d(40px, 0, 0)", "translate3d(0, 0, 0)"],
    "and they come in from the right",
  );
  await wait(280);
  assert.equal(style.transform, "", "the page's own rules own it again");
});

test("under reduced motion a page still follows, and the switch is at once; a swipe read only at its ends switches too", () => {
  reduced = true;
  try {
    const went = [];
    const h = touchSwipe({ pages: () => pager({ go: (s) => went.push(s) }) });
    drag(h, element(), [300, 300], [200, 300], [100, 300]);
    assert.deepEqual(went, [1]);
    const ends = element();
    h.onTouchStart({ touches: [{ clientX: 100, clientY: 300 }], currentTarget: ends, target: ends });
    h.onTouchEnd({ changedTouches: [{ clientX: 220, clientY: 302 }], currentTarget: ends });
    assert.deepEqual(went, [1, -1]);
  } finally {
    reduced = false;
  }
});

/* ------------------------------------ leaving ------------------------------------ */

/** A node that can be copied and put back, and says what was done with it. */
const node = (cls, kids = []) => {
  const attrs = new Map([
    ["data-testid", `${cls}-id`],
    ["role", "dialog"],
    ["id", `${cls}-dom`],
  ]);
  const heard = {};
  const n = {
    className: cls,
    kids,
    attrs,
    parentNode: null,
    nextSibling: null,
    previousElementSibling: null,
    removed: false,
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
    querySelectorAll: () => kids.flatMap((k) => [k, ...k.querySelectorAll()]),
    cloneNode: (deep) => node(cls, deep ? kids.map((k) => k.cloneNode(true)) : []),
    addEventListener: (name, fn) => (heard[name] = fn),
    heard,
    remove() {
      n.removed = true;
    },
  };
  return n;
};
const parentOf = () => {
  const put = [];
  return { put, insertBefore: (x, before) => put.push({ x, before }) };
};

test("an overlay React lets go of leaves by a still copy: no id, no test id, no role, inert, hidden, and its wash with it", async () => {
  const parent = parentOf();
  const w = node("sb-sheet-backdrop");
  const sheet = node("sb-sheet", [node("pp-sheet-body")]);
  sheet.parentNode = parent;
  sheet.previousElementSibling = w;
  const ref = leaving("test-sheet");
  assert.equal(leaving("test-sheet"), ref, "the same ref on every draw, so a draw is never a leaving");
  ref(sheet);
  await wait(70);
  ref(null);
  assert.deepEqual(
    parent.put.map((p) => p.x.className),
    ["sb-sheet-backdrop", "sb-sheet"],
    "the wash's copy first, before the sheet; the sheet's after it",
  );
  const copy = parent.put[1].x;
  assert.equal(copy.getAttribute("data-leaving"), "true");
  assert.equal(copy.getAttribute("inert"), "");
  assert.equal(copy.getAttribute("aria-hidden"), "true");
  for (const k of ["role", "data-testid", "id"]) assert.equal(copy.getAttribute(k), null, `no ${k}`);
  assert.equal(copy.kids[0].getAttribute("data-testid"), null, "nor on anything inside it");
  copy.heard.animationend({ target: copy });
  assert.equal(copy.removed, true, "gone as its motion ends");
});

test("nothing leaves from a frame mounted and let go of at once, under reduced motion, or with nowhere to stand", async () => {
  const parent = parentOf();
  const sheet = node("sb-sheet");
  sheet.parentNode = parent;
  const ref = leaving("test-strict");
  ref(sheet);
  ref(null);
  assert.equal(parent.put.length, 0, "StrictMode's mount, let go and mount again in development");
  reduced = true;
  try {
    ref(sheet);
    await wait(70);
    ref(null);
    assert.equal(parent.put.length, 0);
  } finally {
    reduced = false;
  }
  leaveOverlay(node("sb-sheet"));
  assert.ok(true, "a node already taken off the page is left alone");
});
