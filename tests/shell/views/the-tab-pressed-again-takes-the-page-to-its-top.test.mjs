/**
 * The place on screen pressed again takes the page to its top, and nothing else (apps/dashboard/src/surfaces/frame/
 * shell-hooks.ts `pageToTop`: the tab bar's place, and the phone app's tab, `shell:top`).
 *
 * It is pressed on a phone alone (the tab bar is drawn at 720px and under, the app is a phone's and upright), where every
 * page scrolls the window since 21 Oct 2026 (mobile.css, "The window scrolls"; kit motion/page-scroll.ts). It went to the
 * top of every box under the frame's `main` as well, as it had to on 12 Oct, when each phone page scrolled in a box of its
 * own: so an open sheet a person had read down, the words of a long reply and a table scrolled down jumped to their tops
 * with the page (the interaction review, 13 Nov 2026). Now the box the view scrolls in goes up (page-scroll.ts
 * scrollerOf: the window, or `main` where `main` scrolls the view itself), and a box that scrolls on its own keeps its place.
 *
 * Run against the function itself, over a page whose boxes answer what it asks of them.
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact } from "../../_stub-react.mjs";
import { importSrc } from "../../_source.mjs";

installStubReact();
const { pageToTop } = await importSrc("apps/dashboard/src/surfaces/frame/shell-hooks.ts");

/** A box of the page: its own overflow down its length, and how far down it is scrolled. */
const pageBox = (name, { overflowY = "visible", scrollTop = 0, parent = null } = {}) => ({
  name,
  parentElement: parent,
  css: { overflowY },
  scrollTop,
  scrollTo({ top }) {
    this.scrollTop = top;
  },
});

const kept = {
  document: globalThis.document,
  getComputedStyle: globalThis.window.getComputedStyle,
  matchMedia: globalThis.window.matchMedia,
  scrollTo: globalThis.window.scrollTo,
  scrollY: globalThis.window.scrollY,
};
afterEach(() => {
  globalThis.document = kept.document;
  Object.assign(globalThis.window, {
    getComputedStyle: kept.getComputedStyle,
    matchMedia: kept.matchMedia,
    scrollTo: kept.scrollTo,
    scrollY: kept.scrollY,
  });
});

/**
 * A page drawn in the frame: `main` (scrolling the view itself where `mainScrolls`), and under it the boxes that scroll on
 * their own, each scrolled down: an open sheet's body, a reply's long words, a table with a height of its own.
 */
function aPage({ mainScrolls = false, windowAt = 0 } = {}) {
  const html = pageBox("html");
  const body = pageBox("body", { parent: html });
  const main = pageBox("main", { parent: body, ...(mainScrolls ? { overflowY: "auto", scrollTop: 640 } : {}) });
  const view = pageBox("view", { parent: main });
  const own = [
    pageBox("sheet", { overflowY: "auto", scrollTop: 300, parent: view }),
    pageBox("reply", { overflowY: "auto", scrollTop: 40, parent: view }),
    pageBox("table", { overflowY: "auto", scrollTop: 120, parent: view }),
  ];
  main.querySelectorAll = () => [view, ...own];
  globalThis.document = {
    documentElement: html,
    scrollingElement: html,
    body,
    getElementById: (id) => (id === "main" ? main : null),
  };
  const win = globalThis.window;
  win.getComputedStyle = (el) => el.css;
  // A person who asked for less motion: the page goes at once, and the test reads where it went.
  win.matchMedia = () => ({ matches: true });
  win.scrollY = windowAt;
  win.scrollTo = ({ top }) => {
    win.scrollY = top;
  };
  return { main, own };
}

const placesOf = (boxes) => Object.fromEntries(boxes.map((b) => [b.name, b.scrollTop]));

test("on a phone the window goes to the top, and a box that scrolls on its own inside the page keeps its place", () => {
  const { own } = aPage({ windowAt: 900 });
  pageToTop();
  assert.equal(globalThis.window.scrollY, 0, "the page is at its top");
  assert.deepEqual(
    placesOf(own),
    { sheet: 300, reply: 40, table: 120 },
    "REGRESSION: the open sheet, the reply's words and the table went to their tops with the page",
  );
});

test("where the frame's main scrolls the view itself, main goes to the top, and what scrolls inside it keeps its place", () => {
  const { main, own } = aPage({ mainScrolls: true });
  pageToTop();
  assert.equal(main.scrollTop, 0, "the view is at its top");
  assert.deepEqual(placesOf(own), { sheet: 300, reply: 40, table: 120 }, "REGRESSION: the boxes inside it went too");
  assert.equal(globalThis.window.scrollY, 0, "and the window, which did not move, is not asked");
});
