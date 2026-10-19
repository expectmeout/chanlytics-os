/**
 * A pull past the page's end on a phone (apps/dashboard/src/surfaces/kit/motion/page-give.ts): the page gives way under
 * the thumb and the frame's top holds.
 *
 * The window scrolls a page on a phone, and an iPhone's own band past the window's end dragged what is fixed along with
 * the page: the date, the page's name and its strip came down with the rows (Ruben, 19 Oct 2026), where on the
 * Calendar, which scrolls in its own box, the board gives and the bar over it holds. So the screen holds (mobile.css)
 * and the route view gives by itself, on the band's curve, and goes back once let go.
 *
 * Run against the module itself, on a window, a page and touches that answer what it asks of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { watchPageGive } = await import("../../../../../apps/dashboard/src/surfaces/kit/motion/page-give.ts");

/* ------------------------------ what stands in for a browser ------------------------------ */

/** An element: its computed style is `css` over the defaults below, and it sits under `parent`. */
const element = (name, css = {}, parent = null) => {
  const el = {
    name,
    css: {
      position: "static",
      overflowY: "visible",
      overscrollBehaviorY: "auto",
      display: "block",
      visibility: "visible",
      transitionDuration: "0.36s",
      translate: "none",
      touchAction: "auto",
      ...css,
    },
    style: { translate: "", transform: "" },
    dataset: {},
    attrs: {},
    parentElement: parent,
    children: [],
    scrollHeight: 100,
    clientHeight: 100,
    top: 0,
    shown: true,
    getClientRects() {
      return this.shown ? [{}] : [];
    },
    getBoundingClientRect() {
      return { top: this.top };
    },
    hasAttribute(name) {
      return name in this.attrs;
    },
    contains(other) {
      for (let n = other; n; n = n.parentElement) if (n === this) return true;
      return false;
    },
    closest(sel) {
      for (let n = this; n; n = n.parentElement) if (n.name === sel) return n;
      return null;
    },
  };
  if (parent) parent.children.push(el);
  return el;
};

/**
 * A phone's window over one page: the document's root, the route view (`main`) in it, a list in that, a row in the
 * list. The window is `tall` high over a document `long` long, scrolled to `at`.
 */
const phone = ({ tall = 800, long = 2000, at = 0, root = {} } = {}) => {
  const html = element("html", { overscrollBehaviorY: "none", scrollPaddingTop: "146px", ...root });
  const main = element("main", {}, html);
  const list = element("list", {}, main);
  const row = element("row", {}, list);
  const heard = {};
  const timers = new Map();
  let made = 0;
  const win = {
    innerHeight: tall,
    scrollY: at,
    document: { documentElement: html, scrollingElement: { scrollHeight: long } },
    getComputedStyle: (el) => ({
      ...el.css,
      // While a box goes back the browser draws it somewhere on the way: the test says where (`drawnAt`).
      ...(el.drawnAt !== undefined && { translate: `0px ${el.drawnAt}px` }),
      // A custom property is inherited: a row in the box of rows says what the box says.
      getPropertyValue(name) {
        for (let n = el; n; n = n.parentElement) if (n.css[name] !== undefined) return n.css[name];
        return "";
      },
    }),
    addEventListener: (kind, fn) => (heard[kind] = fn),
    removeEventListener: (kind, fn) => heard[kind] === fn && delete heard[kind],
    setTimeout: (fn, ms) => (timers.set(++made, { fn, ms }), made),
    clearTimeout: (id) => timers.delete(id),
  };
  const stop = watchPageGive(win);
  /** A finger: lands at (x, y) on `on`, moves, lets go. */
  const finger = (on = row, id = 1) => {
    const touch = (x, y) => ({ identifier: id, clientX: x, clientY: y });
    let last = null;
    return {
      down(x, y) {
        last = touch(x, y);
        heard.touchstart({ target: on, touches: [last], changedTouches: [last] });
        return this;
      },
      to(x, y) {
        last = touch(x, y);
        heard.touchmove({ target: on, touches: [last], changedTouches: [last] });
        return this;
      },
      up() {
        heard.touchend({ target: on, touches: [], changedTouches: [last] });
        return this;
      },
    };
  };
  const movedOf = (box) => (box.style.translate ? Number(/^0 (-?[\d.e-]+)px$/.exec(box.style.translate)[1]) : 0);
  const moved = () => movedOf(main);
  const runTimers = () => {
    const due = [...timers.values()];
    timers.clear();
    due.forEach((t) => t.fn());
  };
  return { win, html, main, list, row, heard, timers, stop, finger, moved, movedOf, runTimers };
};

/** A pull of `by` pixels down the screen (up where negative), in small steps, from (180, 300). */
const pull = (p, by, on) => {
  const f = p.finger(on).down(180, 300);
  for (let i = 1; i <= 10; i += 1) f.to(180, 300 + (by * i) / 10);
  return f;
};

/* ------------------------------------------ cases ------------------------------------------ */

test("a pull past the top moves the page down on the band's curve, less the further it goes, never the screen's height", () => {
  const p = phone();
  pull(p, 100);
  const at100 = p.moved();
  assert.equal(p.main.dataset.give, "held");
  assert.ok(at100 > 30 && at100 < 100, `a 100px pull moves it part of the way (${at100})`);
  pull(p, 400);
  const at400 = p.moved();
  assert.ok(at400 > at100 && at400 < 400 / 2, `further, but less than half the pull (${at400})`);
  pull(p, 5000);
  assert.ok(p.moved() < 800, "never as far as the screen is tall");
});

test("let go, the page goes back on the stylesheet's settle and is then left as it was", () => {
  const p = phone();
  pull(p, 200).up();
  assert.equal(p.main.dataset.give, "back", "the stylesheet's way back");
  assert.equal(p.moved(), 0, "headed for where it stands");
  assert.deepEqual(
    [...p.timers.values()].map((t) => t.ms),
    [360 + 40],
    "let go of once the settle has had its time",
  );
  p.runTimers();
  assert.equal(p.main.dataset.give, undefined);
  assert.equal(p.main.style.translate, "", "no style of its own left on the page");
});

test("a pull past the foot moves the page up; between the ends the window scrolls it and nothing moves", () => {
  const atFoot = phone({ at: 1200 });
  pull(atFoot, -150);
  assert.ok(atFoot.moved() < -20, `up past the foot (${atFoot.moved()})`);
  const between = phone({ at: 600 });
  pull(between, 150);
  assert.equal(between.moved(), 0);
  pull(between, -150);
  assert.equal(between.moved(), 0);
  assert.equal(between.main.dataset.give, undefined);
});

test("a page shorter than the screen gives either way", () => {
  const p = phone({ long: 800 });
  const f = pull(p, 120);
  assert.ok(p.moved() > 0);
  f.up();
  p.runTimers();
  pull(p, -120);
  assert.ok(p.moved() < 0);
});

test("a thumb that goes back past where the pull began hands the page back to the window at its place", () => {
  const p = phone();
  const f = pull(p, 120);
  assert.ok(p.moved() > 0);
  f.to(180, 300).to(180, 260);
  assert.equal(p.moved(), 0, "at its place, and the window's scroll is its own again");
  f.up();
});

test("a sideways swipe moves nothing: the strip's walk is the deck's", () => {
  const p = phone();
  const f = p.finger().down(100, 300);
  for (let x = 120; x <= 300; x += 20) f.to(x, 310);
  assert.equal(p.moved(), 0);
  assert.equal(p.main.dataset.give, undefined);
});

test("where the screen is not held, or a dialog holds the page, the pull is the browser's", () => {
  const free = phone({ root: { overscrollBehaviorY: "auto" } });
  pull(free, 150);
  assert.equal(free.moved(), 0, "a desk, or a width the stylesheet does not hold");
  const dialog = phone({ root: { overflowY: "hidden" } });
  pull(dialog, 150);
  assert.equal(dialog.moved(), 0, "a sheet or the drawer is open");
});

test("a page that holds still in its own box gives inside it, never here: the Calendar, an open thread, Live", () => {
  const p = phone();
  p.main.css.overflowY = "hidden";
  pull(p, 150);
  assert.equal(p.moved(), 0);
});

test("what the thumb is on may say it holds still, scroll by itself, or stand fixed: then nothing moves", () => {
  const settings = phone();
  settings.list.css.overscrollBehaviorY = "none";
  pull(settings, 150);
  assert.equal(settings.moved(), 0, "Settings holds still under a pull");

  const box = phone();
  Object.assign(box.list, { scrollHeight: 900, clientHeight: 300 });
  box.list.css.overflowY = "auto";
  pull(box, 150);
  assert.equal(box.moved(), 0, "a box that scrolls by itself bounces by itself");
  const short = phone();
  short.list.css.overflowY = "auto";
  pull(short, 150);
  assert.ok(short.moved() > 0, "one with nothing to scroll is no scroller of its own (a strip that scrolls across)");

  const peek = phone();
  peek.list.css.position = "fixed";
  pull(peek, 150);
  assert.equal(peek.moved(), 0, "a peek or a sheet laid over the page");

  const outside = phone();
  const tab = element("tab-bar");
  pull(outside, 150, tab);
  assert.equal(outside.moved(), 0, "a touch outside the route view: the frame's top, the tab bar");
});

test("a page with something fixed on the screen holds still, since moving it would take that along", () => {
  const p = phone();
  const strip = element("sending-strip", { position: "fixed" }, p.list);
  const f = pull(p, 150);
  assert.equal(p.moved(), 0, "the Inbox's sending strip is up");
  f.up();
  strip.css.display = "none";
  pull(p, 150);
  assert.ok(p.moved() > 0, "gone, the page gives again");
  const hidden = phone();
  element("dock", { position: "fixed", visibility: "hidden" }, hidden.list);
  pull(hidden, 150);
  assert.ok(hidden.moved() > 0, "one that is not on the screen does not count");
});

test("while the deck moves the page, a pull leaves it to the deck", () => {
  const p = phone();
  p.main.style.transform = "translate3d(-120px, 0, 0)";
  pull(p, 150);
  assert.equal(p.moved(), 0);
  assert.equal(p.main.style.transform, "translate3d(-120px, 0, 0)");
});

test("a thumb that lands on the page going back holds it where it is drawn, and the pull goes on from there", () => {
  const p = phone();
  pull(p, 300).up();
  p.main.drawnAt = 42.5;
  const f = p.finger(p.row, 2).down(180, 500);
  assert.equal(p.main.dataset.give, "held");
  assert.ok(Math.abs(p.moved() - 42.5) < 1e-6, `held where it was drawn (${p.moved()})`);
  delete p.main.drawnAt;
  f.to(180, 520);
  assert.ok(p.moved() > 42.5 && p.moved() < 60, `and on from there, with no jump (${p.moved()})`);
  f.up();
  assert.equal(p.main.dataset.give, "back");
});

test("a second finger lets the page go back; stopping lets it go and hears no more", () => {
  const p = phone();
  pull(p, 150);
  const two = [
    { identifier: 1, clientX: 0, clientY: 0 },
    { identifier: 2, clientX: 0, clientY: 0 },
  ];
  p.heard.touchstart({ target: p.row, touches: two, changedTouches: [two[1]] });
  assert.equal(p.main.dataset.give, "back");
  p.runTimers();
  pull(p, 150);
  p.stop();
  assert.equal(p.main.style.translate, "", "let go at once");
  assert.deepEqual(Object.keys(p.heard), [], "every listener removed");
});

/* ----------------------------- a page that says where its rows are ----------------------------- */

/**
 * A page of rows (the Inbox, Conversations, People): over the box of rows stands what the page says about them (the
 * buckets, the search, the list's name and its count), and the box says it gives (`--page-gives`).
 */
const rowsPage = (over = {}) => {
  const p = phone(over);
  const bar = element("bar", {}, null);
  bar.parentElement = p.main;
  p.main.children.unshift(bar);
  p.list.css["--page-gives"] = "rows";
  p.list.top = 220;
  return { ...p, bar };
};

test("a page of rows moves its rows alone: what stands over them, the page and the frame hold", () => {
  const p = rowsPage();
  pull(p, 150);
  assert.ok(p.movedOf(p.list) > 20, `the rows came down (${p.movedOf(p.list)})`);
  assert.equal(p.list.dataset.give, "held");
  assert.equal(p.moved(), 0, "the route view did not move");
  assert.equal(p.bar.style.translate, "", "nor the search over the rows");
});

test("wherever the thumb is on the page, the rows are what gives: a short list pulls from its empty foot too", () => {
  const p = rowsPage();
  pull(p, 150, p.bar);
  assert.ok(p.movedOf(p.list) > 20, "pulled from the search, the rows give");
  assert.equal(p.moved(), 0);
});

test("the box of rows is found whole, never a row in it, and a scope kept out of sight is passed over", () => {
  const p = rowsPage();
  const kept = element("kept-scope", { display: "none", "--page-gives": "rows" }, null);
  kept.parentElement = p.main;
  p.main.children.unshift(kept);
  pull(p, 150);
  assert.ok(p.movedOf(p.list) > 20, "the shown scope's rows, not the hidden one's");
  assert.equal(p.movedOf(kept), 0);
  assert.equal(p.movedOf(p.row), 0, "the row inherits the property and is not taken for the box");
});

test("rows go up past the foot only once nothing over them is on the screen, so they never slide over the search", () => {
  const short = rowsPage({ long: 800 });
  pull(short, -150);
  assert.equal(short.movedOf(short.list), 0, "a short page: the search is on the screen over the rows");
  short.finger().down(180, 300);
  pull(short, 150);
  assert.ok(short.movedOf(short.list) > 0, "down past the top they still give");

  const long = rowsPage({ at: 1200 });
  long.list.top = -900;
  pull(long, -150);
  assert.ok(long.movedOf(long.list) < -20, "at the foot of a long list, the rows go up");
});

test("a fixed layer beside the rows does not hold them; one among them does", () => {
  const beside = rowsPage();
  element("sending-strip", { position: "fixed" }, beside.main);
  pull(beside, 150);
  assert.ok(beside.movedOf(beside.list) > 20, "the Inbox's sending strip stands outside the threads");
  const among = rowsPage();
  element("dock", { position: "fixed" }, among.list);
  pull(among, 150);
  assert.equal(among.movedOf(among.list), 0);
});

test("a box that takes its own drag moves nothing: a map, or anything marked data-own-drag", () => {
  const map = phone();
  map.list.css.touchAction = "none";
  pull(map, 150);
  assert.equal(map.moved(), 0, "touch-action none: the map pans itself");
  const marked = phone();
  marked.list.attrs["data-own-drag"] = "";
  pull(marked, 150);
  assert.equal(marked.moved(), 0);
  const strip = phone();
  strip.list.css.touchAction = "pan-y";
  pull(strip, 150);
  assert.ok(strip.moved() > 0, "a strip page that leaves the vertical pan to the browser still gives");
});

test("rows caught going back are held where they are drawn, and the pull goes on from there", () => {
  const p = rowsPage();
  pull(p, 300).up();
  p.list.drawnAt = 30;
  const f = p.finger(p.row, 2).down(180, 500);
  assert.ok(Math.abs(p.movedOf(p.list) - 30) < 1e-6, `held where drawn (${p.movedOf(p.list)})`);
  delete p.list.drawnAt;
  f.to(180, 520);
  assert.ok(p.movedOf(p.list) > 30, "and on from there");
  assert.equal(p.moved(), 0, "the route view never moved");
});
