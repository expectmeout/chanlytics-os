/**
 * A stub React that renders the legacy tree's classic scripts on node, for the chart kit's and the Reports page's
 * tests. It is the stub reports-honest.test.mjs grew, shared, with layout effects added: function components render
 * when created (children first, as JSX evaluates), a hook keeps its state where its component sits, as React keeps it
 * (_hook-frames.mjs: under its parent, by its type and its key or its turn), an effect runs when its inputs change
 * after its last cleanup, and a tree is plain objects to walk. A component drawn only some of the time -- a sheet, a
 * slot -- moves nobody else's state.
 *
 * An effect runs inside the hook call, before any ref is attached, so a chart's useChartWidth never measures here:
 * every chart draws at its 600px start, which is what the tests read.
 *
 * window IS globalThis here, as it is in a browser, so a classic script's Object.assign(window, {...}) makes names
 * the next script reads bare. The bridge's CSV rule (contracts' csvCell, window.__csvCell) is seeded from contracts,
 * as seed-globals.ts publishes it in the app.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { csvCell } from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";
import { hearSurfaces, surfaceHook, surfaceMoved } from "../../../apps/dashboard/src/legacy-bridge/surface-status.ts";
import { installRoles } from "../../../apps/dashboard/src/legacy-bridge/identity.ts";

const listeners = {};
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
// `wanted` is whether a setter has changed a value since the last quiet(): what React would take as a reason to draw
// again. A test that proves a page redraws on an event reads it, since this stub draws only when a test asks.
// `list` is each hook's cell by the key its frame gives it (_hook-frames.mjs).
// The surfaces the pages draw from, and the event each one's rows land on: LegacyApp counts these against each key
// before React draws (hearSurfaces over the overrides' own `events`), so a page's `useSurface` moves on them here too.
const SURFACE_EVENTS = [
  ["today", "surface:today"],
  ["live", "surface:live"],
  ["broadcasts", "surface:broadcasts"],
  ["setup", "surface:setup"],
  ["google", "surface:google"],
  ["reports", "surface:reports"],
  ["people", "surface:clients"],
  ["calendar", "surface:calendar"],
  ["playbooks", "surface:playbooks"],
  ["inbox", "surface:inbox"],
  ["conversations", "surface:conversations"],
].map(([key, event]) => ({ key, events: [event] }));
let stopHearing = () => {};
const hearTheSurfaces = () => {
  stopHearing();
  stopHearing = hearSurfaces(SURFACE_EVENTS, globalThis);
};
const frames = hookFrames();
const cells = { list: {}, ids: 0, wanted: false };
const moved = (was, now) => {
  if (!Object.is(was, now)) cells.wanted = true;
};

export function installLegacyReact(extra = {}) {
  globalThis.window = globalThis;
  Object.assign(globalThis, {
    localStorage: storage(),
    sessionStorage: storage(),
    location: {
      pathname: "/w/studio",
      hash: "#/reports",
      origin: "https://app.chanlytics.com",
      assign() {},
      replace() {},
      reload() {},
    },
    history: { replaceState() {} },
    innerHeight: 800,
    addEventListener: (type, fn) => {
      (listeners[type] ||= new Set()).add(fn);
    },
    removeEventListener: (type, fn) => {
      listeners[type]?.delete(fn);
    },
    dispatchEvent: (ev) => {
      for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
      return true;
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    Icon: "Icon",
    __csvCell: csvCell,
    ...extra,
  });
  globalThis.document = {
    body: { appendChild() {} },
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    createElement: () => ({
      setAttribute() {},
      style: {},
      classList: { add() {}, remove() {} },
      click() {},
      remove() {},
    }),
  };
  const effect = (fn, deps) => {
    const k = frames.key();
    const prev = cells.list[k];
    if (
      prev &&
      deps &&
      prev.deps &&
      deps.length === prev.deps.length &&
      deps.every((d, i) => Object.is(d, prev.deps[i]))
    )
      return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells.list[k] = { deps, cleanup: undefined, effect: true };
    cells.list[k].cleanup = fn();
  };
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
      if (!(k in cells.list)) cells.list[k] = typeof init === "function" ? init() : init;
      return [
        cells.list[k],
        (v) => {
          const was = cells.list[k];
          cells.list[k] = typeof v === "function" ? v(was) : v;
          moved(was, cells.list[k]);
        },
      ];
    },
    useReducer: (red, init) => {
      const k = frames.key();
      if (!(k in cells.list)) cells.list[k] = init;
      return [
        cells.list[k],
        (a) => {
          const was = cells.list[k];
          cells.list[k] = red(was, a);
          moved(was, cells.list[k]);
        },
      ];
    },
    useRef: (init) => {
      const k = frames.key();
      if (!(k in cells.list)) cells.list[k] = { current: init };
      return cells.list[k];
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    // React 18 and 19 both have it: an id that stays with its component across draws and is no other's.
    useId: () => {
      const k = frames.key();
      if (!(k in cells.list)) cells.list[k] = `:r${(cells.ids++).toString(36)}:`;
      return cells.list[k];
    },
    useEffect: effect,
    useLayoutEffect: effect,
    // A store outside React: heard while the component is drawn (its subscription made again each draw, the old one
    // let go, as React does when `subscribe` is a new function), and a notice is a reason to draw again.
    useSyncExternalStore: (subscribe, snapshot) => {
      const k = frames.key();
      const prev = cells.list[k];
      if (prev && typeof prev.cleanup === "function") prev.cleanup();
      cells.list[k] = {
        deps: null,
        effect: true,
        cleanup: subscribe(() => {
          cells.wanted = true;
        }),
      };
      return snapshot();
    },
  };
  globalThis.ReactDOM = { createPortal: (node) => node };
  // The bridge's one hook (legacy-bridge/surface-status.ts), made over this React as LegacyApp makes it over the
  // app's: a page redraws when a surface it draws moves.
  globalThis.useSurface = surfaceHook(globalThis.React);
  hearTheSurfaces();
}

/** A new tree: every hook cell and every listener forgotten. */
export function fresh() {
  cells.list = {};
  frames.reset();
  cells.wanted = false;
  for (const k of Object.keys(listeners)) delete listeners[k];
  hearTheSurfaces();
}

/** Draw again over the same cells, as React would after a state change. */
export function again(draw) {
  frames.begin();
  return draw();
}

/**
 * The tree goes away, as React unmounts it: each effect's cleanup runs, then its hook cells are forgotten. Window
 * listeners are left to the cleanups that added them, as in a browser: one a registry keeps for itself stays.
 */
export function unmount() {
  for (const c of Object.values(cells.list)) if (c && c.effect && typeof c.cleanup === "function") c.cleanup();
  cells.list = {};
  frames.reset();
  cells.wanted = false;
}

/**
 * Whether anything drawn has asked to be drawn again since the last quiet(): a setter that changed its value, which
 * is what makes React draw. This stub never draws by itself, so a test that proves a page listens for an event (and
 * does not merely read the new globals when the test draws it anyway) quiets it, sends the event, and asks this.
 */
export const redrawWanted = () => cells.wanted;
/**
 * The role store as the app has it, for the page tests whose gates ask who is acting: settings.jsx makes the store and the
 * bridge completes it (legacy-bridge/identity.ts installRoles), so `mayAtLeast`, `myRole` and View-as read the window's
 * `__ME` and the store's own `viewAsRole` at each ask, as they do in the app. A test that changes `window.__ME.role`
 * between draws changes who is acting. `can` is only there where a test has none, and answers yes, as no store does.
 */
export function installRoleStore(win = globalThis.window) {
  const store = (win.ST_STORE ??= { viewAsRole: null, can: () => true });
  store.viewAsRole ??= null;
  installRoles(win);
  return store;
}
/** A surface's rows landed, or its status moved: what LegacyApp's read and the seam's event count against its key. */
export const surfaceLanded = (key) => surfaceMoved(key);
export const quiet = () => {
  cells.wanted = false;
};

/**
 * React's StrictMode check in development, which the app runs: every effect is cleaned up and run again at once,
 * over the same cells (refs and state survive it). Draws the tree again.
 */
export function remount(draw) {
  for (const c of Object.values(cells.list)) {
    if (!c || !c.effect) continue;
    if (typeof c.cleanup === "function") c.cleanup();
    c.cleanup = undefined;
    c.deps = null;
  }
  return again(draw);
}

export const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
/** A drawn component is walked as the children it was given and as what it rendered: each node counts once. */
export const all = (tree, pred) => {
  const out = [];
  const seen = new Set();
  walk(tree, (n) => {
    if (!seen.has(n) && pred(n)) {
      seen.add(n);
      out.push(n);
    }
  });
  return out;
};
export const find = (tree, pred) => all(tree, pred)[0] ?? null;
export const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
export const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
export const classes = (n) =>
  String(n?.props?.className || "")
    .split(/\s+/)
    .filter(Boolean);
export const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
export const settle = () => new Promise((r) => setImmediate(r));

/**
 * A window whose width answers the kit's phone query, `(max-width: 760px)`, as a browser's does, and can be resized:
 * resize() changes what the query matches and tells whoever listens, as a browser tells a MediaQueryList's listeners.
 * put() gives the window back the stub's own matchMedia (every other test's desktop). The kit's pages and the record
 * kit's tests share it (record-fold.jsx's REC_PHONE_QUERY).
 */
export const atWidth = (phone) => {
  const was = globalThis.matchMedia;
  const heard = new Set();
  let now = phone;
  globalThis.matchMedia = (q) => ({
    media: q,
    get matches() {
      return q === "(max-width: 760px)" ? now : false;
    },
    addEventListener: (type, fn) => {
      if (type === "change") heard.add(fn);
    },
    removeEventListener: (type, fn) => {
      heard.delete(fn);
    },
  });
  return {
    resize(p) {
      now = p;
      for (const fn of [...heard]) fn({ matches: p, media: "(max-width: 760px)" });
    },
    listening: () => heard.size,
    put() {
      globalThis.matchMedia = was;
    },
  };
};
