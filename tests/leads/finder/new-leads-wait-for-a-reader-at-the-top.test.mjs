/**
 * New leads are taken in by themselves only under a reader at the top (apps/dashboard/src/surfaces/leads/scope/rows-land.tsx).
 *
 * While a search runs the page takes what a refresh found into the rows by itself when its reader is at the top with no lead
 * open (D9 of the answers canvas), and otherwise says "3 new" so nothing moves under a finger (E8). It asked the rows' own
 * box how far down it was, and on a phone that box never scrolls (the window does: mobile.css, "The window scrolls"), so
 * the page always believed its reader was at the top and put leads in under someone reading halfway down. It hung on the
 * whole props object, so any redraw while leads were offered took them again, and what the reader did while the take was
 * out was not asked (13 Nov 2026, a review read at d0739a8fee). The take's own guard, one at a time, is the surface's
 * (tests/leads/finder/leads-bridge.test.mjs).
 *
 * EXECUTED on the stub React over a page whose boxes answer what page-scroll.ts asks of them.
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { again, installStubReact, unmount } from "../../_stub-react.mjs";
import { importSrc } from "../../_source.mjs";

installStubReact();
const { RowsLand } = await importSrc("apps/dashboard/src/surfaces/leads/scope/rows-land.tsx");
const W = globalThis.window;

const kept = { document: globalThis.document, getComputedStyle: W.getComputedStyle, scrollY: W.scrollY };
afterEach(() => {
  globalThis.document = kept.document;
  Object.assign(W, { getComputedStyle: kept.getComputedStyle, scrollY: kept.scrollY });
});

/** The page: the rows' box, scrolling itself (a desk) or as tall as what it holds (a phone, where the window scrolls). */
function aPage({ rowsScroll = false } = {}) {
  const html = { css: { overflowY: "visible" }, parentElement: null };
  const body = { css: { overflowY: "visible" }, parentElement: html };
  const rows = { css: { overflowY: rowsScroll ? "auto" : "visible" }, parentElement: body, scrollTop: 0 };
  globalThis.document = { documentElement: html, scrollingElement: html, body };
  W.getComputedStyle = (el) => el.css;
  W.scrollY = 0;
  // The page's one ref to the rows' box (props.tsx scrollRef), the same object on every draw.
  return { current: rows };
}

let takes = [];
beforeEach(() => {
  unmount();
  takes = [];
});
const take = (still) => {
  takes.push(still);
};
const land = (rows, over = {}) =>
  again(() => W.React.createElement(RowsLand, { offered: 3, running: true, open: false, rows, take, ...over }));

test("REGRESSION: on a phone, a reader the window has carried down keeps the new leads offered", () => {
  const rows = aPage();
  W.scrollY = 640;
  land(rows);
  assert.equal(takes.length, 0, "REGRESSION: put in under a reader halfway down the page");
});

test("at the top they are taken in once: a redraw while they are offered takes nothing more", () => {
  const rows = aPage();
  land(rows);
  assert.equal(takes.length, 1, "taken in");
  land(rows);
  land(rows);
  assert.equal(takes.length, 1, "REGRESSION: each redraw took them again");
});

test("REGRESSION: what the reader does while the take is out is asked as it lands: a lead opened, or the page scrolled down", () => {
  const rows = aPage();
  land(rows);
  const still = takes[0];
  assert.equal(typeof still, "function", "REGRESSION: the take asked nothing of the reader as it landed");
  assert.equal(still(), true, "still at the top, no lead open");
  land(rows, { open: true });
  assert.equal(still(), false, "a lead opened meanwhile keeps them offered");
  land(rows, { open: false });
  W.scrollY = 300;
  assert.equal(still(), false, "and so does a page scrolled down");
});

test("on a desk the rows' own box says where the reader is", () => {
  const rows = aPage({ rowsScroll: true });
  rows.current.scrollTop = 300;
  land(rows);
  assert.equal(takes.length, 0, "down the list: offered");
  unmount();
  rows.current.scrollTop = 0;
  land(rows);
  assert.equal(takes.length, 1, "at its top: taken in");
});
