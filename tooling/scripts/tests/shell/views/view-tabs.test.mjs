/**
 * One strip of views (apps/dashboard/src/surfaces/kit/view-tabs/): the kit's ViewTabs, its highlight and its pager.
 *
 * The strip was drawn three ways: by the shell's SurfaceTabs for the Inbox's views and for a page's own (People's
 * scopes, Reports' lenses), and by Settings, which typed the markup again with buttons for links and a slide of its
 * own. Its highlight was a pseudo-element placed by two custom properties from two functions with two clocks: it glided
 * on a tap and jumped on every swipe, and two presses left it under the first tab while the second was lit (measured,
 * 8 Oct 2026). One component draws the strip now, a press starts the page leaving before it moves the address, and the
 * highlight is one element moved on the page's own timeline (kit/motion/view-deck.ts).
 *
 * Drawn on the shared stub React, over the real TSX; the highlight and the pager on elements that answer what they ask.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, all, find, classes, textOf } from "../../_legacy-react.mjs";

installLegacyReact();
// What the page's own deck asks of a browser (view-deck.ts `viewDeck`): a clock, the motion setting, and the tokens.
let token = "100%";
let place = 0;
globalThis.document = { ...(globalThis.document ?? {}), timeline: { currentTime: 3000 } };
globalThis.matchMedia = () => ({ matches: false });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => token, transform: "none" });
globalThis.DOMMatrixReadOnly = class {
  get m41() {
    return place;
  }
};

const { ViewTabs } = await import("../../../../../apps/dashboard/src/surfaces/kit/view-tabs/view-tabs.tsx");
const { glideTo, glideDrag, glideHome, showPicked, PILL_BASE } =
  await import("../../../../../apps/dashboard/src/surfaces/kit/view-tabs/glide.ts");
const { viewPager } = await import("../../../../../apps/dashboard/src/surfaces/kit/view-tabs/pager.ts");
const { useSlide } = await import("../../../../../apps/dashboard/src/surfaces/kit/motion/use-slide.ts");
const { viewDeck, TIMELINE_MS } = await import("../../../../../apps/dashboard/src/surfaces/kit/motion/view-deck.ts");

const h = (...a) => globalThis.React.createElement(...a);

/* ----------------------------------- what stands in ------------------------------------- */

const animation = (keyframes, options) => {
  let done;
  const finished = new Promise((resolve) => (done = resolve));
  return {
    keyframes,
    options,
    startTime: null,
    finished,
    cancelled: false,
    finish: () => done(),
    cancel() {
      this.cancelled = true;
    },
  };
};

/** A page the window's own deck can move. */
const page = () => {
  const el = {
    style: {},
    dataset: {},
    isConnected: true,
    anims: [],
    offsetParent: null,
    getBoundingClientRect: () => ({ left: 0, top: 100, width: 375, height: 600 }),
    addEventListener() {},
    contains: (other) => other === el,
    animate(keyframes, options) {
      const made = animation(keyframes, options);
      el.anims.push(made);
      return made;
    },
  };
  return el;
};
const onScreen = (el) => viewDeck.view("test")(el);
const across = (frame) => Number(/translate3d\((-?[\d.]+)px/.exec(frame.transform)?.[1]);
const stretch = (frame) => Number(/scaleX\(([\d.]+)\)/.exec(frame.transform)?.[1]);
const slides = (el) => el.anims.filter((a) => a.keyframes.some((k) => "transform" in k));

const TABS = [
  {
    id: "inbox",
    label: "Needs you",
    href: "/w/studio/inbox",
    count: 3,
    tone: "warn",
    tip: "Waiting on a decision from you",
  },
  { id: "conversations", label: "Conversations", href: "/w/studio/conversations", testid: "tab-conv" },
  { id: "live", label: "Live", href: "/w/studio/live", live: true },
];
const strip = (over = {}) =>
  h(ViewTabs, { name: "inbox", label: "Section views", picked: "inbox", tabs: TABS, onPick() {}, ...over });
const tabsOf = (tree) => all(tree, (n) => classes(n).includes("stabs-tab"));
const lit = (tree) =>
  tabsOf(tree)
    .filter((t) => classes(t).includes("active"))
    .map((t) => textOf(t.props.children[0]));
const plain = { button: 0, preventDefault() {} };

/* ------------------------------------- the strip ---------------------------------------- */

test("the strip is a nav of links, the picked one lit and named as the page, with the highlight before them", () => {
  fresh();
  const tree = strip({ testid: "the-strip" });
  const nav = find(tree, (n) => n.type === "nav");
  assert.deepEqual(classes(nav), ["stabs", "stabs-inbox"]);
  assert.equal(nav.props["aria-label"], "Section views");
  assert.equal(nav.props["data-testid"], "the-strip");
  const [first] = [nav.props.children].flat(2).filter(Boolean);
  assert.deepEqual(classes(first), ["stabs-pill"], "the one element the highlight is");
  assert.equal(first.props["aria-hidden"], "true");
  const tabs = tabsOf(tree);
  assert.deepEqual(
    tabs.map((t) => t.type),
    ["a", "a", "a"],
    "a view has an address: a tab is a link",
  );
  assert.deepEqual(
    tabs.map((t) => t.props.href),
    TABS.map((t) => t.href),
  );
  assert.deepEqual(lit(tree), ["Needs you"]);
  assert.deepEqual(
    tabs.map((t) => t.props["aria-current"]),
    ["page", undefined, undefined],
  );
  assert.equal(tabs[1].props["data-testid"], "tab-conv");
  assert.equal(tabs[0].props["data-tip"], "Waiting on a decision from you");
});

test("a tab's count is a tally, amber where it counts who needs you; a view with something on now wears the dot", () => {
  fresh();
  const tree = strip({ tabs: [TABS[0], { ...TABS[1], count: 12 }, { ...TABS[2], count: 0 }] });
  const tallies = all(tree, (n) => classes(n).includes("stabs-badge"));
  assert.deepEqual(
    tallies.map((t) => [classes(t).join(" "), t.props["data-tone"], textOf(t)]),
    [
      ["stabs-badge tally tally-warn", "warn", "3"],
      ["stabs-badge tally", "plain", "12"],
    ],
    "and a view with nothing to count says no number",
  );
  assert.equal(all(tree, (n) => classes(n).includes("live-dot")).length, 1);
  assert.equal(all(tree, (n) => n.props && n.props.style).length, 0, "nothing is sized by a style of its own");
});

test("a strip of one view draws nothing", () => {
  fresh();
  assert.equal(strip({ tabs: [TABS[0]] }).rendered, null);
});

test("a press lights its tab at once, starts the page leaving toward its side, and then moves the address", () => {
  fresh();
  const view = page();
  onScreen(view);
  const picked = [];
  const draw = () => strip({ onPick: (id) => picked.push(id) });
  let tree = draw();
  let stopped = 0;
  tabsOf(tree)[1].props.onClick({ button: 0, preventDefault: () => stopped++ });
  assert.equal(stopped, 1, "the app's own move, not the link's");
  assert.deepEqual(picked, ["conversations"]);
  const [slide] = slides(view);
  assert.equal(slide.startTime, 3000, "the page began leaving at the press");
  assert.equal(across(slide.keyframes.at(-1)), -375, "to the left, for a tab to the right");
  tree = again(draw);
  assert.deepEqual(lit(tree), ["Conversations"], "lit before the address has moved");
  assert.equal(tabsOf(tree)[0].props["aria-current"], "page", "which still names the page it is on");
  // A tab to the left sends it the other way.
  fresh();
  const other = page();
  onScreen(other);
  tabsOf(strip({ picked: "live" }))[0].props.onClick(plain);
  assert.equal(across(slides(other)[0].keyframes.at(-1)), 375);
});

test("a press on the tab already picked moves the address and nothing else", () => {
  fresh();
  const view = page();
  onScreen(view);
  const picked = [];
  tabsOf(strip({ onPick: (id) => picked.push(id) }))[0].props.onClick(plain);
  assert.deepEqual(picked, ["inbox"], "back to the view's own address (a list picked in it is let go)");
  assert.equal(view.anims.length, 0);
});

test("pressed back to the page it is on while another was on its way, the page comes back at once", () => {
  fresh();
  const view = page();
  onScreen(view);
  const picked = [];
  const draw = () => strip({ onPick: (id) => picked.push(id) });
  let tree = draw();
  tabsOf(tree)[1].props.onClick(plain);
  tree = again(draw);
  place = -120;
  tabsOf(tree)[0].props.onClick(plain);
  place = 0;
  assert.deepEqual(picked, ["conversations", "inbox"]);
  const back = slides(view).at(-1);
  assert.equal(across(back.keyframes[0]), -120, "from where it had got to");
  assert.equal(across(back.keyframes.at(-1)), 0, "not left waiting for a page that is not coming");
  tree = again(draw);
  assert.deepEqual(lit(tree), ["Needs you"]);
});

test("a press with a key held, or not the main button, is the browser's: a new tab opens the view", () => {
  fresh();
  const view = page();
  onScreen(view);
  const picked = [];
  const tabs = tabsOf(strip({ onPick: (id) => picked.push(id) }));
  let stopped = 0;
  for (const held of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    tabs[1].props.onClick({ button: 0, preventDefault: () => stopped++, ...held });
  }
  assert.equal(stopped, 0);
  assert.deepEqual(picked, []);
  assert.equal(view.anims.length, 0);
});

test("a page that may not be left yet (unsaved work) is asked first: nothing leaves, and the page hears the press", () => {
  fresh();
  const view = page();
  onScreen(view);
  const picked = [];
  const draw = () => strip({ onPick: (id) => picked.push(id), mayLeave: () => false });
  let tree = draw();
  tabsOf(tree)[2].props.onClick(plain);
  assert.equal(view.anims.length, 0);
  assert.deepEqual(picked, ["live"], "the page asks its question");
  tree = again(draw);
  assert.deepEqual(lit(tree), ["Needs you"], "and the tab is not lit for a move that has not been made");
});

test("a tab's read starts as a pointer, a finger or the keyboard reaches it", () => {
  fresh();
  const warmed = [];
  const tabs = tabsOf(strip({ tabs: TABS.map((t) => ({ ...t, warm: () => warmed.push(t.id) })) }));
  tabs[1].props.onPointerEnter();
  tabs[2].props.onTouchStart();
  tabs[0].props.onFocus();
  assert.deepEqual(warmed, ["conversations", "live", "inbox"]);
});

/* ------------------------------------ the highlight ------------------------------------- */

/** A strip on the page: three tabs, the first lit, and the highlight's element. */
const drawn = (over = {}) => {
  const pill = {
    style: {},
    offsetHeight: 38,
    anims: [],
    getBoundingClientRect: () => ({ left: 16, width: 87 }),
    animate(keyframes, options) {
      const made = animation(keyframes, options);
      pill.anims.push(made);
      return made;
    },
  };
  const tabs = [
    { offsetLeft: 4, offsetWidth: 87 },
    { offsetLeft: 93, offsetWidth: 113 },
    { offsetLeft: 208, offsetWidth: 45 },
  ].map((t, i) => ({
    ...t,
    lit: i === 0,
    classList: { contains: (c) => c === "active" && tabs[i].lit },
    clicked: 0,
    click() {
      this.clicked++;
    },
  }));
  const el = {
    attrs: {},
    pill,
    tabs,
    scrolls: [],
    scrollLeft: 0,
    scrollWidth: 257,
    clientWidth: 257,
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
    querySelector: (s) =>
      s === ".stabs-pill" ? pill : s === ".stabs-tab.active" ? (tabs.find((t) => t.lit) ?? null) : null,
    querySelectorAll: () => tabs,
    getBoundingClientRect: () => ({ left: 12, width: 257 }),
    getClientRects: () => [1],
    scrollTo(to) {
      this.scrolls.push(to);
    },
    ...over,
  };
  return el;
};
/** A change of view as the deck hands one to a follower: it records what the follower drew at each share of the way. */
const change = () => {
  const made = [];
  return {
    made,
    follow(el, frame) {
      const anim = animation([0.25, 0.5, 1].map(frame), { duration: TIMELINE_MS });
      made.push(anim);
      el.anims.push(anim);
      return anim;
    },
  };
};

test("the highlight is carried from the lit tab to the one pressed on the page's own timeline, and gone at its end", async () => {
  const s = drawn();
  const c = change();
  glideTo(s, s.tabs[0], s.tabs[1], c);
  assert.equal(s.attrs["data-glide"], "", "the strip says it is gliding, so the lit tab's own fill is clear");
  const [slide, round] = c.made;
  assert.ok(slide && round, "its place by transform, which the compositor moves, and its corners apart");
  // The first sample is where the change starts: the lit tab's own place and width.
  assert.equal(across(slide.keyframes[0]), 4);
  assert.equal(stretch(slide.keyframes[0]), 87 / PILL_BASE);
  assert.equal(across(slide.keyframes.at(-1)), 93);
  assert.equal(stretch(slide.keyframes.at(-1)), 113 / PILL_BASE);
  assert.ok(round.keyframes.every((k) => "borderRadius" in k && !("transform" in k)));
  assert.equal(round.keyframes.at(-1).borderRadius, `${19 / (113 / PILL_BASE)}px / 19px`, "round at any width");
  slide.finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(s.hasAttribute("data-glide"), false, "at rest the picked tab draws its own");
  assert.ok(c.made.every((a) => a.cancelled));
});

test("a second press carries the highlight on from where it is, and the first change's end does not clear the second", async () => {
  const s = drawn();
  const first = change();
  glideTo(s, s.tabs[0], s.tabs[1], first);
  const second = change();
  // The highlight is part way: its place on the page is what it is measured from.
  s.pill.getBoundingClientRect = () => ({ left: 12 + 60, width: 100 });
  glideTo(s, s.tabs[1], s.tabs[2], second);
  const slide = second.made[0];
  assert.equal(across(slide.keyframes[0]), 60, "from where it had got to");
  assert.equal(across(slide.keyframes.at(-1)), 208);
  assert.ok(first.made.every((a) => a.cancelled));
  first.made[0].finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(s.hasAttribute("data-glide"), true, "still gliding: the first's end is not the second's");
});

test("under reduced motion there is no change to follow, and nothing glides", () => {
  const s = drawn();
  glideTo(s, s.tabs[0], s.tabs[1], null);
  assert.equal(s.hasAttribute("data-glide"), false);
  assert.equal(s.pill.anims.length, 0);
});

test("a finger's drag carries the highlight with the page, and a let-go short takes it back in step", async () => {
  const s = drawn();
  glideDrag(s, s.tabs[0], s.tabs[1], 0.5);
  assert.equal(s.attrs["data-glide"], "");
  assert.equal(
    s.pill.style.transform,
    `translate3d(${4 + (93 - 4) * 0.5}px, 0, 0) scaleX(${(87 + (113 - 87) * 0.5) / PILL_BASE})`,
  );
  const home = change();
  glideHome(s, s.tabs[0], s.tabs[1], home);
  assert.equal(s.pill.style.transform, "", "the animation holds it now");
  assert.equal(across(home.made[0].keyframes.at(-1)), 93, "what it draws is the share of the way, as the drag's was");
  home.made[0].finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(s.hasAttribute("data-glide"), false);
  // With nothing to follow back (reduced motion), it is back at once.
  glideDrag(s, s.tabs[0], s.tabs[1], 0.3);
  glideHome(s, s.tabs[0], s.tabs[1], null);
  assert.equal(s.hasAttribute("data-glide"), false);
  assert.equal(s.pill.style.transform, "");
});

test("a strip wider than its place scrolls to the tab picked as the highlight goes, and stands on it at rest", () => {
  const s = drawn({ scrollWidth: 425, clientWidth: 295 });
  s.tabs[2].offsetLeft = 349;
  s.tabs[2].offsetWidth = 72;
  glideTo(s, s.tabs[1], s.tabs[2], change());
  assert.deepEqual(
    s.scrolls,
    [{ left: 349 + 72 + 16 - 295, behavior: "smooth" }],
    "with the highlight, not after it in one jump",
  );
  // At rest (a load, a view picked elsewhere) it is simply there.
  const rest = drawn({ scrollWidth: 425, clientWidth: 295 });
  rest.tabs[0].lit = false;
  rest.tabs[2].lit = true;
  rest.tabs[2].offsetLeft = 349;
  rest.tabs[2].offsetWidth = 72;
  showPicked(rest);
  assert.equal(rest.scrollLeft, 349 + 72 + 16 - 295);
  const fits = drawn();
  glideTo(fits, fits.tabs[0], fits.tabs[2], change());
  assert.deepEqual(fits.scrolls, [], "a strip that fits is left as it is");
});

/* -------------------------------------- the pager --------------------------------------- */

/** A view under a strip, as the shell's route view stands beside the frame's. */
const under = (s) => ({ parentElement: { querySelector: (sel) => (sel === ".stabs" ? s : null) } });
const touch = (own = false) => ({ closest: () => (own ? {} : null) });

test("a page under a strip is walked to the tab beside the lit one, and never past either end", () => {
  fresh();
  token = "100%";
  onScreen(page());
  const s = drawn();
  const first = viewPager(under(s), touch());
  assert.deepEqual([first.prev, first.next], [false, true]);
  s.tabs[0].lit = false;
  s.tabs[2].lit = true;
  const last = viewPager(under(s), touch());
  assert.deepEqual([last.prev, last.next], [true, false]);
});

test("a touch that is another's, a strip not drawn, and a page that does not travel its width are no page to walk", () => {
  fresh();
  token = "100%";
  onScreen(page());
  const s = drawn();
  assert.equal(viewPager(under(s), touch(true)), null, "a sheet's, a menu's, a map's own");
  assert.equal(viewPager(under(drawn({ getClientRects: () => [] })), touch()), null);
  assert.equal(viewPager({ parentElement: { querySelector: () => null } }, touch()), null);
  token = "56px";
  assert.equal(viewPager(under(s), touch()), null, "a desk's page is not carried by a finger");
  token = "100%";
});

test("the finger carries the page and the highlight together; let go past the line, the tab beside is pressed at its speed", () => {
  fresh();
  token = "100%";
  const view = page();
  onScreen(view);
  const s = drawn();
  const walk = viewPager(under(s), touch());
  walk.drag(-150, 1, true);
  assert.equal(view.style.transform, "translate3d(-150px, 0, 0)");
  assert.equal(
    s.pill.style.transform,
    `translate3d(${4 + (93 - 4) * 0.4}px, 0, 0) scaleX(${(87 + (113 - 87) * 0.4) / PILL_BASE})`,
  );
  walk.go(1, -1.2);
  assert.equal(s.tabs[1].clicked, 1, "a swipe is exactly a press of the tab beside");
  // The press (ViewTabs) is what starts the page leaving; here the tab is a stand-in, so ask the deck as it would.
  const move = viewDeck.leave(1);
  assert.equal(move.from, -150);
  assert.ok(across(slides(view).at(-1).keyframes[1]) < -150 - 15, "on at the finger's pace, with no pause");
});

test("toward a side with no page the highlight stays where it is, and a let-go short settles both", () => {
  fresh();
  token = "100%";
  const view = page();
  onScreen(view);
  const s = drawn();
  const walk = viewPager(under(s), touch());
  walk.drag(20, -1, false);
  assert.equal(view.style.transform, "translate3d(20px, 0, 0)", "the page gives a little (touchSwipe's quarter)");
  assert.equal(s.pill.style.transform, `translate3d(4px, 0, 0) scaleX(${87 / PILL_BASE})`);
  walk.settle();
  assert.equal(view.style.transform, "");
  assert.equal(across(slides(view).at(-1).keyframes.at(-1)), 0);
});

/* ------------------------------------ which side -------------------------------------- */

test("a page with views of its own says which side each arrives from, and none for the first it draws", () => {
  fresh();
  const ORDER = ["overview", "receptionist", "people"];
  const said = [];
  const Page = ({ lens }) => {
    said.push(useSlide(ORDER, lens));
    return null;
  };
  let lens = "overview";
  const draw = () => h(Page, { lens });
  draw();
  lens = "people";
  again(draw);
  again(draw);
  lens = "receptionist";
  again(draw);
  lens = "elsewhere";
  again(draw);
  assert.deepEqual(
    said,
    [undefined, "next", "next", "prev", undefined],
    "kept for the view's life, and none for a view off the strip",
  );
});
