/**
 * The Pipeline's deal sheet on a phone (apps/dashboard/src/surfaces/people/pipeline/row-above-sheet.ts): the row it is of
 * is lifted above the sheet as it opens, and the rows go back down to where they stood as it closes over them.
 *
 * Ruben, 22 Oct 2026: after Back from a deal, the Pipeline stood a lift's height down, its controls and search under the
 * frame's top, and a refresh or the next arrival put it back so (its place kept the lift). The sheet gave back the room it
 * took at the rows' foot and never the scroll.
 *
 * Run against the hook itself, in a component drawn by hand, on a window, the rows and the sheet that answer what it asks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fromDashboard = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../apps/dashboard/src/legacy-bridge/_.js"),
);

/* ------------------------------ what stands in for a browser ------------------------------ */

/** An element: its top in the document (`at`, moved by the window's scroll), its height, and whether React hides it. */
const element = (name, { at = 0, height = 84, className = "" } = {}) => ({
  name,
  at,
  height,
  className,
  css: { overflowY: "visible", paddingBottom: "0px", maxHeight: "none" },
  style: {},
  dataset: {},
  parentElement: null,
  isConnected: true,
  hidden: false,
  getClientRects() {
    for (let n = this; n; n = n.parentElement) if (n.hidden) return [];
    return [{}];
  },
  getBoundingClientRect() {
    if (this.getClientRects().length === 0) return { top: 0, bottom: 0 };
    const top = this.at - win.scrollY;
    return { top, bottom: top + this.height };
  },
  closest(sel) {
    for (let n = this; n; n = n.parentElement) {
      if (sel === "[data-held]" && n.dataset.held !== undefined) return n;
      if (sel.startsWith(".") && n.className.split(" ").includes(sel.slice(1))) return n;
    }
    return null;
  },
});

/** The window: 659px tall with Safari's toolbar up, over a Pipeline 3,000px long. */
const win = {
  innerHeight: 659,
  scrollY: 0,
  getComputedStyle: (el) => el.css,
  frames: [],
  requestAnimationFrame(fn) {
    win.frames.push(fn);
    return win.frames.length;
  },
  cancelAnimationFrame(id) {
    win.frames[id - 1] = null;
  },
};
/** The frames asked for, drawn. */
const nextFrame = () => win.frames.splice(0).forEach((fn) => fn && fn());

const html = element("html", { height: 3000 });
const body = element("body", { height: 3000 });
body.parentElement = html;
Object.defineProperty(html, "scrollTop", {
  get: () => win.scrollY,
  set: (v) => {
    win.scrollY = v;
  },
});
Object.assign(html, {
  clientHeight: 659,
  scrollHeight: 3000,
  /** What the window was asked to scroll, in order. */
  asked: [],
  scrollBy({ top }) {
    html.asked.push(["by", top]);
    win.scrollY += top;
  },
  scrollTo({ top }) {
    html.asked.push(["to", top]);
    win.scrollY = top;
  },
});

/** The sheet: fixed over the screen's foot, as tall as it holds (307px); drawn while `isConnected`. */
const sheet = { css: { maxHeight: "560px" }, scrollHeight: 307, offsetTop: 0, offsetHeight: 659, isConnected: false };

/** The rows by id, and what else is drawn with an id (People's scope, kept out of sight, draws `person-<id>` too). */
const rows = new Map();
const decoys = new Map();
globalThis.window = win;
globalThis.getComputedStyle = win.getComputedStyle;
globalThis.document = {
  body,
  documentElement: html,
  scrollingElement: html,
  querySelectorAll: (sel) => {
    const id = /^\[id="(.+)"\]$/.exec(sel)?.[1];
    if (!id) return [];
    return [...(decoys.get(id) ?? []), ...(rows.has(id) ? [rows.get(id)] : [])];
  },
  querySelector: (sel) => (sel === '[data-testid="pipeline-peek"]' && sheet.isConnected ? sheet : null),
};

/* ------------------------------ the hook, drawn by hand ------------------------------ */

const react = fromDashboard("react");
const { useRowAboveSheet } = fromDashboard("../surfaces/people/pipeline/row-above-sheet.ts");
const { placeReader, readersScroll } = fromDashboard("../surfaces/kit/motion/page-scroll.ts");

/**
 * The deal sheet's part drawn by hand: its cells kept between draws, its effects run after each draw whose inputs changed
 * (after the paint, as React runs them). `hide` is React's Activity taking the scope out of sight (a person's page opened
 * from the sheet): its effects stop; `show` brings it back, and every one starts again. `open(id)` draws the sheet over
 * the rows, `close()` takes it away (Back, its Close, a pull down) and draws the part with no deal.
 */
const sheetPart = () => {
  const cells = [];
  const effects = [];
  let hidden = false;
  const draw = (id, { landed = false } = {}) => {
    let i = 0;
    let e = 0;
    react.useRef = (v) => ((cells[i] ??= { current: v }), cells[i++]);
    react.useEffect = (fn, deps) => {
      const at = e++;
      const was = effects[at];
      if (was && !was.due && deps.every((d, k) => Object.is(d, was.deps[k]))) return;
      effects[at] = { fn, deps, cleanup: was?.cleanup, due: true };
    };
    useRowAboveSheet(true, id, landed);
    if (hidden) return;
    for (const ef of effects) {
      if (!ef.due) continue;
      ef.due = false;
      if (typeof ef.cleanup === "function") ef.cleanup();
      ef.cleanup = ef.fn();
    }
  };
  const hide = () => {
    hidden = true;
    for (const ef of effects) {
      if (typeof ef.cleanup === "function") ef.cleanup();
      ef.cleanup = undefined;
      ef.due = true;
    }
  };
  const show = () => (hidden = false);
  const open = (id, opts) => {
    sheet.isConnected = true;
    draw(id, opts);
  };
  const close = () => {
    sheet.isConnected = false;
    draw(null);
  };
  return { draw, hide, show, open, close };
};

/** The Pipeline on a phone, at its top: its scope and rows of 84px from `from` down the page. */
const pipeline = ({ from = 380 } = {}) => {
  rows.clear();
  decoys.clear();
  sheet.isConnected = false;
  win.scrollY = 0;
  win.frames.length = 0;
  html.asked.length = 0;
  html.scrollHeight = 3000;
  html.style = {};
  const scope = element("scope", { className: "clients pipe-scope" });
  scope.parentElement = body;
  for (let i = 0; i < 12; i++) {
    const row = element("row", { at: from + 84 * i });
    row.parentElement = scope;
    rows.set(`person-d${i}`, row);
  }
  return { scope };
};

/** The row of `id` drawn again in `scope` at `at` (a deal moved on, into another group), or folded away (`at` null). */
const drawnAgain = (scope, id, at) => {
  const key = `person-${id}`;
  const was = rows.get(key);
  was.isConnected = false;
  was.parentElement = null;
  if (at === null) {
    rows.delete(key);
    return;
  }
  const row = element("row", { at });
  row.parentElement = scope;
  rows.set(key, row);
};

/* ------------------------------------------ cases ------------------------------------------ */

test("a deal opened low on the screen: its row is lifted above the sheet, and the rows go back down as it closes", () => {
  pipeline();
  const part = sheetPart();
  part.draw(null);
  // The third row, 548 to 632 down a 659px screen: under the sheet, whose top stands at 352.
  part.open("d2");
  nextFrame();
  assert.deepEqual(html.asked, [["by", 292]], "lifted clear of the sheet's top, by its 12px of room");
  assert.equal(win.scrollY, 292);
  // Back, the sheet's Close or a pull down: the sheet is gone.
  part.close();
  assert.deepEqual(html.asked.at(-1), ["to", 0], "the rows back where they stood as it opened");
  assert.equal(win.scrollY, 0);
});

test("while the lift stands the list's place is where the reader left it, and once given back it is theirs again", () => {
  pipeline();
  const part = sheetPart();
  part.draw(null);
  part.open("d2");
  nextFrame();
  assert.equal(readersScroll(html, 292), 0, "the reader's place under a lift: where they had left the rows");
  part.close();
  assert.equal(readersScroll(html, 120), 120, "given back: what is heard is theirs");
});

test("the list's place put back under the lift (the sheet's address opened it, a reload) lifts the row again from there", () => {
  pipeline();
  const part = sheetPart();
  part.draw(null);
  part.open("d2");
  nextFrame();
  // The place the tab kept comes back after the lift: 100 down.
  placeReader(html, 100);
  assert.deepEqual(
    html.asked,
    [
      ["by", 292],
      ["by", 192],
    ],
    "the row lifted again, from the place",
  );
  assert.equal(win.scrollY, 292);
  assert.equal(readersScroll(html, 999), 100, "the reader's place under the lift");
  part.close();
  assert.equal(win.scrollY, 100, "and given back there");
});

test("a walk to the next row lifts the rows on, and the close takes them back to where they stood as the sheet opened", () => {
  pipeline();
  const part = sheetPart();
  part.draw(null);
  part.open("d2");
  nextFrame();
  part.open("d3");
  nextFrame();
  assert.equal(win.scrollY, 292 + 84, "the next row lifted too");
  part.close();
  assert.equal(win.scrollY, 0);
});

test("a deal moved on by the sheet (drawn again in another group, or folded away) still has its rows given back", () => {
  // Mark won, Propose, a pass: People is read again and the row is drawn anew under another group, or not at all in the
  // folded Passed or ended, while the sheet stands on the deal. The lifted row was gone, and nothing was given back.
  const { scope } = pipeline();
  const part = sheetPart();
  part.draw(null);
  part.open("d2");
  nextFrame();
  drawnAgain(scope, "d2", 1200);
  part.close();
  assert.equal(win.scrollY, 0, "a row drawn again");
  const again = pipeline();
  const folded = sheetPart();
  folded.draw(null);
  folded.open("d2");
  nextFrame();
  drawnAgain(again.scope, "d2", null);
  folded.close();
  assert.equal(win.scrollY, 0, "a row folded away");
});

test("the row lifted is the one drawn, not People's of the same id kept out of sight beside the Pipeline", () => {
  pipeline();
  const hiddenScope = element("people-scope");
  hiddenScope.hidden = true;
  const theirs = element("row", { at: 900 });
  theirs.parentElement = hiddenScope;
  decoys.set("person-d2", [theirs]);
  const part = sheetPart();
  part.draw(null);
  part.open("d2");
  nextFrame();
  assert.deepEqual(html.asked, [["by", 292]], "lifted: People's row, first and without a box, was taken for it");
  part.close();
  assert.equal(win.scrollY, 0);
});

test("a person's page opened from the sheet leaves the window to their page: the lift is given back by the close that ends the sheet", () => {
  const { scope } = pipeline();
  const part = sheetPart();
  part.draw(null);
  part.open("d2");
  nextFrame();
  // Their page takes the screen: the scope and the sheet over it are kept out of sight, and the window is their page's.
  scope.hidden = true;
  part.hide();
  html.asked.length = 0;
  win.scrollY = 600; // read down their page
  assert.deepEqual(html.asked, [], "nothing of the sheet moves their page");
  // Back: the scope is shown again where it stood (held-list.ts), the sheet open over it once more.
  scope.hidden = false;
  win.scrollY = 292;
  part.show();
  part.open("d2", { landed: true });
  nextFrame();
  assert.equal(win.scrollY, 292, "the row is above the sheet already");
  part.close();
  assert.equal(win.scrollY, 0, "and the close takes the rows back to where they stood before it all");
});

test("the sheet's effects run again while it stands (the scope shown again, twice in development): nothing is given back", () => {
  pipeline();
  const part = sheetPart();
  part.draw(null);
  part.open("d2");
  nextFrame();
  part.hide();
  part.show();
  part.draw("d2", { landed: true });
  nextFrame();
  assert.deepEqual(html.asked, [["by", 292]], "no glide back under the open sheet, and no second lift");
  part.close();
  assert.equal(win.scrollY, 0);
});

test("a sheet gone while its scope was out of sight gives the rows back as the scope is shown again", () => {
  const { scope } = pipeline();
  const part = sheetPart();
  part.draw(null);
  part.open("d2");
  nextFrame();
  scope.hidden = true;
  part.hide();
  // Away, the deal is closed: the sheet goes, and the part is drawn with no deal while out of sight.
  sheet.isConnected = false;
  part.draw(null);
  scope.hidden = false;
  win.scrollY = 292; // the scope shown where it stood
  part.show();
  part.draw(null);
  assert.equal(win.scrollY, 0, "the rows back where they stood as it opened");
});

test("a few deals: the room taken at the rows' foot is theirs again, and the rows go back down with it", () => {
  pipeline();
  html.scrollHeight = 700; // the rows end 41px past the screen: short of the lift
  const part = sheetPart();
  part.draw(null);
  part.open("d2");
  nextFrame();
  assert.equal(html.style.paddingBottom, `${292 - 41}px`, "room given at the foot");
  part.close();
  assert.equal(html.style.paddingBottom, undefined, "the scroller's own padding again");
  assert.equal(win.scrollY, 0);
});

test("a row clear of the sheet is lifted by nothing, and nothing is given back as it closes", () => {
  pipeline({ from: 120 });
  const part = sheetPart();
  part.draw(null);
  part.open("d1"); // 204 to 288, over the sheet's top at 352
  nextFrame();
  part.close();
  assert.deepEqual(html.asked, [], "the window never moved");
});
