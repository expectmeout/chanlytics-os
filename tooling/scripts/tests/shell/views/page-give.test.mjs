/**
 * The page's ends on a phone (apps/dashboard/src/surfaces/kit/motion/page-give.ts): the screen's own band, and the one
 * pull the page draws itself.
 *
 * The window scrolls a page on a phone, and past its ends the screen's own band carries it on and back, with what is
 * fixed holding: a glide that reaches an end and a thumb that scrolls on past one are the screen's, and nothing here
 * moves for them (1 Nov 2026: the bounce the page drew after a glide could never take over from the screen's own
 * without a stall or a jump). One pull is not the band's: a thumb pulling down a page at rest at its top, which Safari
 * takes for its pull to refresh, sliding the frame's top down with the page (Ruben, 19 Oct 2026). So while the page
 * rests at its top the root is marked and the band is off there (mobile.css), and that pull is drawn by the page: on
 * the band's curve, its rows alone where the page names them, and home on the band's spring, a web animation.
 *
 * Run against the module itself, on a window, a page and touches that answer what it asks of them: a clock, timers and
 * animations that run only as the test lets time pass (`play`, `wait`), and a root whose band is what mobile.css makes
 * it (off while marked at its top; on in an app on the home screen).
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
    hasAttribute(attr) {
      return attr in this.attrs;
    },
    toggleAttribute(attr, on) {
      if (on) this.attrs[attr] = "";
      else delete this.attrs[attr];
      return on;
    },
    removeAttribute(attr) {
      delete this.attrs[attr];
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

/** The root's mark while the page rests at its top, and how long the window stands still there before it rests. */
const PAGE_TOP = "data-page-top";
const REST_MS = 120;
/** A frame of the screen's, in milliseconds. */
const FRAME_MS = 16;

/**
 * A phone's window over one page: the document's root, the route view (`main`) in it, a list in that, a row in the
 * list. The window is `tall` high over a document `long` long, scrolled to `at`. The root's band is mobile.css's: off
 * while it is marked at its top, on in an app on the home screen (`standalone`), and whatever `root` says over that.
 */
const phone = ({ tall = 800, long = 2000, at = 0, root = {}, reduced = false, standalone = false } = {}) => {
  const html = element("html", { scrollPaddingTop: "146px", ...root });
  const main = element("main", {}, html);
  const list = element("list", {}, main);
  const row = element("row", {}, list);
  const heard = {};
  let clock = 1000;
  const timers = new Map();
  const anims = new Set();
  let made = 0;
  /** A web animation of `translate` on `el`: its frames, how long, and when it began. */
  const animate =
    (el) =>
    (keyframes, { duration }) => {
      const a = {
        keyframes,
        duration,
        began: clock,
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
    const share = Math.min(1, Math.max(0, now - a.began) / a.duration);
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
  /** The root's band as mobile.css makes it. */
  const band = () => root.overscrollBehaviorY ?? (standalone ? "contain" : PAGE_TOP in html.attrs ? "none" : "contain");
  const win = {
    innerHeight: tall,
    scrollY: at,
    document: { documentElement: html, scrollingElement: { scrollHeight: long } },
    getComputedStyle: (el) => ({
      ...el.css,
      ...(el === html && { overscrollBehaviorY: band() }),
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
  /** `ms` pass: each timer due by then fires at its time, and each animation over by then ends. */
  const wait = (ms) => {
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
      if (a.began + a.duration > clock) continue;
      a.cancel();
      a.onfinish?.();
    }
  };
  /** `ms` of the screen's frames, one each 16ms: answers where `box` was drawn in each. */
  const play = (ms, box = main) => {
    const drawn = [];
    for (let t = 0; t < ms; t += FRAME_MS) {
      wait(FRAME_MS);
      drawn.push(movedOf(box));
    }
    return drawn;
  };
  /** The window scrolled to `y`, as the screen scrolls it. */
  const scrollTo = (y) => {
    win.scrollY = y;
    heard.scroll();
  };
  /** A finger: lands at (x, y) on `on`, moves (`ms` after the last move), lets go. */
  const finger = (on = row, id = 1) => {
    const touch = (x, y) => ({ identifier: id, clientX: x, clientY: y });
    let last = null;
    return {
      down(x, y) {
        last = touch(x, y);
        heard.touchstart({ target: on, touches: [last], changedTouches: [last] });
        return this;
      },
      to(x, y, ms = 0) {
        if (ms) wait(ms);
        last = touch(x, y);
        heard.touchmove({ target: on, touches: [last], changedTouches: [last] });
        return this;
      },
      up(ms = 0) {
        if (ms) wait(ms);
        heard.touchend({ target: on, touches: [], changedTouches: [last] });
        return this;
      },
    };
  };
  const playing = (box) => box.anim !== null;
  const marked = () => PAGE_TOP in html.attrs;
  return {
    win,
    html,
    main,
    list,
    row,
    heard,
    stop,
    finger,
    moved,
    movedOf,
    play,
    wait,
    scrollTo,
    playing,
    marked,
    band,
  };
};

/** A pull of `by` pixels down the screen (up where negative), in ten steps `ms` apart, from (180, 300). */
const pull = (p, by, on, ms = 0) => {
  const f = p.finger(on).down(180, 300);
  for (let i = 1; i <= 10; i += 1) f.to(180, 300 + (by * i) / 10, ms);
  return f;
};

/** The furthest a box was drawn from its place. */
const furthest = (drawn) => drawn.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);

/* ----------------------------- the page at rest at its top ----------------------------- */

test("a page at rest at its top turns the screen's band off there, and back on the moment it scrolls", () => {
  const p = phone();
  assert.equal(p.marked(), true, "drawn at its top, it rests there");
  assert.equal(p.band(), "none", "and the screen's band is off there, so Safari never pulls it to refresh");
  p.scrollTo(40);
  assert.equal(p.marked(), false, "scrolled from it, at once");
  assert.equal(p.band(), "contain", "and a glide back to the top bands as the screen bands");
  p.scrollTo(0);
  assert.equal(p.marked(), false, "back at the top, it has not rested yet");
  p.wait(REST_MS);
  assert.equal(p.marked(), true, "once the window has stood still there");
});

test("a page banding past its top is never marked at rest: the band is turned off only once it is home", () => {
  const p = phone({ at: 300 });
  assert.equal(p.marked(), false, "drawn part way down, its band is on");
  p.scrollTo(0);
  p.scrollTo(-30);
  p.wait(REST_MS * 3);
  assert.equal(p.marked(), false, "a band held stretched by a thumb holding still");
  p.scrollTo(-12);
  p.scrollTo(-3);
  p.scrollTo(0);
  p.wait(REST_MS - 1);
  assert.equal(p.marked(), false, "home, but not yet still");
  p.wait(1);
  assert.equal(p.marked(), true);
});

/* ------------------------------ the pull it draws at rest ------------------------------ */

test("a pull down a page at rest at its top moves it on the band's curve, less the further it goes, never the screen's height", () => {
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

test("let go, it goes home on the band's spring, played by the screen, never past its place, and is then left as it was", () => {
  const p = phone();
  const f = pull(p, 200);
  const held = p.moved();
  f.up(STILL);
  assert.equal(p.main.dataset.give, "back", "let go");
  assert.equal(p.playing(p.main), true, "a web animation the compositor plays");
  assert.equal(p.moved(), held, "from where it stood, with no jump");
  assert.equal(p.main.style.translate, "0 0px", "what is written is where it rests: the animation plays over it");
  const drawn = p.play(1200);
  for (let i = 1; i < drawn.length; i += 1) assert.ok(drawn[i] <= drawn[i - 1], `always on its way home (${drawn})`);
  assert.ok(
    drawn.every((at) => at >= 0),
    "and never past its place",
  );
  const at400 = drawn[Math.round(400 / FRAME_MS) - 1];
  assert.ok(at400 > 0 && at400 < held * 0.15, `most of the way home 400ms on, landing softly (${at400} of ${held})`);
  assert.equal(p.main.dataset.give, undefined, "at rest within the second");
  assert.equal(p.main.style.translate, "", "no style of its own left on the page");
  assert.equal(p.playing(p.main), false);
});

/** Long enough that a thumb that stood still before letting go let the page go at rest. */
const STILL = 60;

test("let go still pulling, it goes on a little before it comes home; let go at rest, it comes straight home", () => {
  const p = phone();
  pull(p, 200, undefined, FRAME_MS).up();
  const held = p.moved();
  const flung = p.play(1200);
  const peak = furthest(flung);
  assert.ok(peak > held && peak < held + 40, `on past where it was let go, a little (${held} to ${peak})`);
  assert.ok(
    flung.every((at) => at >= 0),
    "and home without passing its place",
  );
  assert.equal(p.main.style.translate, "");

  const still = phone();
  const f = pull(still, 200, undefined, FRAME_MS);
  const stood = still.moved();
  f.up(STILL);
  const settled = still.play(1200);
  assert.ok(settled[0] < stood, `no further out than where the thumb stood (${stood}, then ${settled[0]})`);
  for (let i = 1; i < settled.length; i += 1) assert.ok(settled[i] <= settled[i - 1], "straight home");
});

test("where the screen's band is on, the band is the screen's: an app on the home screen, a pull that reaches the top from a scroll", () => {
  const app = phone({ standalone: true });
  assert.equal(app.marked(), true);
  pull(app, 150);
  assert.equal(app.moved(), 0, "no pull to refresh there: the screen bands at its top too, with what is fixed holding");
  assert.equal(app.main.dataset.give, undefined);

  const scrolled = phone({ at: 300 });
  const f = scrolled.finger().down(180, 300);
  scrolled.scrollTo(0);
  for (let y = 312; y <= 450; y += 12) f.to(180, y);
  assert.equal(scrolled.moved(), 0, "a thumb that scrolled up to the top and pulls on bands with the screen");
  f.up();
});

test("a pull up at rest at the top scrolls the page, and a page shorter than the screen gives either way", () => {
  const long = phone();
  pull(long, -150);
  assert.equal(long.moved(), 0, "the window scrolls the page down: the screen's");
  const short = phone({ long: 800 });
  const f = pull(short, 120);
  assert.ok(short.moved() > 0);
  f.up();
  short.play(1200);
  pull(short, -120);
  assert.ok(short.moved() < 0, "nothing to scroll, it gives up past its foot");
});

test("a thumb that goes back past where the pull began hands the page back to the window at its place", () => {
  const p = phone();
  const f = pull(p, 120);
  assert.ok(p.moved() > 0);
  f.to(180, 300).to(180, 260);
  assert.equal(p.moved(), 0, "at its place, and the window's scroll is its own again");
  f.up();
  assert.equal(p.main.dataset.give, undefined);
});

test("a sideways swipe moves nothing: the strip's walk is the deck's", () => {
  const p = phone();
  const f = p.finger().down(100, 300);
  for (let x = 120; x <= 300; x += 20) f.to(x, 310);
  assert.equal(p.moved(), 0);
  assert.equal(p.main.dataset.give, undefined);
});

test("a dialog that holds the page, a desk's page in a box of its own, and the deck moving the page leave a pull alone", () => {
  const dialog = phone({ root: { overflowY: "hidden" } });
  pull(dialog, 150);
  assert.equal(dialog.moved(), 0, "a sheet or the drawer is open");
  const desk = phone();
  desk.main.css.overflowY = "auto";
  pull(desk, 150);
  assert.equal(desk.moved(), 0, "the route view scrolls itself");
  const deck = phone();
  deck.main.style.transform = "translate3d(-120px, 0, 0)";
  pull(deck, 150);
  assert.equal(deck.moved(), 0);
  assert.equal(deck.main.style.transform, "translate3d(-120px, 0, 0)");
});

test("what the thumb is on may say it holds still, scroll by itself, stand fixed, take its own drag: then nothing moves", () => {
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
  pull(outside, 150, element("tab-bar"));
  assert.equal(outside.moved(), 0, "a touch outside the route view: the frame's top, the tab bar");

  const map = phone();
  map.list.css.touchAction = "none";
  pull(map, 150);
  assert.equal(map.moved(), 0, "touch-action none: the map pans itself");
  const marked = phone();
  marked.list.attrs["data-own-drag"] = "";
  pull(marked, 150);
  assert.equal(marked.moved(), 0, "data-own-drag");
  const strip = phone();
  strip.list.css.touchAction = "pan-y";
  pull(strip, 150);
  assert.ok(strip.moved() > 0, "a strip page that leaves the vertical pan to the browser still gives");
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

test("a thumb that lands on the page going home holds it where it is drawn, and the pull goes on from there", () => {
  const p = phone();
  pull(p, 300).up(STILL);
  p.play(160);
  const drawn = p.moved();
  assert.ok(drawn > 10, `part of the way home (${drawn})`);
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

test("a second finger lets the page go home; stopping lets it go, takes the root's mark off and hears no more", () => {
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
  assert.equal(p.marked(), false, "the screen's band is the stylesheet's alone again");
  assert.deepEqual(Object.keys(p.heard), [], "every listener removed");
});

test("where motion is reduced a let-go puts the page back at once", () => {
  const p = phone({ reduced: true });
  pull(p, 200).up();
  assert.equal(p.main.style.translate, "", "home at once");
  assert.equal(p.main.dataset.give, undefined);
  assert.equal(p.playing(p.main), false);
  assert.ok(pull(p, 150) && p.moved() > 0, "the thumb's own pull is still followed");
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
  const f = pull(p, 150);
  assert.ok(p.movedOf(p.list) > 20, `the rows came down (${p.movedOf(p.list)})`);
  assert.equal(p.list.dataset.give, "held");
  assert.equal(p.moved(), 0, "the route view did not move");
  assert.equal(p.bar.style.translate, "", "nor the search over the rows");
  f.up(STILL);
  assert.equal(p.playing(p.list), true, "and the rows go home on the spring");
  p.play(1200, p.list);
  assert.equal(p.list.style.translate, "");
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

test("rows go up past a short page's foot only once nothing over them is on the screen", () => {
  const short = rowsPage({ long: 800 });
  pull(short, -150);
  assert.equal(short.movedOf(short.list), 0, "the search is on the screen over the rows");
  short.finger().down(180, 300);
  pull(short, 150);
  assert.ok(short.movedOf(short.list) > 0, "down past the top they still give");
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

test("rows caught going home are held where they are drawn, and the pull goes on from there", () => {
  const p = rowsPage();
  pull(p, 300).up(STILL);
  const drawn = p.play(160, p.list).at(-1);
  const f = p.finger(p.row, 2).down(180, 500);
  assert.equal(p.movedOf(p.list), drawn, "held where drawn");
  f.to(180, 520);
  assert.ok(p.movedOf(p.list) > drawn, "and on from there");
  assert.equal(p.moved(), 0, "the route view never moved");
});
