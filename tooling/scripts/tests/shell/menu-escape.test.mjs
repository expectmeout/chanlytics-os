/**
 * A menu that escapes its pane (MoreMenu `escape`, data-bits.jsx moreFit).
 *
 * On 21 September the Leads rail's search menu was capped at 196px (#760), because the rail scrolls and cuts off
 * whatever crosses its edge, and #769 then gave every menu 13px words, 11px gaps and a 232px floor. In the rail the
 * cap won: "Remove the ones you haven't touched" and its meta broke onto six lines, the item 116px tall. An escaped
 * menu is placed against the window instead, as wide as every other menu. Its placement is arithmetic on the boxes a
 * browser reports, so it is run here on elements that report them; the menu's own wiring is run on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hookFrames } from "../_hook-frames.mjs";

const listeners = [];
globalThis.window = {
  innerWidth: 1440,
  innerHeight: 900,
  canDo: () => true,
  gate: () => ({}),
  addEventListener(type, fn, opts) {
    listeners.push({ type, fn, opts });
  },
  removeEventListener(type, fn) {
    const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
    if (i >= 0) listeners.splice(i, 1);
  },
  setTimeout: () => 1,
  clearTimeout() {},
};
globalThis.document = {
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }),
};

let cells = {};
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { MoreMenu, moreFit } = globalThis.window;

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && pred(n)) hit = n;
  });
  return hit;
};
const classesOf = (n) =>
  String(n?.props?.className || "")
    .split(" ")
    .filter(Boolean);
const menuOf = (tree) => find(tree, (n) => classesOf(n).includes("more-menu"));

/**
 * A menu as a browser reports it: where its style puts it, moved by whatever containing block it sits in (a
 * transformed ancestor), and no taller than its max-height. The trigger is a fixed box.
 */
const boxes = ({ trigger, w = 292, h = 296, alignLeft = true, offset = { x: 0, y: 0 } }) => {
  const classes = new Set(["more-menu", alignLeft ? "align-left" : "align-right", "escape"]);
  const style = {};
  const px = (v) => (v === undefined ? 0 : Number.parseFloat(v));
  const menu = {
    style,
    classList: {
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      add: (c) => classes.add(c),
    },
    getBoundingClientRect: () => {
      const left = px(style.left) + offset.x;
      const top = px(style.top) + offset.y;
      const height = style.maxHeight ? Math.min(h, px(style.maxHeight)) : h;
      return { left, top, width: w, height, right: left + w, bottom: top + height };
    },
    // As a browser's Node.contains: it answers for a node, and throws for anything else (the window, say).
    contains: (t) => {
      if (!t || typeof t.nodeType !== "number") throw new TypeError("parameter 1 is not of type 'Node'");
      return t === INSIDE;
    },
  };
  const wrap = {
    querySelector: (s) =>
      s === ":scope > button" ? { getBoundingClientRect: () => trigger } : s === ":scope > .more-menu" ? menu : null,
  };
  return { wrap, menu, classes };
};
const placed = (spec, size = { w: 1440, h: 900 }) => {
  globalThis.window.innerWidth = size.w;
  globalThis.window.innerHeight = size.h;
  const b = boxes(spec);
  moreFit(b.wrap);
  const r = b.menu.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    bottom: r.bottom,
    maxHeight: b.menu.style.maxHeight,
    up: b.classes.has("up"),
    placed: b.classes.has("placed"),
  };
};
// The Leads rail's … on a search row: a 22px button near the rail's right edge.
const RAIL = (top) => ({ left: 230, right: 252, top, bottom: top + 22 });
// What an event's target can be: a node inside the menu, a node outside it (the rail), or the window itself.
const INSIDE = { nodeType: 1 };
const THE_RAIL = { nodeType: 1 };
const THE_WINDOW = {};

test("an escaped menu hangs under its trigger at a menu's full width, on the side it names, held inside the window", () => {
  // Room below: under the trigger by the menu's own 8px, hung from the trigger's left edge, so it opens over the table.
  assert.deepEqual(placed({ trigger: RAIL(300) }), {
    top: 330,
    left: 230,
    bottom: 626,
    maxHeight: undefined,
    up: false,
    placed: true,
  });
  // Hung from the right edge it would start 40px past the window's left edge; it is held 8px inside instead.
  assert.equal(placed({ trigger: RAIL(300), alignLeft: false }).left, 8);
  // And a trigger at the window's right edge keeps the menu 8px inside that edge.
  assert.equal(placed({ trigger: { left: 1400, right: 1422, top: 300, bottom: 322 } }).left, 1440 - 8 - 292);
});

test("an escaped menu turns up above its trigger when the window has more room there, and takes only the room there is", () => {
  // 102px below and 744 above: it opens upward, its foot 8px above the trigger.
  const up = placed({ trigger: RAIL(760) });
  assert.deepEqual([up.up, up.top, up.bottom], [true, 456, 752]);
  assert.equal(up.maxHeight, undefined, "it fits, so it keeps its own height");
  // A short window with no room for all of it on either side: the larger side, the menu as tall as that room (it
  // scrolls inside), never past the window's edge and never over its own trigger.
  const short = placed({ trigger: RAIL(200) }, { w: 1440, h: 420 });
  assert.deepEqual([short.up, short.top, short.bottom, short.maxHeight], [true, 8, 192, "184px"]);
  assert.ok(short.bottom <= 200 - 8, "its foot stays clear of the trigger");
});

test("an escaped menu lands where it was meant to under a transformed ancestor, which makes itself a fixed box's containing block", () => {
  assert.deepEqual(placed({ trigger: RAIL(300), offset: { x: 40, y: 12 } }), {
    top: 330,
    left: 230,
    bottom: 626,
    maxHeight: undefined,
    up: false,
    placed: true,
  });
});

test("a menu that cannot be measured is left alone", () => {
  moreFit(null);
  moreFit({});
  moreFit({ querySelector: () => null });
  moreFit({ querySelector: (s) => (s === ":scope > button" ? {} : null) });
});

test("the menu wears .escape only when asked, and an escaped one closes on a scroll outside it or a resize", () => {
  const items = [
    { label: "Rename", icon: "pencil", onClick() {} },
    { label: "Find new ones", icon: "refresh", meta: "Only places not already in your leads count", onClick() {} },
  ];
  const open = (props) => {
    cells = {};
    frames.begin();
    const first = MoreMenu({ items, ...props });
    find(first, (n) => n.type === "button" && n.props["aria-haspopup"] === "menu").props.onClick({
      stopPropagation() {},
    });
    frames.begin();
    return MoreMenu({ items, ...props });
  };
  assert.deepEqual(classesOf(menuOf(open({ escape: true, align: "left" }))), ["more-menu", "align-left", "escape"]);
  assert.deepEqual(classesOf(menuOf(open({}))), ["more-menu", "align-right"], "every other menu is as it was");

  // Drawn open (its state and its ref as the page would hold them), the effect places it and listens.
  globalThis.window.innerWidth = 1440;
  globalThis.window.innerHeight = 900;
  const b = boxes({ trigger: RAIL(300) });
  listeners.length = 0;
  cells = { ":0": true, ":1": { current: b.wrap } }; // the menu's open state and its box, the first two hooks it calls at the root
  frames.begin();
  MoreMenu({ items, escape: true, align: "left" });
  assert.ok(b.classes.has("placed"), "placed as it opens");
  const on = (type) => listeners.find((l) => l.type === type);
  assert.equal(
    on("scroll").opts,
    true,
    "a scroll anywhere reaches it: it listens in the capture phase, since scroll does not bubble",
  );
  on("scroll").fn({ target: INSIDE });
  assert.equal(cells[":0"], true, "its own list scrolling (a menu taller than its room) keeps it open");
  on("scroll").fn({ target: THE_RAIL });
  assert.equal(cells[":0"], false, "the page under it moving closes it, rather than leave it beside the wrong row");
  cells[":0"] = true;
  // A resize's target is the window, which is not a node: asking whether the menu holds it threw, in a real browser,
  // before the menu could close (found on the probe page, 21 Sep).
  on("resize").fn({ target: THE_WINDOW });
  assert.equal(cells[":0"], false, "and so does a resize");

  // A menu that does not escape moves with its trigger, so it listens for Escape alone, as before.
  listeners.length = 0;
  cells = { ":0": true, ":1": { current: null } }; // the menu's open state and its box, the first two hooks it calls at the root
  frames.begin();
  MoreMenu({ items });
  assert.deepEqual(
    listeners.map((l) => l.type),
    ["keydown"],
  );
});

test("an item with `checked` is one of a set: a menuitemradio, ticked when chosen, its words in one column with the rest", () => {
  const items = [
    { header: "Sort" },
    { label: "Needs you first", checked: false, onClick() {} },
    { label: "Latest contact first", checked: true, onClick() {} },
    { label: "Export everyone", icon: "external", onClick() {} },
  ];
  // Drawn open, as the page holds it once its trigger is pressed.
  cells = { ":0": true, ":1": { current: null } }; // the menu's open state and its box, the first two hooks it calls at the root
  frames.begin();
  const open = MoreMenu({ items });
  const rows = [];
  walk(open, (n) => {
    if (n.type === "button" && classesOf(n).includes("more-item")) rows.push(n);
  });
  const kids = (n) => (n.props.children || []).flat(Infinity);
  const said = (n) =>
    kids(n)
      .find((k) => k && k.props && k.props.className === "more-item-label")
      .props.children.join("");
  assert.deepEqual(
    rows.map((n) => [said(n), n.props.role, n.props["aria-checked"]]),
    [
      ["Needs you first", "menuitemradio", false],
      ["Latest contact first", "menuitemradio", true],
      ["Export everyone", "menuitem", undefined],
    ],
  );
  // Every item of a set draws the tick, and components.css hides it where aria-checked is false, so the words of the
  // one chosen and the rest stand in one column.
  assert.deepEqual(
    rows.map((n) => (kids(n).find((k) => k && k.type === "Icon") || { props: {} }).props.name),
    ["check", "check", "external"],
  );
});
