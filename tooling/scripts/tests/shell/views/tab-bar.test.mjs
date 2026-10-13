/**
 * The phone's tab bar (apps/dashboard/src/surfaces/kit/tab-bar/): the kit's TabBar, its press and its lozenge.
 *
 * The bar was the frame's own buttons, its lit place a fill switched by a class when the router had landed, and its page
 * faded in after that: a place pressed answered nothing for 150 to 260 ms on a phone, and the finger's own time on the
 * glass (the press is timed from the touch) came first (production's field data, 5 to 12 Oct 2026). Now a finger's press
 * lights the place and starts the lozenge as it lands, and the address moves a painted frame on, while the finger is
 * still down; the click its lift makes is that press again. The lozenge rides the strip's spring on a timeline of its
 * own (the view deck's `alone`), since no page slides under it.
 *
 * Drawn on the shared stub React, over the real TSX; the lozenge on elements that answer what the glide asks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, all, classes, textOf } from "../../_legacy-react.mjs";

installLegacyReact();
// What the page's own deck asks of a browser (view-deck.ts `viewDeck`): a clock and the motion setting.
let reduced = false;
globalThis.document = { ...(globalThis.document ?? {}), timeline: { currentTime: 5000 } };
globalThis.matchMedia = () => ({ matches: reduced });

const { TabBar } = await import("../../../../../apps/dashboard/src/surfaces/kit/tab-bar/tab-bar.tsx");
const { viewDeck, springAt, TIMELINE_MS } =
  await import("../../../../../apps/dashboard/src/surfaces/kit/motion/view-deck.ts");
const { PILL_BASE } = await import("../../../../../apps/dashboard/src/surfaces/kit/view-tabs/glide.ts");

const h = (...a) => globalThis.React.createElement(...a);

const PLACES = [
  { id: "today", label: "Today", href: "/w/studio/today", glyph: h("svg") },
  {
    id: "inbox",
    label: "Inbox",
    href: "/w/studio/inbox",
    glyph: h("svg"),
    count: 3,
    tone: "warn",
    testid: "tab-inbox",
  },
  { id: "calendar", label: "Calendar", href: "/w/studio/calendar", glyph: h("svg"), count: 0 },
  { id: "people", label: "People", href: "/w/studio/people", glyph: h("svg") },
];
const bar = (over = {}) => h(TabBar, { label: "Main", picked: "today", places: PLACES, onPick() {}, ...over });
const tabsOf = (tree) => all(tree, (n) => n.type === "a" && classes(n).includes("tab-bar-tab"));
const lit = (tree) =>
  tabsOf(tree)
    .filter((t) => classes(t).includes("active"))
    .map((t) => textOf(t.props.children[1]));
const navOf = (tree) => all(tree, (n) => n.type === "nav")[0];

/* ----------------------------------- what stands in ------------------------------------- */

const animation = (keyframes, options) => ({
  keyframes,
  options,
  startTime: null,
  finished: new Promise(() => {}),
  cancel() {},
});
/** A tab on the page, where the glide measures it. */
const placeAt = (offsetLeft) => ({ offsetLeft, offsetWidth: 56 });
/** The bar on the page: its lit place, its lozenge and what the glide marks on it. */
const barOnPage = (litAt = 6) => {
  const pill = {
    style: {},
    offsetHeight: 50,
    anims: [],
    animate(keyframes, options) {
      const made = animation(keyframes, options);
      pill.anims.push(made);
      return made;
    },
  };
  const was = placeAt(litAt);
  return {
    attrs: {},
    pill,
    scrollWidth: 290,
    clientWidth: 290,
    scrollLeft: 0,
    clientLeft: 0,
    setAttribute(n, v) {
      this.attrs[n] = v;
    },
    removeAttribute(n) {
      delete this.attrs[n];
    },
    hasAttribute(n) {
      return n in this.attrs;
    },
    querySelector: (s) => (s === ".tab-bar-pill" ? pill : s === ".tab-bar-tab.active" ? was : null),
    scrollTo() {},
  };
};
/** A finger's press on a tab, as React hands it: on its element, at its time. */
const touch = (target, over = {}) => ({
  pointerType: "touch",
  isPrimary: true,
  button: 0,
  timeStamp: 100,
  currentTarget: target,
  ...over,
});
/** The click a press makes, counting the app taking it over from the link. */
const clickOn = (target, over = {}) => {
  const e = { button: 0, timeStamp: 190, currentTarget: target, prevented: 0, ...over };
  e.preventDefault = () => (e.prevented += 1);
  return e;
};
const across = (frame) => Number(/translate3d\((-?[\d.]+)px/.exec(frame.transform)?.[1]);
const stretch = (frame) => Number(/scaleX\(([\d.]+)\)/.exec(frame.transform)?.[1]);

/* -------------------------------------- the bar ----------------------------------------- */

test("the bar is a nav of links, the place on screen lit and named as the page, the lozenge first and More last", () => {
  fresh();
  const tree = bar({ testid: "phone-tabs", more: { label: "Menu", word: "More", glyph: h("svg"), onPress() {} } });
  const nav = navOf(tree);
  assert.deepEqual(classes(nav), ["tab-bar"]);
  assert.equal(nav.props["aria-label"], "Main");
  assert.equal(nav.props["data-testid"], "phone-tabs");
  const [first] = [nav.props.children].flat(2).filter(Boolean);
  assert.deepEqual(classes(first), ["tab-bar-pill"], "the one element the lozenge is");
  assert.equal(first.props["aria-hidden"], "true");
  const tabs = tabsOf(tree);
  assert.deepEqual(
    tabs.map((t) => t.props.href),
    PLACES.map((p) => p.href),
    "a place has an address: a tab is a link",
  );
  assert.deepEqual(lit(tree), ["Today"]);
  assert.deepEqual(
    tabs.map((t) => t.props["aria-current"]),
    ["page", undefined, undefined, undefined],
  );
  assert.equal(tabs[1].props["data-testid"], "tab-inbox");
  assert.equal(tabs[0].props.draggable, false, "a place is pressed, never dragged out of the bar");
  const more = all(tree, (n) => n.type === "button")[0];
  assert.equal(more.props.type, "button");
  assert.equal(more.props["aria-label"], "Menu");
  assert.deepEqual(classes(more), ["tab-bar-tab"]);
  assert.equal(textOf(more.props.children[1]), "More");
});

test("a place's count rides over its glyph, amber where it counts who needs you, and a zero says nothing", () => {
  fresh();
  const counts = all(bar(), (n) => classes(n).includes("tab-bar-count"));
  assert.deepEqual(
    counts.map((c) => [classes(c).join(" "), textOf(c)]),
    [["tab-bar-count tally tally-icon tally-warn", "3"]],
  );
  assert.equal(all(bar(), (n) => n.props && n.props.style).length, 0, "nothing is sized by a style of its own");
});

test("where no place holds the page, none is lit and none is named as it", () => {
  fresh();
  const tree = bar({ picked: null });
  assert.deepEqual(lit(tree), []);
  assert.deepEqual(
    tabsOf(tree).map((t) => t.props["aria-current"]),
    [undefined, undefined, undefined, undefined],
  );
});

/* ------------------------------------- the press ---------------------------------------- */

test("a finger's press lights its place as it lands, carries the lozenge there, and moves the address; its click is that press", () => {
  fresh();
  reduced = false;
  const picked = [];
  const draw = () => bar({ onPick: (id) => picked.push(id) });
  let tree = draw();
  const page = barOnPage(6);
  navOf(tree).props.ref.current = page;
  const inbox = placeAt(62);
  tabsOf(tree)[1].props.onPointerDown(touch(inbox));
  assert.deepEqual(picked, ["inbox"], "asked for at the touch (a painted frame on, where there are frames)");
  assert.equal(
    page.attrs["data-glide"],
    "",
    "the bar says the lozenge is moving, so the lit place's own fill is clear",
  );
  const [slide, round] = page.pill.anims;
  assert.ok(slide && round, "its place by transform, and its corners apart");
  assert.equal(slide.startTime, 5000, "begun at the press, on the document's clock");
  assert.equal(slide.options.duration, TIMELINE_MS, "the strip's own timeline");
  assert.equal(across(slide.keyframes[0]), 6, "from the place that was lit");
  assert.equal(across(slide.keyframes.at(-1)), 62, "to the place pressed");
  assert.equal(stretch(slide.keyframes.at(-1)), 56 / PILL_BASE);
  // The way there is the strip's spring from rest: most of it in the first frames, none of it past the place.
  const at100 = slide.keyframes.find((k) => Math.abs(k.offset - 100 / TIMELINE_MS) < 1e-9);
  assert.equal(across(at100), 6 + (62 - 6) * (1 - springAt(1, 0, 0, 100)));
  assert.ok(slide.keyframes.every((k) => across(k) <= 62));
  tree = again(draw);
  assert.deepEqual(lit(tree), ["Inbox"], "lit before the address has moved");
  assert.equal(tabsOf(tree)[0].props["aria-current"], "page", "which still names the page it is on");
  // The lift's click is the same press: the link's own move is taken over, and nothing is asked again.
  const click = clickOn(inbox);
  tabsOf(tree)[1].props.onClick(click);
  assert.equal(click.prevented, 1, "the app's own move, not the link's");
  assert.deepEqual(picked, ["inbox"]);
  // The address lands: the place is the page's, and the bar says so.
  tree = again(() => bar({ picked: "inbox", onPick: (id) => picked.push(id) }));
  assert.deepEqual(lit(tree), ["Inbox"]);
  assert.equal(tabsOf(tree)[1].props["aria-current"], "page");
});

test("a mouse, a key and a screen reader press on the click, as on any link", () => {
  fresh();
  const picked = [];
  const tree = bar({ onPick: (id) => picked.push(id) });
  const tabs = tabsOf(tree);
  tabs[2].props.onPointerDown(touch(placeAt(118), { pointerType: "mouse" }));
  assert.deepEqual(picked, [], "a mouse's press goes down and waits for its click");
  const click = clickOn(placeAt(118));
  tabs[2].props.onClick(click);
  assert.equal(click.prevented, 1);
  assert.deepEqual(picked, ["calendar"]);
});

test("a click long after a touch, or after a touch the browser took back, is a press of its own", () => {
  fresh();
  const picked = [];
  let tree = bar({ onPick: (id) => picked.push(id) });
  tabsOf(tree)[1].props.onPointerDown(touch(placeAt(62)));
  tree = again(() => bar({ onPick: (id) => picked.push(id) }));
  tabsOf(tree)[1].props.onClick(clickOn(placeAt(62), { timeStamp: 1500 }));
  assert.deepEqual(picked, ["inbox", "inbox"], "a click more than a second on is no lift of that touch");
  fresh();
  const again2 = [];
  tree = bar({ onPick: (id) => again2.push(id) });
  tabsOf(tree)[3].props.onPointerDown(touch(placeAt(174)));
  tabsOf(tree)[3].props.onPointerCancel();
  tabsOf(tree)[3].props.onClick(clickOn(placeAt(174)));
  assert.deepEqual(
    again2,
    ["people", "people"],
    "a touch the browser took back (a scroll, its own gesture) is forgotten",
  );
});

test("a press with a key held, or not the main button, is the browser's: a new tab opens the place", () => {
  fresh();
  const picked = [];
  const tabs = tabsOf(bar({ onPick: (id) => picked.push(id) }));
  for (const held of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const click = clickOn(placeAt(62), held);
    tabs[1].props.onClick(click);
    assert.equal(click.prevented, 0);
  }
  tabs[1].props.onPointerDown(touch(placeAt(62), { button: 1 }));
  tabs[1].props.onPointerDown(touch(placeAt(62), { isPrimary: false }));
  assert.deepEqual(picked, [], "and a second finger, or a pen's other button, is no press of the bar's");
});

test("the place on screen pressed again is said, and nothing moves: its frame takes it to its top", () => {
  fresh();
  const picked = [];
  const draw = () => bar({ onPick: (id) => picked.push(id) });
  let tree = draw();
  const page = barOnPage(6);
  navOf(tree).props.ref.current = page;
  tabsOf(tree)[0].props.onPointerDown(touch(placeAt(6)));
  assert.deepEqual(picked, ["today"]);
  assert.equal(page.pill.anims.length, 0);
  assert.equal("data-glide" in page.attrs, false);
  tree = again(draw);
  assert.deepEqual(lit(tree), ["Today"]);
});

test("under reduced motion the lozenge does not travel: the place pressed lights at once", () => {
  fresh();
  reduced = true;
  try {
    assert.equal(viewDeck.alone(), null, "no timeline to follow");
    const picked = [];
    const draw = () => bar({ onPick: (id) => picked.push(id) });
    let tree = draw();
    const page = barOnPage(6);
    navOf(tree).props.ref.current = page;
    tabsOf(tree)[1].props.onPointerDown(touch(placeAt(62)));
    assert.equal(page.pill.anims.length, 0);
    assert.equal("data-glide" in page.attrs, false);
    tree = again(draw);
    assert.deepEqual(lit(tree), ["Inbox"]);
    assert.deepEqual(picked, ["inbox"]);
  } finally {
    reduced = false;
  }
});

test("a place's read starts as a pointer or the keyboard reaches it", () => {
  fresh();
  const warmed = [];
  const tabs = tabsOf(bar({ places: PLACES.map((p) => ({ ...p, warm: () => warmed.push(p.id) })) }));
  tabs[1].props.onPointerEnter();
  tabs[3].props.onFocus();
  assert.deepEqual(warmed, ["inbox", "people"]);
});

test("a long press opens no link's menu over the place it has already moved to", () => {
  fresh();
  let stopped = 0;
  tabsOf(bar())[2].props.onContextMenu({ preventDefault: () => (stopped += 1) });
  assert.equal(stopped, 1);
});

test("More is no place: its press opens what it opens, lights nothing, and moves nothing", () => {
  fresh();
  const picked = [];
  let opened = 0;
  const draw = () =>
    bar({
      onPick: (id) => picked.push(id),
      more: { label: "Menu", word: "More", glyph: h("svg"), onPress: () => (opened += 1) },
    });
  let tree = draw();
  all(tree, (n) => n.type === "button")[0].props.onClick();
  assert.equal(opened, 1);
  assert.deepEqual(picked, []);
  tree = again(draw);
  assert.deepEqual(lit(tree), ["Today"]);
});
