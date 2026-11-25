/**
 * The world the tests of record-kit/ share. Split by behaviour from record-kit.test.mjs on 25 Nov 2026 (layer 14: a
 * test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The record kit, EXECUTED on the stub React: the row, the fields, the fold, the inline editor, the registry that keeps
 * one open, and the sheet. No source-text assertions: every claim here is something the kit drew. The kit serves every
 * Settings tab, so it is tested here on its own, and a page's tests live in the page's own file, where a change to the
 * page cannot break these.
 */
import { stateOf } from "@chanlytics/contracts";
import { installStubReact, again, unmount, all, find } from "../../_stub-react.mjs";
import { KIT_GLOBALS } from "../../../apps/dashboard/src/surfaces/kit/kit-globals.ts";

// The app's chrome bridge publishes contracts' stateOf as __chrome.state (bridge/shell.ts). Without it every
// StatePill is plain, and no tone could be read here.
installStubReact({ __chrome: { state: stateOf } });

export const SRC = "../../../apps/dashboard/src";

Object.assign(globalThis, {
  CHANLY: { nav: () => {}, R: {} },
  canDo: () => true,
  gate: () => ({}),
  usePPToast: () => [null, () => {}],
});

(await import(`${SRC}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();

export const W = globalThis.window;

/** A glyph: the kit's Icon, which the record kit draws itself (the shell's pages draw the host element "Icon"). */
export const isIcon = (n) => n.type === KIT_GLOBALS.Icon;

/** A component the tree draws that is not a glyph: what asks React for a hook or a name. */
export const components = (tree) => all(tree, (n) => typeof n.type === "function" && !isIcon(n));

/** Whether a selector list asks for this root, as document.querySelector reads ".app-root, .fr-shell". */
export const inRoots = (sel, root) =>
  String(sel)
    .split(",")
    .map((x) => x.trim())
    .includes(root);

/**
 * A new tree, drawn as today-page.test.mjs draws one, over the last one unmounted as React replaces a tree: its effects
 * clean up (a fold's hold on the registry among them), its cells are forgotten, and the component is created.
 */
export const draw = (Comp, props = {}) => {
  unmount();
  return W.React.createElement(Comp, props);
};

/** The same tree again, over the same hook cells, as React draws it after a state change. */
export const redraw = (Comp, props = {}) => again(() => W.React.createElement(Comp, props));

export const byId = (tree, id) => find(tree, (n) => n.props?.id === id);

export const numbers = {
  label: "The number to publish",
  value: "line",
  options: [
    { value: "line", label: "Your line" },
    { value: "other", label: "A different number" },
  ],
};

/* ------------------------------------ the fold ------------------------------------ */

export const bookingRules = (over = {}) => ({
  id: "booking_rules",
  label: "Booking rules",
  hint: "It never books. It says which times are open and sends the link.",
  open: true,
  says: "Booking rules:\n- At least 2 hours' notice for any appointment.",
  saysLabel: "Your receptionist will be told",
  onSave: () => {},
  onCancel: () => {},
  ...over,
});

/* ------------------------------------ the fold on a phone ------------------------------------ */

export const dialogOf = (tree) => find(tree, (n) => n.props?.role === "dialog");

/** A fold as a page draws one, with a field of its own in it. */
export const drawFold = (props, field = W.React.createElement("input", { className: "rec-input", id: "bt-lead" })) => {
  unmount();
  return W.React.createElement(W.RecordFold, props, field);
};

/**
 * A stand-in for the elements React puts on the page, as much of the DOM as the sheet's leaving asks of them: what a
 * copy is made of, what it is made into, and where it goes.
 */
export const fakeNode = (name, attrs = {}, kids = []) => {
  const n = {
    name,
    attrs: { ...attrs },
    kids,
    scrollTop: 0,
    heard: {},
    removed: false,
    cloneNode: (deep) => fakeNode(name, n.attrs, deep ? kids.map((k) => k.cloneNode(true)) : []),
    setAttribute: (k, v) => {
      n.attrs[k] = String(v);
    },
    removeAttribute: (k) => {
      delete n.attrs[k];
    },
    querySelectorAll: () => kids.flatMap((k) => [k, ...k.querySelectorAll()]),
    querySelector: (sel) => n.querySelectorAll().find((k) => sel === `.${k.attrs.class}`) || null,
    addEventListener: (type, fn) => {
      n.heard[type] = fn;
    },
    remove: () => {
      n.removed = true;
    },
  };
  return n;
};

/* ------------------------------------ the inline editor ------------------------------------ */

export const website = (over = {}) => ({
  id: "website",
  label: "Website",
  open: true,
  onSave: () => {},
  onCancel: () => {},
  ...over,
});

/** An inline editor over its field, as a page draws one: the field is its child. */
export const drawInline = (
  props,
  field = W.React.createElement("input", { className: "rec-input", "aria-labelledby": "rec-inline-website-key" }),
) => {
  unmount();
  return W.React.createElement(W.RecordInline, props, field);
};

/* ------------------------------------ the sheet ------------------------------------ */

export const offer = (over = {}) => ({
  title: "What you offer",
  sub: "Names and rough timings. A price only if you can state it flatly.",
  onClose: () => {},
  foot: null,
  ...over,
});

/* ------------------------------ a thumb's pull down ------------------------------ */

// A touch on `target`, ending `dx, dy` away, on the element the handlers are on.
export const thumb = (handlers, dx, dy, target = null) => {
  const el = { dataset: {} };
  handlers.onTouchStart({ touches: [{ clientX: 200, clientY: 300 }], currentTarget: el, target });
  handlers.onTouchEnd({ changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }], currentTarget: el });
};

export const asPhone = (fn) => {
  const was = W.matchMedia;
  W.matchMedia = (q) => ({ matches: q === "(max-width: 760px)" });
  try {
    fn();
  } finally {
    W.matchMedia = was;
  }
};
