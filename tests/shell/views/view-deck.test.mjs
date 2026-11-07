/**
 * One motion for every strip of views: the deck (apps/dashboard/src/surfaces/kit/motion/view-deck.ts).
 *
 * A change of view was two animations with nothing between them but the moment React committed: the page leaving was
 * cut wherever that fell, and the page arriving began 40px to its side whatever the first had been doing (measured
 * frame by frame, 8 Oct 2026: docs/superpowers/specs/2026-10-08-one-motion-for-every-strip-design.md). The deck puts
 * both on one timeline: it starts at the press, or where the finger left the page and at its speed; the page leaving
 * never waits; the page arriving joins where it should already be; and the node React took away is put back as a still
 * copy until it has left.
 *
 * Run against the deck itself, on elements and a clock that answer what it asks of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "../../shared/_until.mjs";

const {
  CROSS_FADE_MS,
  JOIN_FADE_MS,
  SUCCESSOR_WAIT_MS,
  TIMELINE_MS,
  createDeck,
  speedAt,
  springAt,
  travelOf,
  viewDeck,
} = await import("../../../apps/dashboard/src/surfaces/kit/motion/view-deck.ts");

/* ------------------------------ what stands in for a browser ------------------------------ */

/** An animation as the deck starts one: what it was given, when it was told it began, and the test's hand on its end. */
const animation = (keyframes, options) => {
  let done;
  let failed;
  const finished = new Promise((resolve, reject) => {
    done = resolve;
    failed = reject;
  });
  finished.catch(() => {});
  return {
    keyframes,
    options,
    startTime: null,
    finished,
    cancelled: false,
    finish: () => done(),
    cancel() {
      this.cancelled = true;
      failed(new Error("cancelled"));
    },
  };
};

/** What holds a view: it records what is put into it, and where. */
const holder = () => ({
  put: [],
  insertBefore(node, before) {
    this.put.push([node, before]);
    node.parentNode = this;
    node.isConnected = true;
  },
});

/** A view: an element that answers what the deck asks of one. */
const view = (over = {}) => {
  const node = {
    style: {},
    dataset: {},
    attrs: { id: "main", "data-testid": "the-page" },
    classes: new Set(),
    isConnected: true,
    parentNode: holder(),
    offsetParent: { getBoundingClientRect: () => ({ left: 10, top: 40 }), clientLeft: 0, clientTop: 0 },
    rect: { left: 10, top: 140, width: 375, height: 600 },
    place: 0,
    anims: [],
    marked: [],
    inside: [],
    removed: false,
    getBoundingClientRect() {
      return this.rect;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    querySelectorAll() {
      return this.marked;
    },
    addEventListener(kind, heard) {
      this.hears = heard;
    },
    removeEventListener() {},
    contains(other) {
      return other === this || this.inside.includes(other);
    },
    animate(keyframes, options) {
      const made = animation(keyframes, options);
      this.anims.push(made);
      return made;
    },
    remove() {
      this.removed = true;
      this.isConnected = false;
    },
    ...over,
  };
  node.classList = { add: (name) => node.classes.add(name), remove: (name) => node.classes.delete(name) };
  return node;
};

/** The world a deck stands in: a clock the test moves, the travel the tokens say, and what was asked for later. */
const world = (over = {}) => {
  const w = {
    clock: 1000,
    reduced: false,
    token: "100%",
    waits: [],
    ...over,
  };
  w.deck = createDeck({
    now: () => w.clock,
    reduced: () => w.reduced,
    travel: () => w.token,
    placeOf: (el) => el.place,
    later: (ms, fn) => w.waits.push({ ms, fn }),
  });
  return w;
};

/** React takes a view away and mounts the next in one commit: the old ref hears null, the node leaves the page, the new ref hears its element. */
const replace = (seat, old, next) => {
  seat(null);
  old.isConnected = false;
  old.parentNode = null;
  seat(next);
};

const across = (frame) => Number(/translate3d\((-?[\d.]+)px/.exec(frame.transform)?.[1]);
const moving = (el) => el.anims.filter((a) => a.keyframes.some((k) => "transform" in k) && !a.cancelled);
const fading = (el) => el.anims.filter((a) => a.keyframes.every((k) => !("transform" in k)) && !a.cancelled);
const settle = () => new Promise((resolve) => setImmediate(resolve));

/* ------------------------------------- the timeline -------------------------------------- */

test("the spring ends on its target, never passes it, never turns back, and is the same to either side", () => {
  let last = 0;
  for (let ms = 0; ms <= TIMELINE_MS; ms += 10) {
    const at = springAt(0, -375, 0, ms);
    assert.ok(at <= last + 1e-9, `moving one way at ${ms} ms`);
    assert.ok(at >= -375 - 1e-9, `never past the far side at ${ms} ms`);
    assert.ok(Math.abs(springAt(0, 375, 0, ms) + at) < 1e-9, "mirrored");
    last = at;
  }
  assert.ok(Math.abs(springAt(0, -375, 0, TIMELINE_MS) + 375) < 1, "there by the timeline's end");
  assert.equal(springAt(0, -375, 0, 0), 0, "and it starts where it is");
});

test("most of a slide is over early: 89% there at 100 ms, 98% at 150 ms", () => {
  const at100 = springAt(0, -375, 0, 100);
  const at150 = springAt(0, -375, 0, 150);
  assert.ok(at100 <= -330 && at100 >= -340, `at 100 ms: ${at100}`);
  assert.ok(at150 <= -363 && at150 >= -371, `at 150 ms: ${at150}`);
});

test("a page let go at the finger's speed starts at that speed: no pause where the finger lifted", () => {
  const from = -210;
  const step = springAt(from, -375, -1.4, 10) - from;
  assert.ok(step < -10, `about the finger's 14px in the first 10 ms, not a crawl (it moved ${step.toFixed(1)}px)`);
  assert.ok(Math.abs(speedAt(from, -375, -1.4, 0) + 1.4) < 1e-9);
});

test("a flick however fast does not carry the page past its place and back", () => {
  for (let ms = 0; ms <= TIMELINE_MS; ms += 5) {
    assert.ok(springAt(-300, -375, -9, ms) >= -375 - 1e-9, `at ${ms} ms`);
  }
});

test("how far a page travels is the token's: its own width where the token says all of it, else the pixels written", () => {
  assert.equal(travelOf("100%", 375), 375);
  assert.equal(travelOf(" 56px ", 1034), 56);
  assert.equal(travelOf("", 1034), 56, "a page with no token travels a desk's length");
  assert.equal(travelOf(" none ", 375), 0, "and one that holds still, nowhere");
});

/* ------------------------------------ a change of view ----------------------------------- */

test("a press starts the page on screen leaving at once, toward the side it is going to", () => {
  const w = world();
  const a = view();
  w.deck.view("frame")(a);
  const move = w.deck.leave(1);
  assert.equal(move.dir, 1);
  assert.equal(move.t0, 1000, "the timeline starts at the press");
  const [slide] = moving(a);
  assert.equal(slide.startTime, 1000);
  assert.equal(slide.options.duration, TIMELINE_MS);
  assert.equal(across(slide.keyframes[0]), 0);
  assert.equal(across(slide.keyframes.at(-1)), -375, "a page's width away, to the left for the next");
  assert.equal(slide.keyframes[0].offset, 0);
  assert.equal(slide.keyframes.at(-1).offset, 1);
  const [fade] = fading(a);
  assert.equal(fade.keyframes[0].opacity, 1);
  assert.equal(fade.keyframes.at(-1).opacity, 0.5, "half gone as it leaves the screen");
});

test("the page arriving joins the same timeline, attached to the one leaving, however late React commits", () => {
  const w = world();
  const seat = w.deck.view("frame");
  const a = view();
  seat(a);
  w.deck.leave(1);
  w.clock = 1120;
  const b = view({ dataset: { slide: "next" } });
  replace(seat, a, b);
  const [slide] = moving(b);
  assert.equal(slide.startTime, 1000, "it began when the press did, 120 ms ago");
  assert.equal(across(slide.keyframes[0]), 375, "a page's width behind the one leaving");
  assert.equal(across(slide.keyframes.at(-1)), 0);
  const out = moving(a).at(-1);
  for (let i = 0; i < slide.keyframes.length; i += 4) {
    assert.ok(Math.abs(across(slide.keyframes[i]) - across(out.keyframes[i]) - 375) < 1e-6, "attached at every frame");
  }
  const [join] = fading(b);
  assert.equal(join.startTime, 1120, "and it fades in from where it joins");
  assert.equal(join.options.duration, JOIN_FADE_MS);
  assert.equal(join.keyframes[0].opacity, 0);
});

test("the page React took away is put back as a still copy where it stood, and removed once it has left", async () => {
  const w = world();
  const seat = w.deck.view("frame");
  const a = view();
  const hold = a.parentNode;
  const b = view({ dataset: { slide: "next" }, parentNode: hold });
  const inner = {
    attrs: { id: "pg-act", "data-testid": "row" },
    removeAttribute(n) {
      delete this.attrs[n];
    },
  };
  a.marked = [inner];
  seat(a);
  w.deck.leave(1);
  w.clock = 1090;
  replace(seat, a, b);
  assert.deepEqual(hold.put, [[a, b]], "before the page that replaced it, so the new one is drawn over it");
  assert.equal(a.attrs.inert, "");
  assert.equal(a.attrs["aria-hidden"], "true");
  assert.equal(a.attrs.id, undefined, "no id a script or a label could find");
  assert.equal(a.attrs["data-testid"], undefined);
  assert.deepEqual(inner.attrs, {}, "nor on anything inside it");
  assert.ok(a.classes.has("view-leaving"));
  assert.deepEqual(
    [a.style.left, a.style.top, a.style.width, a.style.height],
    ["0px", "100px", "375px", "600px"],
    "over where it stood, measured from what holds it",
  );
  // A view placed by a margin of its page's own (Reports' lens body, 12px into the gutter on a phone) stood that far off:
  // the copy's box is the measured one, with no margin of the page's added to it.
  assert.deepEqual([a.style.margin, a.style.boxSizing], ["0", "border-box"]);
  const out = moving(a).at(-1);
  assert.equal(out.startTime, 1000, "still on the timeline it left on");
  assert.equal(a.removed, false);
  for (const anim of [...a.anims, ...b.anims]) anim.finish();
  await settle();
  assert.equal(a.removed, true, "gone when it has left");
  assert.ok(
    b.anims.every((x) => x.cancelled),
    "and the page that arrived rests as itself, nothing left on it",
  );
});

test("a page let go by a finger is put back where it rests, not where the finger had carried it", () => {
  // Measured as the finger lifted, the page was 210px to the left, and its copy was placed there and then moved again
  // by the same 210: it stood a page and a half from the one arriving (8 Oct 2026, the first run in a browser).
  const w = world();
  const seat = w.deck.view("frame");
  const a = view();
  seat(a);
  w.deck.drag(-210);
  a.rect = { ...a.rect, left: a.rect.left - 210 };
  w.deck.leave(1);
  const b = view({ dataset: { slide: "next" }, parentNode: a.parentNode });
  replace(seat, a, b);
  assert.equal(a.style.left, "0px");
  assert.equal(across(moving(a).at(-1).keyframes[0]), -210, "the animation is what carries it from there");
});

test("a change nobody pressed for (the browser's Back, a key) starts both pages as the new one mounts", () => {
  const w = world();
  const seat = w.deck.view("frame");
  const a = view();
  seat(a);
  w.clock = 2000;
  const b = view({ dataset: { slide: "prev" }, parentNode: a.parentNode });
  replace(seat, a, b);
  const out = moving(a).at(-1);
  const into = moving(b).at(-1);
  assert.equal(out.startTime, 2000);
  assert.equal(into.startTime, 2000);
  assert.equal(across(out.keyframes.at(-1)), 375, "the page before leaves to the right");
  assert.equal(across(into.keyframes[0]), -375, "and the one arriving comes from the left");
});

test("a view that says no side is left alone, and what it replaced is not put back", () => {
  const w = world();
  const seat = w.deck.view("frame");
  const a = view();
  seat(a);
  const b = view({ parentNode: a.parentNode });
  replace(seat, a, b);
  assert.equal(b.anims.length, 0);
  assert.deepEqual(a.parentNode, null);
  assert.equal(b.parentNode.put.length, 0);
});

// A view whose page draws each view in place says it holds still (`--view-travel: none`): the Calendar's days on a phone,
// where every end of a move stepped a pixel on an iPhone (spec 2026-11-03, a still Calendar on a phone).
test("a view that holds still is cut in: a press, its arrival and a finger move and fade nothing", () => {
  const w = world({ token: "none" });
  const seat = w.deck.view("frame");
  const a = view();
  seat(a);
  assert.equal(w.deck.leave(1), null, "a press starts nothing");
  assert.equal(a.anims.length, 0);
  assert.equal(w.deck.walks(), true, "a finger still walks the strip over it");
  assert.equal(w.deck.drag(-120), 0);
  assert.equal(a.style.transform, undefined, "and nothing follows the finger");
  assert.equal(a.style.opacity, undefined);
  assert.equal(w.deck.settle(), null);
  const b = view({ dataset: { slide: "next" }, parentNode: a.parentNode });
  replace(seat, a, b);
  assert.equal(b.anims.length, 0, "the next is there at once");
  assert.equal(b.parentNode.put.length, 0, "and what it replaced is not put back");
  assert.equal(w.waits.length, 0, "nothing waits to come back");
});

test("a second press starts from where the page is, on a timeline of its own", () => {
  const w = world();
  const seat = w.deck.view("frame");
  const a = view();
  seat(a);
  w.deck.leave(1);
  w.clock = 1100;
  const b = view({ dataset: { slide: "next" }, parentNode: a.parentNode });
  replace(seat, a, b);
  w.clock = 1180;
  b.place = 96;
  const again = w.deck.leave(1);
  assert.equal(again.t0, 1180);
  const slide = moving(b).at(-1);
  assert.equal(across(slide.keyframes[0]), 96, "from where it had got to, not from rest and not from its end");
  assert.equal(across(slide.keyframes.at(-1)), -375);
  assert.equal(a.removed, false, "and the copy still leaving is left to finish");
});

test("a page still arriving when it is replaced fades out where it is", async () => {
  const w = world();
  const seat = w.deck.view("frame");
  const a = view();
  seat(a);
  w.deck.leave(1);
  w.clock = 1040;
  const b = view({ dataset: { slide: "next" }, parentNode: a.parentNode });
  replace(seat, a, b);
  w.clock = 1070;
  const c = view({ dataset: { slide: "next" }, parentNode: b.parentNode ?? a.parentNode });
  const hold = b.parentNode;
  seat(null);
  b.isConnected = false;
  b.parentNode = null;
  c.parentNode = hold;
  seat(c);
  const fade = fading(b).at(-1);
  assert.equal(fade.keyframes.at(-1).opacity, 0);
  assert.equal(fade.options.duration, JOIN_FADE_MS);
  for (const anim of b.anims) anim.finish();
  await settle();
  assert.equal(b.removed, true);
});

test("a page asked to leave that nothing replaces comes back", async () => {
  const w = world();
  const a = view();
  w.deck.view("frame")(a);
  w.deck.leave(1);
  assert.equal(w.waits.length, 1);
  assert.equal(w.waits[0].ms, TIMELINE_MS + SUCCESSOR_WAIT_MS);
  w.clock = 1000 + TIMELINE_MS + SUCCESSOR_WAIT_MS;
  a.place = -375;
  w.waits[0].fn();
  const back = moving(a).at(-1);
  assert.equal(across(back.keyframes[0]), -375);
  assert.equal(across(back.keyframes.at(-1)), 0, "back where it stood");
  for (const anim of a.anims) if (!anim.cancelled) anim.finish();
  await settle();
  assert.ok(
    a.anims.every((x) => x.cancelled),
    "and nothing is left on it",
  );
});

test("a shorter slide is no shorter wait: a page that left waits 1,660 ms from the press for the next, however long the slide", () => {
  const w = world();
  const a = view();
  w.deck.view("frame")(a);
  w.deck.leave(1);
  assert.equal(w.waits[0].ms, 1660, "a slow page takes as long to come as it did when the slide took 460 ms");
});

test("a page told to stay after all comes back at once, and one at rest is left alone", () => {
  const w = world();
  const a = view();
  w.deck.view("frame")(a);
  w.deck.stay();
  assert.equal(a.anims.length, 0);
  w.deck.leave(1);
  w.clock = 1100;
  a.place = -223;
  w.deck.stay();
  const back = moving(a).at(-1);
  assert.equal(back.startTime, 1100);
  assert.equal(across(back.keyframes[0]), -223);
  assert.equal(across(back.keyframes.at(-1)), 0);
});

test("a page that was replaced does not come back", () => {
  const w = world();
  const seat = w.deck.view("frame");
  const a = view();
  seat(a);
  w.deck.leave(1);
  const b = view({ dataset: { slide: "next" }, parentNode: a.parentNode });
  replace(seat, a, b);
  const before = [a.anims.length, b.anims.length];
  w.waits[0].fn();
  assert.deepEqual([a.anims.length, b.anims.length], before);
});

/* -------------------------------------- the finger --------------------------------------- */

test("the page follows the finger, fading as it goes where it travels its whole width", () => {
  const w = world();
  const a = view();
  w.deck.view("frame")(a);
  assert.equal(w.deck.drag(-75), 0.2, "and it says how far of the way it has gone");
  assert.equal(a.style.transform, "translate3d(-75px, 0, 0)");
  assert.equal(a.style.opacity, "0.9", "a fifth of the way: a tenth gone");
  w.deck.drag(150);
  assert.equal(a.style.transform, "translate3d(150px, 0, 0)");
  assert.equal(a.style.opacity, "0.8");
});

test("let go short, it settles back from where the finger left it, and nothing is left on it", async () => {
  const w = world();
  const a = view();
  w.deck.view("frame")(a);
  w.deck.drag(-60);
  const home = w.deck.settle();
  const back = moving(a).at(-1);
  assert.equal(across(back.keyframes[0]), -60);
  assert.equal(across(back.keyframes.at(-1)), 0);
  assert.equal(a.style.transform, "", "the animation holds it now, not the finger's style");
  assert.equal(a.style.opacity, "");
  // The strip's highlight goes back in step with it: the share of the way it had gone, down to none.
  const pill = view({ attrs: {} });
  const glide = home.follow(pill, (progress) => ({ transform: `translate3d(${100 * progress}px, 0, 0)` }));
  assert.equal(across(glide.keyframes[0]), 16);
  assert.equal(across(glide.keyframes.at(-1)), 0);
  back.finish();
  await settle();
  assert.ok(a.anims.every((x) => x.cancelled));
});

test("let go past the line, it leaves from where the finger left it and at the finger's speed", () => {
  const w = world();
  const a = view();
  w.deck.view("frame")(a);
  w.deck.drag(-210);
  w.deck.letGo(-1.4);
  const move = w.deck.leave(1);
  assert.equal(move.from, -210);
  const slide = moving(a).at(-1);
  assert.equal(across(slide.keyframes[0]), -210);
  assert.ok(across(slide.keyframes[1]) < -230, "moving on at the finger's pace in its first frame");
  assert.equal(a.style.transform, "");
  assert.equal(fading(a).at(-1).keyframes[0].opacity, 1 - 0.5 * (210 / 375));
});

test("a finger walks a page only where the page travels its own width", () => {
  const phone = world();
  phone.deck.view("frame")(view());
  assert.equal(phone.deck.walks(), true);
  const desk = world({ token: "56px" });
  desk.deck.view("frame")(view({ rect: { left: 246, top: 146, width: 1034, height: 654 } }));
  assert.equal(desk.deck.walks(), false);
  assert.equal(world().deck.walks(), false, "and never where no view is on the page");
  const still = world({ reduced: true });
  still.deck.view("frame")(view());
  assert.equal(still.deck.walks(), true, "reduced motion keeps the finger's own");
});

/* ----------------------------------- which view moves ------------------------------------ */

test("a page with views of its own moves its own view, not the frame's", () => {
  const w = world();
  const main = view();
  const body = view({ attrs: {} });
  main.inside = [body];
  w.deck.view("reports")(body);
  w.deck.view("frame")(main);
  w.deck.drag(-40);
  assert.equal(body.style.transform, "translate3d(-40px, 0, 0)");
  assert.equal(main.style.transform, undefined);
  w.deck.view("reports")(null);
  body.isConnected = false;
  w.deck.drag(-40);
  assert.equal(main.style.transform, "translate3d(-40px, 0, 0)", "and the frame's once the page has gone");
});

test("a ref React calls twice for one element (development's check) is one view, arriving once", () => {
  const w = world();
  const seat = w.deck.view("frame");
  const a = view();
  seat(a);
  const b = view({ dataset: { slide: "next" }, parentNode: a.parentNode });
  replace(seat, a, b);
  const had = b.anims.length;
  seat(null);
  seat(b);
  assert.equal(b.anims.length, had);
  assert.equal(b.parentNode.put.length, 1);
});

// An iPhone draws a moving view on a layer of its own and draws it on the page again as the move ends, and what was on
// a fraction of a pixel lands a pixel off (docs/superpowers/specs/2026-11-03-a-still-calendar-on-a-phone-design.md): Leads
// and the Pipeline stepped a pixel up the frame after their slide stopped, and down as a drag took them (Ruben's
// recording, 7 Nov 2026). A view that says it rests on its layer keeps its arrival's last frame until the page is next
// touched, when what follows moves the page anyway; nothing of the page can open over it before then.
const layered = (touched) => {
  const w = world();
  w.deck = createDeck({
    now: () => w.clock,
    reduced: () => w.reduced,
    travel: () => w.token,
    placeOf: (el) => el.place,
    later: (ms, fn) => w.waits.push({ ms, fn }),
    rest: () => "layer",
    untilTouched: (fn) => touched.push(fn),
  });
  return w;
};

test("a view inside another that rests on its layer keeps its arrival's last frame until the page is touched", async () => {
  const touched = [];
  const w = layered(touched);
  const main = view();
  const a = view({ attrs: {} });
  main.inside = [a];
  w.deck.view("frame")(main);
  const seat = w.deck.view("scope");
  seat(a);
  const b = view({ attrs: {}, dataset: { slide: "next" }, parentNode: a.parentNode });
  main.inside.push(b);
  replace(seat, a, b);
  const [travel] = moving(b);
  assert.equal(travel.options.fill, "forwards", "its last frame held");
  travel.finish();
  for (const f of fading(b)) f.finish();
  await until(() => touched.length === 1, "the slide over, a wait for the page's touch");
  assert.equal(moving(b).length, 1, "still on its layer once the slide is over");
  touched[0]();
  assert.equal(moving(b).length, 0, "touched, it is drawn on the page again");
});

test("a held view taken by a finger or asked to leave lets go of its hold first, and a late touch takes nothing of what followed", async () => {
  const touched = [];
  const w = layered(touched);
  const main = view();
  const a = view({ attrs: {} });
  main.inside = [a];
  w.deck.view("frame")(main);
  const seat = w.deck.view("scope");
  seat(a);
  const b = view({ attrs: {}, dataset: { slide: "next" }, parentNode: a.parentNode });
  main.inside.push(b);
  replace(seat, a, b);
  for (const anim of b.anims) anim.finish();
  await until(() => touched.length === 1, "the slide over, a wait for the page's touch");
  const [held] = moving(b);
  w.deck.drag(-40);
  assert.equal(held.cancelled, true, "the finger's transform is not under a held frame");
  assert.equal(b.style.transform, "translate3d(-40px, 0, 0)");
  w.deck.leave(1);
  const leaving = moving(b);
  assert.equal(leaving.length, 1);
  touched[0]();
  assert.equal(leaving[0].cancelled, false, "the page's leave is not the hold's to stop");
});

test("the frame's own page never holds its layer, nor a view that does not say so", async () => {
  for (const [name, w] of [
    ["the frame's page", layered([])],
    ["a view that says nothing", world()],
  ]) {
    const main = view();
    const a = view({ attrs: {} });
    main.inside = [a];
    const outer = name === "the frame's page";
    const seat = w.deck.view(outer ? "frame" : "scope");
    if (!outer) w.deck.view("frame")(main);
    seat(outer ? main : a);
    const next = view({ attrs: {}, dataset: { slide: "next" }, parentNode: (outer ? main : a).parentNode });
    if (!outer) main.inside.push(next);
    replace(seat, outer ? main : a, next);
    const [travel] = moving(next);
    assert.equal(travel.options.fill, "none", name);
    for (const anim of next.anims) anim.finish();
    await until(() => moving(next).length === 0, `${name}: drawn on the page again as its slide ends`);
  }
});

test("what was scrolled in the page leaving is where it was in its copy", () => {
  const w = world();
  const seat = w.deck.view("frame");
  const a = view();
  const list = { scrollTop: 0, scrollLeft: 0 };
  a.inside = [list];
  seat(a);
  list.scrollTop = 420;
  a.hears({ target: list });
  w.deck.leave(1);
  list.scrollTop = 0;
  const b = view({ dataset: { slide: "next" }, parentNode: a.parentNode });
  replace(seat, a, b);
  assert.equal(list.scrollTop, 420);
});

test("where the window scrolls, a view in place of another comes in under the frame's top; one that holds still is its page's", () => {
  const root = { computed: { scrollPaddingTop: "146px" } };
  const styleOf = (el) => ({
    overflowY: "visible",
    scrollPaddingTop: "0px",
    getPropertyValue: (name) => (name === "--view-travel" ? (el?.travel ?? "100%") : ""),
    ...el?.computed,
  });
  const scrolls = [];
  const kept = {
    window: globalThis.window,
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
  };
  globalThis.document = { scrollingElement: root, documentElement: root, body: {} };
  globalThis.getComputedStyle = styleOf;
  globalThis.window = {
    getComputedStyle: styleOf,
    matchMedia: () => ({ matches: false }),
    scrollY: 300,
    history: {},
    scrollTo: (_x, y) => scrolls.push(["to", y]),
    scrollBy: (_x, y) => scrolls.push(["by", y]),
  };
  try {
    const page = view();
    const lens = view();
    const next = view({ rect: { left: 10, top: 100, width: 375, height: 600 } });
    const days = view({ rect: { left: 10, top: 100, width: 375, height: 600 }, travel: "none" });
    page.inside = [lens, next, days];
    viewDeck.view("a frame under test")(page);
    const seat = viewDeck.view("a page's views under test");
    seat(lens);
    scrolls.length = 0;
    replace(seat, lens, next);
    assert.deepEqual(scrolls, [["by", -46]], "its top just under the frame's top, where the page had gone past it");
    scrolls.length = 0;
    replace(seat, next, days);
    assert.deepEqual(
      scrolls,
      [],
      "the Calendar's page puts its days where they stand (calendar/board-dom.ts standAfter)",
    );
  } finally {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});

/* ------------------------------ a desk, and reduced motion ------------------------------- */

test("on a desk the page travels the token's short length, dims while it waits, and cross-fades as the next joins", () => {
  const w = world({ token: "56px" });
  const seat = w.deck.view("frame");
  const a = view({ rect: { left: 246, top: 146, width: 1034, height: 654 } });
  seat(a);
  w.deck.leave(1);
  assert.equal(across(moving(a).at(-1).keyframes.at(-1)), -56);
  const dim = fading(a).at(-1);
  assert.equal(dim.keyframes.at(-1).opacity, 0.4, "still there, dimmed, however long the next page takes");
  w.clock = 1150;
  const b = view({ dataset: { slide: "next" }, parentNode: a.parentNode, rect: a.rect });
  replace(seat, a, b);
  assert.equal(across(moving(b).at(-1).keyframes[0]), 56);
  const gone = fading(a).at(-1);
  assert.equal(gone.startTime, 1150);
  assert.equal(gone.keyframes.at(-1).opacity, 0, "then gone as the next fades in over it");
  // In half the time the next takes to come up: the two overlap where they stand, and at an even cross-fade both were
  // half there at once, one 56px beside the other (seen slowed tenfold, 8 Oct 2026).
  assert.equal(gone.options.duration, JOIN_FADE_MS / 2);
  assert.equal(fading(b).at(-1).keyframes.at(-1).opacity, 1);
});

test("under reduced motion nothing travels: the pages cross-fade", () => {
  const w = world({ reduced: true });
  const seat = w.deck.view("frame");
  const a = view();
  seat(a);
  const move = w.deck.leave(1);
  assert.equal(move.travel, 0);
  assert.equal(moving(a).length, 0, "no transform at all");
  w.clock = 1060;
  const b = view({ dataset: { slide: "next" }, parentNode: a.parentNode });
  replace(seat, a, b);
  assert.equal(moving(b).length, 0);
  assert.equal(fading(b).at(-1).options.duration, CROSS_FADE_MS);
  assert.equal(fading(a).at(-1).keyframes.at(-1).opacity, 0);
});

test("the strip follows the same timeline: what it is handed is the page's progress, frame for frame", () => {
  const w = world();
  const a = view();
  w.deck.view("frame")(a);
  const move = w.deck.leave(-1);
  const pill = view({ attrs: {} });
  const anim = move.follow(pill, (progress) => ({ transform: `translate3d(${100 * progress}px, 0, 0)` }));
  assert.equal(anim.startTime, 1000);
  assert.equal(anim.options.duration, TIMELINE_MS);
  assert.equal(across(anim.keyframes[0]), 0);
  assert.equal(across(anim.keyframes.at(-1)), 100);
  const slide = moving(a).at(-1);
  const mid = Math.floor(slide.keyframes.length / 3);
  assert.ok(Math.abs(across(anim.keyframes[mid]) - (across(slide.keyframes[mid]) / 375) * 100) < 1e-6);
});
