/**
 * It moves as one: a thumb's gestures and an overlay's leaving (frame-globals touchSwipe, leaving).
 *
 * On a phone a sheet, the lead's peek and Ask's palette were closed only by their buttons, or at best by a flick read at
 * the touch's end, and an open thread only by its arrow. Every overlay also went in one frame. Now a let-go follows the
 * finger (the wash behind fading with it), leaves the way it was pulled or settles back, and an overlay React takes
 * away leaves by a still copy of itself.
 *
 * Run against frame-globals itself, on elements that answer what the helpers ask of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

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
(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
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

test("a sheet still on the page as it plays its leaving (the kit's Sheet, which Base UI lets go after) stays where the pull took it", async () => {
  const w = wash();
  const el = element({ previousElementSibling: w, dataset: {} });
  const h = touchSwipe({ onDown: () => (el.dataset.leaving = "true") });
  drag(h, el, [100, 100], [100, 300], [100, 400]);
  await wait(300);
  assert.equal(el.dataset.leaving, "true", "the close was asked, and the sheet is leaving");
  assert.equal(el.style.transform, "translate3d(0, 100%, 0)", "not settled back into view, nor put back for a frame");
  assert.equal(w.style.opacity, "0", "and its wash stays gone");
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

test("a touch begun in what a portal drew is that overlay's: a swipe on a sheet never walks the page it was opened from", async () => {
  const went = [];
  const h = touchSwipe({ onDown: () => went.push("down"), onBack: () => went.push("back"), when: () => true });
  // A person's page, and a fold's sheet React drew from inside it on the app's root: React hands the sheet's touch up
  // the tree it was drawn from, so the page's handlers hear it, but it began outside the page's own nodes.
  const page = element({ nodeType: 1 });
  const sheet = element({ nodeType: 1 });
  page.contains = (n) => n === page;
  page.__target = sheet;
  drag(h, page, [60, 300], [140, 304], [260, 306]);
  drag(h, page, [100, 100], [100, 200], [100, 400]);
  await wait(260);
  assert.deepEqual(
    went,
    [],
    "a sideways swipe on the sheet took the page back to People; a pull closed the sheet under it",
  );
  assert.equal(page.style.transform, undefined, "and the page never moved under the finger");
  // The same swipe begun on the page itself is the page's.
  page.__target = page;
  drag(h, page, [60, 300], [140, 304], [260, 306]);
  await wait(260);
  assert.deepEqual(went, ["back"]);
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
// A page under a strip, walked across on a phone. The strip's pager answers `pages` (surfaces/kit/view-tabs/pager.ts) and
// moves the page itself, by the deck every change of view moves by (surfaces/kit/motion/view-deck.ts): this reader says
// how far the finger is, which side it is going to, whether a page is there, and how it let go. It moved the element
// itself before, by an inline style React was about to take away with the page (8 Oct 2026).

const pager = (over = {}) => ({ prev: true, next: true, drag() {}, settle() {}, go() {}, ...over });
/** The Calendar's days: a page that stays, and turns in place. It says only what is each side and how to turn. */
const days = (over = {}) => ({ prev: true, next: true, stays: true, go() {}, ...over });

test("a page follows the thumb across, both ways: it is told how far, which side, and that a page is there", () => {
  const seen = [];
  const el = element();
  const h = touchSwipe({
    pages: () => pager({ drag: (dx, step, open) => seen.push([dx, step, open]), settle: () => seen.push("settle") }),
  });
  h.onTouchStart({ touches: [{ clientX: 200, clientY: 300 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 125, clientY: 304 }], currentTarget: el });
  assert.deepEqual(seen.at(-1), [-75, 1, true], "75px toward the next");
  h.onTouchMove({ touches: [{ clientX: 275, clientY: 304 }], currentTarget: el });
  assert.deepEqual(seen.at(-1), [75, -1, true]);
  assert.equal(el.style.transform, undefined, "the page moves its own view: the reader puts nothing on the element");
  h.onTouchCancel({ currentTarget: el });
  assert.equal(seen.at(-1), "settle");
});

/** An element that keeps what is listened for on it, as a browser's does. */
const listened = (over = {}) => {
  const el = element(over);
  el.listeners = [];
  el.addEventListener = (type, fn, opts) => el.listeners.push({ type, fn, opts });
  el.removeEventListener = (type, fn) => {
    el.listeners = el.listeners.filter((l) => l.fn !== fn);
  };
  return el;
};
/** A browser's own touchmove on `el`, through the listener the reader put there: whether its default was refused. */
const browserMove = (el, x, y) => {
  const [{ fn }] = el.listeners;
  let refused = false;
  fn({
    touches: [{ clientX: x, clientY: y }],
    currentTarget: el,
    cancelable: true,
    preventDefault: () => void (refused = true),
  });
  return refused;
};

test("a move is read from the element first, and the browser's scroll is refused while a page is carried across", () => {
  const seen = [];
  const el = listened();
  const h = touchSwipe({ pages: () => pager({ drag: (dx) => seen.push(dx) }) });
  h.onTouchStart({ touches: [{ clientX: 200, clientY: 300 }], currentTarget: el, target: el });
  assert.deepEqual(
    el.listeners.map((l) => [l.type, l.opts]),
    [["touchmove", { passive: false }]],
    "the element's own, non-passive",
  );
  assert.equal(browserMove(el, 170, 304), true, "the move that makes it a page is refused, that same move");
  assert.deepEqual(seen, [-30]);
  h.onTouchMove({ touches: [{ clientX: 170, clientY: 304 }], currentTarget: el });
  assert.deepEqual(seen, [-30], "React's handler reads nothing the element's listener read");
  assert.equal(browserMove(el, 120, 340), true, "and every move after, however far down it drifts");
  assert.deepEqual(seen, [-30, -80]);
  h.onTouchEnd({ changedTouches: [{ clientX: 120, clientY: 340 }], currentTarget: el });
  assert.deepEqual(el.listeners, [], "let go, the listener goes with the touch");
});

test("a touch mostly down is the browser's own: nothing is refused, a pull follows, and a page is never carried", () => {
  const seen = [];
  const el = listened();
  const h = touchSwipe({ onDown() {}, pages: () => pager({ drag: (dx) => seen.push(dx) }) });
  h.onTouchStart({ touches: [{ clientX: 200, clientY: 300 }], currentTarget: el, target: el });
  assert.equal(browserMove(el, 204, 330), false);
  assert.equal(browserMove(el, 260, 400), false, "nor once it drifts across");
  assert.equal(el.style.transform, "translate3d(0, 100px, 0)", "the pull still follows the finger");
  assert.deepEqual(seen, []);
  h.onTouchCancel({ currentTarget: el });
  assert.deepEqual(el.listeners, []);
});

test("a thread swiped back and a drawer slid away hold the browser's scroll the same way", () => {
  for (const [opts, from, to] of [
    [{ onBack() {} }, 60, 140],
    [{ onAway() {} }, 200, 120],
  ]) {
    const el = listened();
    const h = touchSwipe(opts);
    h.onTouchStart({ touches: [{ clientX: from, clientY: 300 }], currentTarget: el, target: el });
    assert.equal(browserMove(el, to, 306), true, `${Object.keys(opts)[0]} refuses the scroll under it`);
    h.onTouchCancel({ currentTarget: el });
  }
});

test("past the last tab a page is told a quarter of the drag, 48px at most, and that no page is there; then it settles", () => {
  const seen = [];
  const went = [];
  const el = element();
  const h = touchSwipe({
    pages: () =>
      pager({
        next: false,
        drag: (dx, step, open) => seen.push([dx, step, open]),
        settle: () => seen.push("settle"),
        go: (s) => went.push(s),
      }),
  });
  h.onTouchStart({ touches: [{ clientX: 300, clientY: 300 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 220, clientY: 300 }], currentTarget: el });
  assert.deepEqual(seen.at(-1), [-20, 1, false]);
  h.onTouchMove({ touches: [{ clientX: 40, clientY: 300 }], currentTarget: el });
  assert.deepEqual(seen.at(-1), [-48, 1, false]);
  h.onTouchEnd({ changedTouches: [{ clientX: 40, clientY: 300 }], currentTarget: el });
  assert.equal(seen.at(-1), "settle", "a flick at a dead end is still nothing");
  assert.deepEqual(went, []);
});

test("let go past a third, or with a flick, the tab beside is pressed as the finger lets go; short of both it settles", async () => {
  // The tab waited for the leaving (180 ms) before its page began to draw, and the screen stood empty for it on both
  // strips (5 Oct 2026); the page beside draws now while this one leaves.
  const went = [];
  const settled = [];
  const h = touchSwipe({ pages: () => pager({ prev: false, go: (s) => went.push(s), settle: () => settled.push(1) }) });
  drag(h, element(), [300, 300], [240, 300], [160, 300]);
  assert.deepEqual(went, [1], "pressed as the finger lets go");
  await wait(220);
  assert.deepEqual(went, [1], "and once");
  assert.deepEqual(settled, []);
  drag(h, element(), [300, 300], [285, 300], [280, 300]);
  assert.deepEqual(went, [1]);
  assert.deepEqual(settled, [1], "short of a flick and of a third, back");
});

test("the page is let go at the finger's speed across, and at none where the finger stood still first", () => {
  // The page leaving eased in from rest whatever the finger had been doing: one moving 1.4px a millisecond crawled 7px
  // in its first 85 ms (measured, 8 Oct 2026). The page is handed the speed now, and carries on at it.
  const keep = Date.now;
  let clock = 5000;
  Date.now = () => clock;
  try {
    const went = [];
    const h = touchSwipe({ pages: () => pager({ go: (s, speed) => went.push([s, speed]) }) });
    const el = element();
    h.onTouchStart({ touches: [{ clientX: 300, clientY: 300 }], currentTarget: el, target: el });
    clock += 50;
    h.onTouchMove({ touches: [{ clientX: 240, clientY: 300 }], currentTarget: el });
    clock += 50;
    h.onTouchMove({ touches: [{ clientX: 160, clientY: 300 }], currentTarget: el });
    clock += 10;
    h.onTouchEnd({ changedTouches: [{ clientX: 160, clientY: 300 }], currentTarget: el });
    assert.deepEqual(went, [[1, -1.6]], "80px in the last 50 ms, leftward");
    const held = element();
    h.onTouchStart({ touches: [{ clientX: 300, clientY: 300 }], currentTarget: held, target: held });
    clock += 50;
    h.onTouchMove({ touches: [{ clientX: 240, clientY: 300 }], currentTarget: held });
    clock += 50;
    h.onTouchMove({ touches: [{ clientX: 120, clientY: 300 }], currentTarget: held });
    clock += 400;
    h.onTouchEnd({ changedTouches: [{ clientX: 120, clientY: 300 }], currentTarget: held });
    assert.deepEqual(went.at(-1), [1, 0], "held where it was for a moment, it is let go at rest");
  } finally {
    Date.now = keep;
  }
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
  const back = touchSwipe({ onBack: () => {}, when: () => true });
  const thread = element();
  drag(back, thread, [60, 300], [140, 300], [260, 300]);
  assert.equal(thread.style.transform, "translate3d(100%, 0, 0)", "a swipe right in a thread is its Back");
  assert.deepEqual(went, []);
});

test("where a page has both, a page to the left is walked first, and Back is what lies left of the first (a person's tabs, then People)", () => {
  const went = [];
  const backs = [];
  const grabs = [];
  const at = { prev: true };
  const h = touchSwipe({
    onBack: () => backs.push(1),
    when: () => true,
    onGrab: (_, on) => grabs.push(on),
    pages: () => pager({ prev: at.prev, go: (s) => went.push(s) }),
  });
  const onHistory = element();
  drag(h, onHistory, [60, 300], [140, 300], [260, 300]);
  assert.deepEqual(went, [-1], "History's swipe right is Overview");
  assert.equal(onHistory.style.transform, undefined, "the tab's panes move themselves, never the page");
  assert.deepEqual(grabs, [], "REGRESSION: a page walked marked the element lifted, and nothing let go of it");
  at.prev = false;
  const onOverview = element();
  drag(h, onOverview, [60, 300], [140, 300], [260, 300]);
  assert.equal(onOverview.style.transform, "translate3d(100%, 0, 0)", "Overview's swipe right is People");
  assert.deepEqual(grabs, [true]);
  // A swipe left still walks the next, and one reported only at its ends reads the same way.
  const left = element();
  drag(h, left, [300, 300], [220, 300], [120, 300]);
  assert.deepEqual(went, [-1, 1]);
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
  const h = touchSwipe({ pages: () => days({ go: (s) => went.push(s) }) });
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

test("a page that stays waits where it went until `go` says the next has landed, then comes back in with it", async () => {
  // A turn that is not drawn at once answers a promise, and the page comes back in only when it has landed: brought
  // back as soon as it was asked, it came in showing what it was leaving, which turned into the next in mid-air (Reports'
  // lenses, 7 Oct 2026, which are views of a strip now and move by the deck).
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
  let landed = null;
  const h = touchSwipe({
    pages: () =>
      days({
        go: () =>
          new Promise((r) => {
            landed = r;
          }),
      }),
  });
  drag(h, el, [300, 300], [240, 300], [160, 300]);
  await wait(220);
  assert.ok(landed, "asked for the next once it had left");
  assert.equal(moves.at(-1), "translate3d(-375px, 0, 0)", "and waits where it went while the next draws");
  landed();
  await wait(20);
  assert.deepEqual(moves.slice(-2), ["translate3d(40px, 0, 0)", "translate3d(0, 0, 0)"], "then in from the right");
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

test("a strip is walked only where the shell is narrow, and there only where the page says it travels its own width", async () => {
  // People's strip is walked to 900px, where its page is one column, and any other only on a phone (5 Oct 2026). That is
  // the stylesheet's to say now, by the token that says how far a page travels (`--view-travel`: the tokens', and
  // People's to 900px in components.css): the strip's pager asks the deck whether a finger walks the page on screen.
  const { viewPager } = await import("../../../../apps/dashboard/src/surfaces/kit/view-tabs/pager.ts");
  const { viewDeck } = await import("../../../../apps/dashboard/src/surfaces/kit/motion/view-deck.ts");
  Object.assign(globalThis.window, { viewPager, viewDeck });
  // The strip (surfaces/frame/surface-tabs.tsx), under the names the frame draws and asks it by.
  const surfaceTabs = await importSrc("apps/dashboard/src/surfaces/frame/surface-tabs.tsx");
  Object.assign(globalThis.window, {
    SurfaceTabs: surfaceTabs.SurfaceTabs,
    stripPlace: surfaceTabs.stripPlace,
    stripSlide: surfaceTabs.stripSlide,
    stripSwipe: surfaceTabs.stripSwipe,
  });
  const keep = globalThis.window.matchMedia;
  let width = 800;
  let token = "100%";
  globalThis.window.matchMedia = (q) => {
    const m = /max-width: (\d+)px/.exec(q);
    return { matches: q.includes("reduce") ? false : m ? width <= Number(m[1]) : false };
  };
  globalThis.document.timeline = { currentTime: 0 };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => token });
  const walked = () => {
    const pressed = [];
    const tab = (active, name) => ({
      offsetLeft: active ? 4 : 90,
      offsetWidth: 80,
      classList: { contains: (c) => c === "active" && active },
      click: () => pressed.push(name),
    });
    const tabs = [tab(true, "people"), tab(false, "leads")];
    const bar = {
      getClientRects: () => [1],
      querySelectorAll: () => tabs,
      querySelector: () => null,
      setAttribute() {},
      removeAttribute() {},
      hasAttribute: () => false,
    };
    const view = element({
      parentElement: { querySelector: () => bar },
      dataset: {},
      offsetParent: null,
      addEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 375, height: 600 }),
      animate: () => ({ finished: new Promise(() => {}), cancel() {} }),
    });
    view.contains = (other) => other === view;
    viewDeck.view("frame")(view);
    drag(globalThis.window.stripSwipe(), view, [300, 300], [200, 300], [100, 300]);
    return pressed;
  };
  try {
    assert.deepEqual(walked(), ["leads"], "a page of one column, under 900px: walked");
    token = "56px";
    assert.deepEqual(walked(), [], "two panes at the same width travel a desk's length: not a finger's to carry");
    token = "100%";
    width = 1000;
    assert.deepEqual(walked(), [], "past 900px nothing is");
  } finally {
    globalThis.window.matchMedia = keep;
  }
});
