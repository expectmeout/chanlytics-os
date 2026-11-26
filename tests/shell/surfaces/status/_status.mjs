/**
 * The world the tests of status/ share. Split by behaviour from shell-status.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The shell says where you are and how fresh it is.
 *
 * Every tab read "Chanlytics OS", whichever page, person or pane it held, so a
 * row of them could not be told apart. What the shell knew about freshness sat
 * in one line at the sidebar's foot, which a phone keeps inside its drawer and
 * the rail cuts to an icon, and it knew less than there was to say: a device
 * gone offline was never mentioned, a live feed that dropped was written to the
 * console and nowhere else, and a surface that stopped refreshing offered
 * nothing to press. A session that ended mid-page went to /login without the
 * page, so signing in again landed on Today.
 *
 * Now the tab is named from the crumbs the shell draws, most particular first,
 * with what needs you counted in front; one line under the top bar says the one
 * thing that is wrong, on every screen size, with the one press that helps; and
 * the page's route rides to /login and back. Run without a browser: the words
 * from contracts, the bridge over a window that keeps its listeners, the shell
 * and the line mounted on a stub React.
 */
import { importSrc } from "../../../_source.mjs";
import { hookFrames } from "../../../_hook-frames.mjs";
import { historyOf, legacyAddress } from "../../address/_address.mjs";
import { bridgeHolds } from "../../_bridge-holds.mjs";

export const tick = () => new Promise((r) => setTimeout(r, 0));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const settle = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await tick();
};

/* ---------------------------- a browser, kept small ---------------------------- */

export const heard = new Map();

export const win = {
  location: {
    pathname: "/w/acme",
    search: "",
    hash: "#/inbox/th-1",
    assigned: [],
    reloads: 0,
    assign(url) {
      win.location.assigned.push(url);
    },
    replace() {},
    reload() {
      win.location.reloads += 1;
    },
  },
  addEventListener(type, fn) {
    if (!heard.has(type)) heard.set(type, new Set());
    heard.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    heard.get(type)?.delete(fn);
  },
  dispatchEvent(ev) {
    for (const fn of [...(heard.get(ev.type) ?? [])]) fn(ev);
    return true;
  },
};

/** What the browser would fire. */
export const fire = (type) => win.dispatchEvent({ type });

globalThis.window = win;

/** The address moves as the App Router's History leaves it: a push or a replace writes the path and fires nothing. */
export const history = historyOf(win);

/** What a page reads the address through (surfaces/frame/constants.ts), and what these tests' own `CHANLY` keeps of it. */
export const address = await legacyAddress();

globalThis.document = {
  title: "Chanlytics",
  visibilityState: "hidden",
  body: { style: {} },
  addEventListener() {},
  removeEventListener() {},
};

win.document = globalThis.document;

export const status = await importSrc("apps/dashboard/src/bridge/surface-status.ts");

export const realtime = await importSrc("apps/dashboard/src/bridge/surface-realtime.ts");

export const runner = await importSrc("apps/dashboard/src/bridge/surface-runner.ts");

export const shell = await importSrc("apps/dashboard/src/bridge/shell.ts");

export const workspace = await importSrc("apps/dashboard/src/bridge/workspace.ts");

// The routes that have left the shell (a page of their own, drawn inside the frame's chrome), and the seam the Calendar's chrome reads.
export const { SURFACE_ROUTES } = await importSrc("apps/dashboard/src/surfaces/routes.ts");

export const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");

// What needs you (decision 0048): the one count the tab's title reads, as the frame imports it (surfaces/needs-you.ts), here
// asked on every draw, since this stub React holds no external store.
export const { needsYouNow } = await importSrc("apps/dashboard/src/surfaces/needs-you.ts");

export const bridgeApi = await importSrc("apps/dashboard/src/bridge/api.ts");

export const readCaches = await importSrc("apps/dashboard/src/bridge/read-cache.ts");

// A person's page is TSX (surfaces/people/person) drawn by the layout (PAGES): the frame knows People's chrome for it, and
// the Back the frame gives it, which the page asks for through its verbs.
export const { backToPeople } = await importSrc("apps/dashboard/src/surfaces/people/person-verbs.ts");

export const { personDetail } = await importSrc("apps/dashboard/src/surfaces/people/people-detail.ts");

export const { ApiError } = await importSrc("apps/dashboard/src/client/api.ts");

// The Inbox and Conversations are TSX surfaces (surfaces/inbox), and Campaigns and Live (surfaces/campaigns, surfaces/live),
// on routes of their own: the frame wraps the page the layout gives it as surfaces/routes.ts says, and reads what the
// surfaces hold through the seam. Their overrides declare the windows the shell's count still reads (INBOX_DATA,
// CONVERSATIONS_DATA, and the playbooks', broadcasts' and Live's), which the seam mirrors.
await importSrc("apps/dashboard/src/surfaces/inbox/surface.ts");

await importSrc("apps/dashboard/src/surfaces/inbox/conversations-surface.ts");

await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");

await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts");

await importSrc("apps/dashboard/src/surfaces/live/surface.ts");

export const { cvRoute } = await importSrc("apps/dashboard/src/surfaces/inbox/cv-rules.ts");

/** The routes that have left the shell are drawn by the layout's page (here a node of that type), with the frame's chrome around it (surfaces/routes.ts). */
export const PAGES = { surfaceRoutes: SURFACE_ROUTES, routePage: { type: "RoutePage", props: { children: [] } } };

/** People as the frame's chrome and the page read it: the surface's value, and the window's copy the JSX pages still read. */
export const setPeople = (people) => {
  bridgeHolds({ values: { people: people } });
  setSurfaceValue("people", people);
};

export const clearPeople = () => {
  bridgeHolds({ values: { people: undefined } });
  setSurfaceValue("people", undefined);
};

/** Surfaces that record each read. */
export const surfaces = (...keys) => {
  const asked = [];
  return {
    asked,
    overrides: keys.map((key) => ({
      key,
      debounceMs: 1,
      apply: async () => {
        asked.push(key);
      },
    })),
  };
};

/* ---------------------------------- the page ---------------------------------- */

export let cells = [];

// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
export const frames = hookFrames();

/** Deep for the line, which is all in one file; shallow for the shell, whose children are other files' pages. */
export let deep = true;

globalThis.React = {
  Fragment: "Fragment",
  Component: class {},
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (deep && typeof type === "function") node.rendered = frames.render(type, props);
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
  useMemo: (fn) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = fn();
    return cells[k];
  },
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
  useCallback: (fn) => fn,
  useSyncExternalStore: (subscribe, snapshot) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      subscribe(() => {});
    }
    return snapshot();
  },
};

// The top bar, its bell and its two lines (surfaces/frame), as the frame imports them: TypeScript, so their
// hooks are this file's stub's (the "react" module's, set from it).
(await import("../../../_stub-react.mjs")).useStubHooks(globalThis.React);

export const topbarParts = {
  ...(await importSrc("apps/dashboard/src/surfaces/frame/topbar/topbar.tsx")),
  ...(await importSrc("apps/dashboard/src/surfaces/frame/topbar/status-bars.tsx")),
  ...(await importSrc("apps/dashboard/src/surfaces/frame/topbar/notif-popover.tsx")),
};

Object.assign(win, {
  NotifPopover: topbarParts.NotifPopover,
});

// The route table the shell reads (SHELL_ROUTES, drawRoute: surfaces/frame/route-table.tsx), as the frame imports it: just
// before the shell.
export const routeTable = await importSrc("apps/dashboard/src/surfaces/frame/route-table.tsx");

Object.assign(win, {
  SHELL_ROUTES: routeTable.SHELL_ROUTES,
  SOON_META: routeTable.SOON_META,
});

// The frame (surfaces/frame/app-shell.tsx), under the name these tests draw it by.
win.ChanlyticsApp = (await importSrc("apps/dashboard/src/surfaces/frame/app-shell.tsx")).ChanlyticsApp;

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

export const find = (tree, pred) => {
  let hit;
  walk(tree, (n) => {
    if (hit === undefined && pred(n)) hit = n;
  });
  return hit;
};

export const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return textOf(n.props?.children) + textOf(n.rendered);
};

/**
 * The frame's own parts, as it imports them (surfaces/frame/shell-chrome.tsx): what a test finds in the tree a mount
 * draws, which draws them shallow (`deep` is off while it mounts), by the part itself: `n.type === PART.Topbar`.
 */
export const PART = {
  Topbar: topbarParts.Topbar,
  LiveCallBar: topbarParts.LiveCallBar,
  ShellStatusBar: topbarParts.ShellStatusBar,
  Sidebar: (await importSrc("apps/dashboard/src/surfaces/frame/sidebar/sidebar.tsx")).Sidebar,
  SurfaceTabs: (await importSrc("apps/dashboard/src/surfaces/frame/surface-tabs.tsx")).SurfaceTabs,
  ShortcutsSheet: (await importSrc("apps/dashboard/src/surfaces/frame/shortcuts.tsx")).ShortcutsSheet,
  AskBar: (await importSrc("apps/dashboard/src/bridge/ask/line.tsx")).AskLine,
};

/** The window at an address (`#/inbox`, as the pages name one), placed at its path, where the frame leaves a route. */
export const placeAt = (hash) => {
  win.location.pathname = `/w/acme/${hash.replace(/^#\//, "")}`;
  win.location.hash = "";
};

const { fillDoors } = await importSrc("apps/dashboard/src/surfaces/frame-doors.ts");
let doorsFilled = null;
/** The doors the frame filled as it last drew (app-shell.tsx `fillDoors`): its own move, Ask, and a person's Back. */
export const frameDoors = () => doorsFilled;

/** The shell at an address, freshly mounted at its path: its tree and the tab's name it left. */
export const mount = (hash) => {
  deep = false;
  cells = [];
  frames.begin();
  placeAt(hash);
  globalThis.document.title = "Chanlytics";
  const tree = win.ChanlyticsApp({
    ...PAGES,
    fillDoors: (doors) => {
      doorsFilled = doors;
      fillDoors(doors);
    },
    theme: "dark",
    themePref: "dark",
    sidebar: "open",
    onSidebar() {},
    onTheme() {},
  });
  deep = true;
  return { tree, title: globalThis.document.title };
};

/** Today's read as the one count reads it (surfaces/needs-you.ts): a person waiting under a week, each a row of Need you. */
export const waitingToday = (...ids) => ({
  standing: { paused: false },
  queue: {
    rows: ids.map((id) => ({ id: `q-${id}`, kind: "handoff", conversationId: id, who: id, waitedMs: 3_600_000 })),
  },
});

/** Sets the world's `deep` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setDeep = (value) => (deep = value);

/** Sets the world's `cells` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setCells = (value) => (cells = value);
