/**
 * A long list that scrolls its own rows draws the rows it is scrolled to (apps/dashboard/src/surfaces/kit/rows/shown-rows.ts).
 *
 * Conversations' rows box scrolls itself (conversations.css .cv-rows), and it is the element its window of rows is given.
 * The box that scrolls a list was looked for from that element's parent up, so on a desk, where nothing above the box
 * scrolls, the window was heard, and it never moves: the first screen's rows stayed drawn as the box scrolled, the list
 * ended halfway down the pane over the room held for the rest, and further down it was blank (Ruben, 27 Oct 2026, a
 * hundred conversations once his mailbox came in; a list under forty is drawn whole, so none had shown it).
 *
 * Run against the hook and its virtualizer themselves, drawn on the shared stub React, over a page whose boxes answer
 * what the two ask of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installLegacyReact, fresh, again } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";

installLegacyReact();
// The runner's react-dom is its server entry, which has no flushSync: a scroll the virtualizer hears draws again at once.
const fromDashboard = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/dashboard/src/legacy-bridge/_.js"),
);
fromDashboard("react-dom").flushSync ??= (fn) => fn();
const { useShownRows } = await importSrc("apps/dashboard/src/surfaces/kit/rows/shown-rows.ts");

/** A row's height, the room over the first row inside the box, how many rows, and how tall the box is. */
const ROW_PX = 76;
const PAD_PX = 8;
const ROWS = 120;
const BOX_PX = 500;

/** A box of the page: its own overflow, how tall it is and how much it holds, where it stands, and what it hears. */
const pageBox = (name, { overflowY = "visible", holds = BOX_PX, top = 0 } = {}) => {
  const heard = new Map();
  return {
    name,
    parentElement: null,
    css: { overflowY, paddingTop: `${PAD_PX}px`, rowGap: "0px", marginTop: "0px", marginBottom: "0px" },
    offsetWidth: 360,
    offsetHeight: BOX_PX,
    clientHeight: BOX_PX,
    scrollHeight: holds,
    scrollTop: 0,
    ownerDocument: { defaultView: globalThis },
    getBoundingClientRect: () => ({ top, bottom: top + BOX_PX, left: 0, width: 360, height: BOX_PX }),
    getAttribute: () => null,
    getClientRects: () => [{}],
    closest: () => null,
    contains(other) {
      for (let n = other; n; n = n.parentElement) if (n === this) return true;
      return false;
    },
    addEventListener: (kind, fn) => (heard.get(kind) ?? heard.set(kind, new Set()).get(kind)).add(fn),
    removeEventListener: (kind, fn) => heard.get(kind)?.delete(fn),
    /** The browser tells whoever listens that this box scrolled. */
    scrolled: () => [...(heard.get("scroll") ?? [])].forEach((fn) => fn({ type: "scroll" })),
  };
};

/** The page a desk draws Conversations on: the frame, the list's pane, and in it the rows box, which scrolls itself. */
function desk() {
  const html = pageBox("html");
  const body = pageBox("body");
  const pane = pageBox("pane", { overflowY: "hidden", top: 120 });
  const rows = pageBox("rows", { overflowY: "auto", holds: PAD_PX * 2 + ROWS * ROW_PX, top: 120 });
  body.parentElement = html;
  pane.parentElement = body;
  rows.parentElement = pane;
  Object.assign(globalThis.document, { documentElement: html, scrollingElement: html, body });
  return rows;
}

let shown = null;
let listName = "a list that scrolls itself";
function Rows() {
  shown = useShownRows({ name: listName, count: ROWS, estimate: ROW_PX, keyOf: (i) => `c${i}` });
  return null;
}
const draw = () => again(() => globalThis.React.createElement(Rows));
const drawnRows = () => shown.parts.filter((p) => p.kind === "row").map((p) => p.index);

test("REGRESSION: a list whose own box scrolls draws the rows that box is scrolled to, not the first screen's", () => {
  const kept = {
    Window: globalThis.Window,
    ResizeObserver: globalThis.ResizeObserver,
    getComputedStyle: globalThis.getComputedStyle,
    innerHeight: globalThis.innerHeight,
    scrollY: globalThis.scrollY,
    document: { ...globalThis.document },
  };
  // The stub's window is the global itself: it is the one Window there is.
  globalThis.Window = class {
    static [Symbol.hasInstance](x) {
      return x === globalThis;
    }
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.getComputedStyle = (el) => el.css;
  globalThis.innerHeight = 800;
  globalThis.scrollY = 0;
  try {
    fresh();
    const rows = desk();
    draw();
    shown.listRef(rows);
    // Found where it scrolls, then drawn with its virtualizer, as React draws after each.
    for (let k = 0; k < 4; k++) draw();
    rows.scrollTop = 2000;
    rows.scrolled();
    draw();
    const onScreen = [];
    for (let i = 0; i < ROWS; i++) {
      const top = PAD_PX + i * ROW_PX;
      if (top < rows.scrollTop + BOX_PX && top + ROW_PX > rows.scrollTop) onScreen.push(i);
    }
    const drawn = drawnRows();
    assert.deepEqual(
      onScreen.filter((i) => !drawn.includes(i)),
      [],
      `every row on screen is drawn, rows ${onScreen[0]} to ${onScreen.at(-1)}; drawn: ${drawn.join(", ")}`,
    );
    assert.ok(drawn.length < ROWS / 2, `still a window of the rows, not all ${ROWS}: ${drawn.length}`);
  } finally {
    globalThis.Window = kept.Window;
    globalThis.ResizeObserver = kept.ResizeObserver;
    globalThis.getComputedStyle = kept.getComputedStyle;
    globalThis.innerHeight = kept.innerHeight;
    globalThis.scrollY = kept.scrollY;
    Object.assign(globalThis.document, kept.document);
    delete globalThis.document.scrollingElement;
  }
});

/** The window a phone scrolls a list in: nothing above the list scrolls, and a count of each thing asked of the page. */
function onAPhone() {
  const asked = { style: 0, box: 0, height: 0 };
  const html = pageBox("html");
  const body = pageBox("body");
  const list = pageBox("list", { top: 300 });
  body.parentElement = html;
  list.parentElement = body;
  const rect = list.getBoundingClientRect;
  list.getBoundingClientRect = () => {
    asked.box += 1;
    return rect();
  };
  Object.assign(globalThis.document, { documentElement: html, scrollingElement: html, body });
  const row = (i) => ({
    isConnected: true,
    ownerDocument: list.ownerDocument,
    css: list.css,
    getAttribute: (name) => (name === "data-index" ? String(i) : null),
    getClientRects: () => [{}],
    get offsetHeight() {
      asked.height += 1;
      // Not the guess: a size the guess had right is one the virtualizer has nothing to keep of.
      return ROW_PX + 4;
    },
  });
  /** A row of a list a page hides: drawn, with no layout, so it measures nothing. */
  const hiddenRow = (i) => ({ ...row(i), getClientRects: () => [], offsetHeight: 0 });
  return { asked, list, row, hiddenRow };
}

/** The observers made under `withAWindow`: what the browser would tell, told by hand. */
const observersHeard = [];

/** Everything a phone's window asks of the page, stood in, around `run`. */
function withAWindow(run, asked) {
  const kept = {
    Window: globalThis.Window,
    ResizeObserver: globalThis.ResizeObserver,
    getComputedStyle: globalThis.getComputedStyle,
    innerHeight: globalThis.innerHeight,
    innerWidth: globalThis.innerWidth,
    scrollY: globalThis.scrollY,
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    window: globalThis.window,
    document: { ...globalThis.document },
  };
  globalThis.Window = class {
    static [Symbol.hasInstance](x) {
      return x === globalThis;
    }
  };
  globalThis.window = globalThis;
  globalThis.ResizeObserver = class {
    constructor(heard) {
      observersHeard.push(heard);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.getComputedStyle = (el) => {
    asked.current.style += 1;
    return el.css;
  };
  globalThis.innerHeight = 800;
  globalThis.innerWidth = 390;
  globalThis.scrollY = 0;
  globalThis.addEventListener ??= () => {};
  globalThis.removeEventListener ??= () => {};
  try {
    run();
  } finally {
    Object.assign(globalThis, kept);
    if (kept.window === undefined) delete globalThis.window;
    Object.assign(globalThis.document, kept.document);
    delete globalThis.document.scrollingElement;
  }
}

test("a list a page hides teaches nothing: where it stands is not kept from a list with no layout", () => {
  // A thread opened by its address on a phone: the Inbox's list stands under it at display: none, not held (mobile.css), and
  // a scroll of the thread hid the toolbar, which is a resize. Its top reads 0, so it started as far down as the thread was
  // scrolled, and the next time it was drawn it drew seven rows of its first screen and nothing under them.
  const asked = { current: { style: 0, box: 0, height: 0 } };
  withAWindow(() => {
    listName = "a list a page hides";
    const heard = [];
    const hearing = globalThis.addEventListener;
    globalThis.addEventListener = (kind, fn) => kind === "resize" && heard.push(fn);
    try {
      const page = onAPhone();
      asked.current = page.asked;
      fresh();
      draw();
      shown.listRef(page.list);
      for (let k = 0; k < 4; k++) draw();
      const whereItStands = drawnRows();

      page.list.getClientRects = () => [];
      page.list.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, width: 0, height: 0 });
      globalThis.scrollY = 5000;
      // The list's own ear is the first on the window: the virtualizer's come once it has found where it scrolls.
      heard[0]();
      globalThis.scrollY = 0;
      shown.listRef(null);

      fresh();
      draw();
      assert.deepEqual(
        drawnRows(),
        whereItStands,
        "drawn anew, its first screen's rows, not the handful 5,000 px would leave",
      );
      shown.listRef(null);
    } finally {
      globalThis.addEventListener = hearing;
      listName = "a list that scrolls itself";
    }
  }, asked);
});

test("a row with no layout measures nothing and teaches nothing: a list a page hides draws its window, then and the next time it is drawn", () => {
  // Rows under a thread measured about 0, so the window held every row; and those sizes were kept, so the next press on the
  // Inbox made 1,393 fibers against 481 (the hidden list's own session, 7 Nov 2026).
  const asked = { current: { style: 0, box: 0, height: 0 } };
  withAWindow(() => {
    listName = "a list a thread stands over";
    const page = onAPhone();
    asked.current = page.asked;
    fresh();
    draw();
    shown.listRef(page.list);
    for (let k = 0; k < 4; k++) draw();
    const seen = drawnRows();
    for (const i of seen) shown.measure(page.row(i));
    draw();
    const measured = drawnRows();

    // Hidden as it stands: each row's observer says it is 0 tall.
    observersHeard.length = 0;
    shown.listRef(null);
    fresh();
    draw();
    const under = onAPhone();
    asked.current = under.asked;
    under.list.getClientRects = () => [];
    shown.listRef(under.list);
    assert.deepEqual(drawnRows(), measured, "drawn anew under a thread, the window it knows");
    for (const i of drawnRows()) shown.measure(under.hiddenRow(i));
    draw();
    assert.deepEqual(drawnRows(), measured, "and no more rows for rows that measured nothing, put in the page");
    const told = measured.map((i) => ({
      target: under.hiddenRow(i),
      borderBoxSize: [{ blockSize: 0, inlineSize: 0 }],
    }));
    for (const heard of [...observersHeard]) heard(told);
    draw();
    assert.deepEqual(drawnRows(), measured, "nor for an observer's saying so");
    shown.listRef(null);

    fresh();
    draw();
    assert.deepEqual(drawnRows(), measured, "and the next time it is drawn, it has learned nothing from it");
    shown.listRef(null);

    // Rows first measured while hidden: there is no room known to keep, so the guess stands.
    listName = "a list never measured but under a thread";
    const before = onAPhone();
    asked.current = before.asked;
    fresh();
    draw();
    shown.listRef(before.list);
    for (let k = 0; k < 4; k++) draw();
    const guessed = drawnRows();
    shown.listRef(null);
    const hidden = onAPhone();
    asked.current = hidden.asked;
    hidden.list.getClientRects = () => [];
    fresh();
    draw();
    shown.listRef(hidden.list);
    for (const i of drawnRows()) shown.measure(hidden.hiddenRow(i));
    draw();
    assert.deepEqual(drawnRows(), guessed, "rows that measured nothing leave the window as the guess drew it");
    shown.listRef(null);
    listName = "a list that scrolls itself";
  }, asked);
});

test("a list the window scrolls, drawn anew, knows where it scrolls and what its rows measure: one draw of the first screen's rows, and nothing asked of the page in the commit", () => {
  // Every press of a tab draws its list anew. It drew forty rows, asked the page where it scrolls, and drew again with the
  // twenty-odd of the window, then asked each row its height, and drew again: 7 commits a press at 2,000 people, 5 with few.
  const asked = { current: { style: 0, box: 0, height: 0 } };
  withAWindow(() => {
    listName = "a list the window scrolls";
    const first = onAPhone();
    asked.current = first.asked;
    fresh();
    draw();
    assert.equal(drawnRows().length, 40, "the first time, its first screen as it guesses it");
    shown.listRef(first.list);
    for (let k = 0; k < 4; k++) draw();
    const windowed = drawnRows();
    assert.ok(windowed.length < 40, `then the window of it: ${windowed.length}`);
    for (const i of windowed) shown.measure(first.row(i));
    assert.ok(first.asked.height > 0, "and each row asked its height");
    shown.listRef(null);

    const next = onAPhone();
    asked.current = next.asked;
    fresh();
    draw();
    const anew = drawnRows();
    assert.ok(anew.length < 40, `drawn anew, the window's rows from the first draw: ${anew.length}`);
    assert.deepEqual(
      anew.slice(0, 11),
      Array.from({ length: 11 }, (_, i) => i),
      "the first screen's, a phone's height of them",
    );
    shown.listRef(next.list);
    for (const i of anew) shown.measure(next.row(i));
    assert.deepEqual(next.asked, { style: 0, box: 0, height: 0 }, "and nothing asked of the page in the commit");
    draw();
    assert.deepEqual(drawnRows(), anew, "and no other rows for what it was told");
    shown.listRef(null);
    listName = "a list that scrolls itself";
  }, asked);
});

test("a row put back in the page asks the page nothing for its room", () => {
  const asked = { current: { style: 0, box: 0, height: 0 } };
  withAWindow(() => {
    listName = "a list whose rows come and go";
    const page = onAPhone();
    asked.current = page.asked;
    page.list.css.marginTop = "1px";
    page.list.css.marginBottom = "1px";
    fresh();
    draw();
    shown.listRef(page.list);
    for (let k = 0; k < 4; k++) draw();
    shown.measure(page.row(0));
    draw();
    const was = { ...page.asked };
    // React takes the row away as it scrolls off, and puts a new element in as it comes back.
    for (let n = 0; n < 3; n++) {
      shown.measure(page.row(0));
      draw();
    }
    assert.deepEqual(page.asked, was, "neither its height nor its margins asked again");
    shown.listRef(null);
    listName = "a list that scrolls itself";
  }, asked);
});
