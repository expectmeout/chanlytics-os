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
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../../apps/dashboard/src/legacy-bridge/_.js"),
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
function Rows() {
  shown = useShownRows({ count: ROWS, estimate: ROW_PX, keyOf: (i) => `c${i}` });
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
