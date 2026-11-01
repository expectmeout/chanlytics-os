/**
 * A pull past the page's end on a phone (apps/dashboard/src/surfaces/kit/motion/page-give.ts): the page gives way under
 * the thumb and the frame's top holds.
 *
 * The window scrolls a page on a phone, and an iPhone's own band past the window's end dragged what is fixed along with
 * the page: the date, the page's name and its strip came down with the rows (Ruben, 19 Oct 2026), where on the
 * Calendar, which scrolls in its own box, the board gives and the bar over it holds. So the screen holds (mobile.css)
 * and the route view gives by itself, on the band's curve, and goes back on the band's spring once let go. A flick's
 * glide that reaches an end still moving rides the same spring out past it and back, as an iPhone's does (1 Nov 2026).
 * The spring is a web animation the compositor plays, and what would give is readied for its own layer as the thumb
 * first goes down the page, never as the bounce begins.
 *
 * Run against the module itself, on a window, a page and touches that answer what it asks of them: a clock, timers and
 * animations that run only as the test lets time pass (`play`, `glide`, `wait`).
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
    /** The animation playing on it, while one is (`phone` gives the boxes that may give an `animate`). */
    anim: null,
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
    // A name, or an attribute's (`[data-held]`).
    closest(sel) {
      const attr = /^\[([\w-]+)\]$/.exec(sel)?.[1];
      for (let n = this; n; n = n.parentElement) if (attr ? attr in n.attrs : n.name === sel) return n;
      return null;
    },
  };
  if (parent) parent.children.push(el);
  return el;
};

/** How far down the screen a translate puts a box ("0 37.5px" as written, "0px 37.5px" as read back): 0 for none. */
const yOf = (translate) => Number(/^0(?:px)? (-?[\d.e+-]+)px$/.exec(translate ?? "")?.[1] ?? 0);

/**
 * A phone's window over one page: the document's root, the route view (`main`) in it, a list in that, a row in the
 * list. The window is `tall` high over a document `long` long, scrolled to `at`. Its clock stands still until the test
 * moves it, and its timers and the animations on its boxes run as it does.
 */
const phone = ({ tall = 800, long = 2000, at = 0, root = {}, reduced = false } = {}) => {
  const html = element("html", { overscrollBehaviorY: "none", scrollPaddingTop: "146px", ...root });
  const main = element("main", {}, html);
  const list = element("list", {}, main);
  const row = element("row", {}, list);
  const heard = {};
  let clock = 1000;
  const timers = new Map();
  const anims = new Set();
  let made = 0;
  /** A web animation of `translate` on `el`: its frames, how long, and when it began (set late, as the deck sets it). */
  const animate =
    (el) =>
    (keyframes, { duration }) => {
      const a = {
        el,
        keyframes,
        duration,
        startTime: null,
        made: clock,
        onfinish: null,
        cancel() {
          if (el.anim === a) el.anim = null;
          anims.delete(a);
        },
      };
      el.anim = a;
      anims.add(a);
      return a;
    };
  main.animate = animate(main);
  list.animate = animate(list);
  /** Where an animation has its box at `now`: a straight line between the two frames either side. */
  const alongAt = (a, now) => {
    const share = Math.min(1, Math.max(0, now - (a.startTime ?? a.made)) / a.duration);
    const ks = a.keyframes;
    let i = 0;
    while (i < ks.length - 1 && ks[i + 1].offset <= share) i += 1;
    const k0 = ks[i];
    const k1 = ks[Math.min(i + 1, ks.length - 1)];
    const span = k1.offset - k0.offset;
    const part = span > 0 ? (share - k0.offset) / span : 0;
    return yOf(k0.translate) + (yOf(k1.translate) - yOf(k0.translate)) * part;
  };
  /** Where a box is drawn now: where its animation has it, else where its own style puts it. */
  const movedOf = (box) => (box.anim ? alongAt(box.anim, clock) : yOf(box.style.translate));
  const moved = () => movedOf(main);
  const win = {
    innerHeight: tall,
    scrollY: at,
    document: { documentElement: html, scrollingElement: { scrollHeight: long } },
    getComputedStyle: (el) => ({
      ...el.css,
      // As the browser reads a translate back: the animation's, else the one written, else none.
      translate: el.anim || el.style.translate ? `0px ${movedOf(el)}px` : el.css.translate,
      // A custom property is inherited: a row in the box of rows says what the box says.
      getPropertyValue(name) {
        for (let n = el; n; n = n.parentElement) if (n.css[name] !== undefined) return n.css[name];
        return "";
      },
    }),
    addEventListener: (kind, fn) => (heard[kind] = fn),
    removeEventListener: (kind, fn) => heard[kind] === fn && delete heard[kind],
    performance: { now: () => clock },
    setTimeout: (fn, ms) => (timers.set(++made, { at: clock + ms, fn }), made),
    clearTimeout: (id) => timers.delete(id),
    matchMedia: (query) => ({ matches: reduced && query.includes("prefers-reduced-motion: reduce") }),
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
  /** `ms` pass: each timer due by then fires at its time, and each animation over by then ends. */
  const advance = (ms) => {
    const until = clock + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      clock = Math.max(clock, due[1].at);
      due[1].fn();
    }
    clock = until;
    for (const a of [...anims]) {
      if ((a.startTime ?? a.made) + a.duration > clock) continue;
      a.cancel();
      a.onfinish?.();
    }
  };
  /** `ms` of the screen's frames, one each 16ms: answers where `box` was drawn in each. */
  const play = (ms, box = main) => {
    const drawn = [];
    for (let t = 0; t < ms; t += FRAME_MS) {
      advance(FRAME_MS);
      drawn.push(movedOf(box));
    }
    return drawn;
  };
  /** The window scrolls itself through `ys`, a step each 16ms, as a glide does once the thumb has let go: answers where `box` was drawn at each. */
  const glide = (ys, box = main) => {
    const shown = [];
    for (const y of ys) {
      advance(FRAME_MS);
      win.scrollY = y;
      heard.scroll();
      shown.push(movedOf(box));
    }
    return shown;
  };
  const wait = (ms) => advance(ms);
  const playing = (box) => box.anim !== null;
  return { win, html, main, list, row, heard, stop, finger, moved, movedOf, play, glide, wait, playing };
};

/** A frame of the screen's, in milliseconds. */
const FRAME_MS = 16;
/** How long the window may stand still before its glide is over (the module's FLING_GAP_MS), and a little more. */
const GLIDE_OVER_MS = 101;

/** A thumb flicks down the screen (the page goes up) or up it (`way` -1), and lets go mid-page. */
const flick = (p, way = 1, on) =>
  p
    .finger(on)
    .down(180, 400)
    .to(180, 400 + way * 30)
    .to(180, 400 + way * 90)
    .up();

/** From `from` to `to`, a step of `step` pixels each frame: the window's glide. */
const steps = (from, to, step) => {
  const ys = [];
  for (let y = from; step > 0 ? y < to : y > to; y += step) ys.push(y);
  return [...ys, to];
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

test("let go, the page goes back on the band's spring, never past its place, and is then left as it was", () => {
  const p = phone();
  const f = pull(p, 200);
  const held = p.moved();
  f.up();
  assert.equal(p.main.dataset.give, "back", "let go");
  assert.equal(p.moved(), held, "from where it stood, with no jump");
  assert.equal(p.main.style.translate, "0 0px", "what is written is where it rests: the animation plays over it");
  const drawn = p.play(1200);
  for (let i = 1; i < drawn.length; i += 1) assert.ok(drawn[i] <= drawn[i - 1], `always on its way back (${drawn})`);
  assert.ok(
    drawn.every((at) => at >= 0),
    "and never past its place",
  );
  const at400 = drawn[Math.round(400 / FRAME_MS) - 1];
  assert.ok(at400 > 0 && at400 < held * 0.15, `most of the way back 400ms on, landing softly (${at400} of ${held})`);
  assert.equal(p.main.dataset.give, undefined, "at rest within the second");
  assert.equal(p.main.style.translate, "", "no style of its own left on the page");
  assert.equal(p.playing(p.main), false, "and nothing left playing on it");
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
  assert.equal(between.main.dataset.give, "ready", "readied for the screen, and nothing more");
});

test("a page shorter than the screen gives either way", () => {
  const p = phone({ long: 800 });
  const f = pull(p, 120);
  assert.ok(p.moved() > 0);
  f.up();
  p.play(1200);
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
  assert.equal(p.main.dataset.give, undefined, "and the page is not even readied: a layer would take the strip too");
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
  p.play(160);
  const drawn = p.moved();
  assert.ok(drawn > 10, `part of the way back (${drawn})`);
  const f = p.finger(p.row, 2).down(180, 500);
  assert.equal(p.main.dataset.give, "held");
  assert.equal(p.moved(), drawn, "held where it was drawn");
  assert.equal(p.playing(p.main), false, "the spring let go of it");
  p.play(200);
  assert.equal(p.moved(), drawn, "and it stays");
  f.to(180, 520);
  assert.ok(p.moved() > drawn && p.moved() < drawn + 20, `on from there, with no jump (${p.moved()})`);
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
  p.play(1200);
  pull(p, 150);
  p.stop();
  assert.equal(p.main.style.translate, "", "let go at once");
  assert.equal(p.main.dataset.give, undefined);
  assert.deepEqual(Object.keys(p.heard), [], "every listener removed");
});

/* ----------------------------- what would give is readied for the screen ----------------------------- */

test("what would give is readied for its own layer as the thumb first goes down the page, and let go of once the gesture is over", () => {
  const p = phone({ at: 400 });
  const f = p.finger().down(180, 400);
  assert.equal(p.main.dataset.give, undefined, "a landing readies nothing");
  f.to(180, 412);
  assert.equal(p.main.dataset.give, "ready", "the first move down the page readies the route view");
  assert.equal(p.main.style.translate, "", "and moves nothing");
  f.up();
  assert.equal(p.main.dataset.give, "ready", "kept while the window may still glide");
  p.wait(GLIDE_OVER_MS);
  assert.equal(p.main.dataset.give, undefined, "let go of once the window has stood still for a beat");

  const tap = phone({ at: 400 });
  tap.finger().down(180, 400).up();
  assert.equal(tap.main.dataset.give, undefined, "a tap readies nothing");
  const across = phone({ at: 400 });
  across.finger().down(100, 400).to(140, 404).up();
  assert.equal(across.main.dataset.give, undefined, "nor a swipe across");
  const settings = phone({ at: 400 });
  settings.list.css.overscrollBehaviorY = "none";
  settings.finger().down(180, 400).to(180, 412).up();
  assert.equal(settings.main.dataset.give, undefined, "nor a page that holds still");
});

test("readied, it stays so through the glide, and is let go of as the glide stops, as the bounce settles, or at a touch", () => {
  const stops = phone({ at: 400 });
  flick(stops);
  stops.glide([360, 320, 280]);
  assert.equal(stops.main.dataset.give, "ready", "through the glide");
  stops.wait(GLIDE_OVER_MS);
  assert.equal(stops.main.dataset.give, undefined, "the glide stopped short of an end");

  const bounces = phone({ at: 400 });
  flick(bounces);
  bounces.glide(steps(360, 0, -40));
  assert.equal(bounces.main.dataset.give, "back", "the bounce took it over");
  bounces.play(1200);
  assert.equal(bounces.main.dataset.give, undefined, "settled, it is let go of");

  const tapped = phone({ at: 400 });
  flick(tapped);
  tapped.glide([360, 320, 280]);
  tapped.finger(tapped.row, 2).down(180, 500).up();
  assert.equal(tapped.main.dataset.give, undefined, "a tap on the gliding page ends the glide, and lets go");
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
  assert.equal(p.main.dataset.give, undefined, "nor was it readied: the rows were");
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

test("a list held under the row's page it opened is not the page on the screen: the row's page gives, and the list stays", () => {
  // People keeps its list under a person's page, held where it stood and out of sight (held-list.ts): it still says it
  // gives, and stood first, so it was taken for the person's rows.
  const p = rowsPage();
  p.list.attrs["data-held"] = "";
  Object.assign(p.list.css, { position: "fixed", visibility: "hidden" });
  const person = element("person", {}, p.main);
  pull(p, 150, person);
  assert.equal(p.movedOf(p.list), 0, "the held list stays where it is held");
  assert.ok(p.moved() > 20, `the person's page gives as a page does (${p.moved()})`);
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
  const drawn = p.play(160, p.list).at(-1);
  const f = p.finger(p.row, 2).down(180, 500);
  assert.equal(p.movedOf(p.list), drawn, "held where drawn");
  f.to(180, 520);
  assert.ok(p.movedOf(p.list) > drawn, "and on from there");
  assert.equal(p.moved(), 0, "the route view never moved");
});

/* --------------------------------- a flick that glides to an end --------------------------------- */

/** The furthest a box was drawn from its place, and the frame it was there in. */
const furthest = (drawn) => {
  const peak = drawn.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
  return { peak, at: (drawn.indexOf(peak) + 1) * FRAME_MS };
};

test("a flick that glides into the top carries the page on past it at its speed, and the spring brings it back", () => {
  const p = phone({ at: 400 });
  flick(p);
  // 2.5 pixels a millisecond: a quick flick's glide as it reaches the top.
  p.glide(steps(360, 0, -40));
  assert.equal(p.main.dataset.give, "back", "let go, on the spring");
  assert.equal(p.playing(p.main), true, "which the screen plays by itself");
  const drawn = p.play(1200);
  const { peak, at } = furthest(drawn);
  assert.ok(drawn[0] > 30 && drawn[0] < 40, `on at the glide's speed, 40px a frame and slowing (${drawn[0]})`);
  assert.ok(peak > 70 && peak < 90, `past the top by what that speed carries (${peak})`);
  assert.ok(at >= 80 && at <= 128, `at its furthest about 100ms on (${at}ms)`);
  assert.ok(
    drawn.every((d) => d >= 0),
    "and back without passing its place",
  );
  assert.equal(p.main.dataset.give, undefined, "at rest within the second");
  assert.equal(p.main.style.translate, "");
  assert.equal(p.playing(p.main), false);
});

test("the frame that hears the end carries the travel the end cut off, and a frame's worth at most however late it hears", () => {
  // Where the page is drawn in the frame that hears the end, the glide's last step `late` ms after the one before.
  const heardAt = (ys, late = 0) => {
    const p = phone({ at: 400 });
    flick(p);
    p.glide(ys.slice(0, -1));
    p.wait(late);
    return p.glide(ys.slice(-1))[0];
  };
  // Both glide at 2.5 pixels a millisecond. One lands on the top with its last step: nothing is owed. The other crossed
  // it 4ms into a step it had only 10px of left: the frame that hears it carries the 12ms it had already gone.
  const landed = heardAt(steps(360, 0, -40));
  const cut = heardAt([...steps(370, 10, -40), 0]);
  assert.equal(landed, 0);
  assert.ok(cut > 20 && cut < 30, `the 12ms it had already gone, at its speed (${cut})`);
  // Heard late (on a phone the screen scrolls ahead of the page): a frame's travel, never the frames missed caught up.
  const late = heardAt(steps(360, 0, -40), 34);
  assert.ok(late > 30 && late < 36, `one frame on (${late})`);
});

test("a flick that glides into the foot carries the page up past it", () => {
  const p = phone({ at: 900 });
  flick(p, -1);
  p.glide(steps(940, 1200, 40));
  const { peak } = furthest(p.play(1200));
  assert.ok(peak < -70 && peak > -90, `up past the foot (${peak})`);
  assert.equal(p.main.style.translate, "");
});

test("the harder the flick, the further past the end, but never past the fastest counted, nor far up the screen", () => {
  // Twenty frames of a glide `step` pixels a frame (up the page), its last landing on the top.
  const reach = (step) => {
    const p = phone({ at: -20 * step, long: 8000 });
    flick(p);
    p.glide(steps(-19 * step, 0, step));
    return furthest(p.play(1500)).peak;
  };
  const soft = reach(-16);
  const quick = reach(-48);
  const hard = reach(-96);
  const harder = reach(-320);
  assert.ok(soft < quick && quick < hard, `further the faster it comes (${soft}, ${quick}, ${hard})`);
  assert.equal(harder, hard, "a flick harder than the fastest counted goes no further");
  assert.ok(hard < 800 / 4, `a fifth of the screen at most (${hard})`);
});

test("a glide that drifts into the end slowly stops there, as it did", () => {
  const p = phone({ at: 30 });
  flick(p);
  p.glide(steps(28, 0, -2));
  p.play(400);
  assert.equal(p.moved(), 0);
  assert.equal(p.main.dataset.give, undefined);
});

test("a scroll the page makes by itself is never a glide: none let go, or the glide long stopped", () => {
  const none = phone({ at: 400 });
  none.glide(steps(360, 0, -40));
  none.play(300);
  assert.equal(none.moved(), 0, "no thumb let go: a list put back, a tap on the top");

  const stopped = phone({ at: 400 });
  flick(stopped);
  stopped.glide([360, 320, 280]);
  stopped.wait(300);
  stopped.glide(steps(240, 0, -40));
  stopped.play(300);
  assert.equal(stopped.moved(), 0, "the glide stopped, and what moved the page after was not the thumb's");

  const tapped = phone({ at: 400 });
  tapped.finger().down(180, 400).up();
  tapped.glide(steps(360, 0, -40));
  tapped.play(300);
  assert.equal(tapped.moved(), 0, "a tap is no flick");
});

test("a touch on the screen ends the glide, and the end it would have reached holds", () => {
  const p = phone({ at: 400 });
  flick(p);
  p.glide([360, 320, 280]);
  p.finger(p.row, 2).down(180, 500).up();
  p.glide(steps(240, 0, -40));
  p.play(300);
  assert.equal(p.moved(), 0);
});

test("a thumb that lands while the page is out past the end holds it there, and the pull goes on from there", () => {
  const p = phone({ at: 400 });
  flick(p);
  p.glide(steps(360, 0, -40));
  const out = p.play(64).at(-1);
  assert.ok(out > 40, `on its way out (${out})`);
  const f = p.finger(p.row, 2).down(180, 500);
  assert.equal(p.main.dataset.give, "held");
  assert.equal(p.moved(), out, "held where it was drawn");
  p.play(200);
  assert.equal(p.moved(), out, "the spring let go of it");
  f.to(180, 520);
  assert.ok(p.moved() > out, "pulled on from there");
  f.up();
  p.play(1500);
  assert.equal(p.main.style.translate, "");
});

test("a glide over what does not give is not heard: a sideways swipe, a box of its own, a dialog opened as it went", () => {
  const across = phone({ at: 400 });
  across.finger().down(100, 400).to(140, 404).to(220, 410).up();
  across.glide(steps(360, 0, -40));
  across.play(300);
  assert.equal(across.moved(), 0, "a swipe across the strip");

  const box = phone({ at: 400 });
  Object.assign(box.list, { scrollHeight: 900, clientHeight: 300 });
  box.list.css.overflowY = "auto";
  flick(box);
  box.glide(steps(360, 0, -40));
  box.play(300);
  assert.equal(box.moved(), 0, "a box that scrolls by itself bounces by itself");

  const dialog = phone({ at: 400 });
  flick(dialog);
  dialog.glide([360, 320, 280]);
  dialog.html.css.overflowY = "hidden";
  dialog.glide(steps(240, 0, -40));
  dialog.play(300);
  assert.equal(dialog.moved(), 0, "a sheet came up over the page as it glided");
  assert.equal(dialog.main.dataset.give, undefined, "and what was readied is let go of");
});

test("on a page of rows the glide carries the rows alone, and up past the foot only once the search is off the screen", () => {
  const top = rowsPage({ at: 400 });
  flick(top);
  top.glide(steps(360, 0, -40));
  const { peak } = furthest(top.play(1200, top.list));
  assert.ok(peak > 70, `the rows went on past the top (${peak})`);
  assert.equal(top.moved(), 0, "the route view held, and the search over the rows with it");
  assert.equal(top.bar.style.translate, "");

  const short = rowsPage({ long: 1000 });
  flick(short, -1);
  short.glide(steps(40, 200, 40));
  short.play(300, short.list);
  assert.equal(short.movedOf(short.list), 0, "the search is on the screen over the rows: they hold");
  assert.equal(short.list.dataset.give, undefined, "and are let go of");

  const long = rowsPage({ at: 1000 });
  long.list.top = -900;
  flick(long, -1);
  long.glide(steps(1040, 1200, 40));
  assert.ok(furthest(long.play(1200, long.list)).peak < -70, "a long list's rows go on up past the foot");
});

test("where motion is reduced a let-go puts the page back at once, and a glide stops at the end", () => {
  const p = phone({ reduced: true });
  pull(p, 200).up();
  assert.equal(p.main.style.translate, "", "back at once");
  assert.equal(p.main.dataset.give, undefined);
  assert.ok(pull(p, 150) && p.moved() > 0, "the thumb's own pull is still followed");

  const flung = phone({ at: 400, reduced: true });
  flick(flung);
  flung.glide(steps(360, 0, -40));
  flung.play(300);
  assert.equal(flung.moved(), 0);
  assert.equal(flung.playing(flung.main), false);
});
