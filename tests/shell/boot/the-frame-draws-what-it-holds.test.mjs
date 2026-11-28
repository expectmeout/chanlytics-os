/**
 * The frame, drawn (apps/dashboard/src/bridge/FrameApp.tsx): what it returns for who is looking, what it hands the shell,
 * and what its presses and its one listener do. FrameApp loads in node since decision 0151 took its parts off the window
 * (the-frame-boots-before-it-draws.test.mjs loads it over a bare window); here the component is called, one level deep,
 * by a React that keeps its hooks' cells between draws and draws none of its children: the shell, the hosts and the
 * create screen are elements with their props, as React hands them on.
 *
 * Its effects are run as React runs them after a draw, but the two that reach out of the tab: the surfaces' runner (its
 * reads run in shell/surfaces/) and the build check (/api/version). Each is kept with its inputs, the status line's
 * publisher among them, which is called here as the runner calls it. Until 26 Nov 2026 these were FrameApp.tsx's text,
 * read in auth/workspace-creation, shell/chrome, shell/polish and shell/surfaces/surface-seam.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_RUN_ROUTE } from "@chanlytics/contracts";
import { useStubHooks } from "../../_stub-react.mjs";
import { bridgeHolds } from "../_bridge-holds.mjs";
import { fromDashboard } from "./_frame-boot.mjs";

/* ---- a bare window, as a tab is before the frame's module loads ---- */

const heard = new Map();
const stamps = [];
const assigned = [];
const kept = new Map();
const doc = {
  visibilityState: "visible",
  title: "",
  addEventListener() {},
  removeEventListener() {},
  documentElement: {
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {},
    setAttribute: (name, value) => stamps.push([name, value]),
    getAttribute: () => null,
  },
  querySelector: () => null,
  head: { appendChild() {} },
  createElement: () => ({ setAttribute() {} }),
};
globalThis.window = {
  location: {
    pathname: "/w/harbor/today",
    search: "",
    hash: "",
    origin: "https://app.example.com",
    assign: (to) => assigned.push(String(to)),
    replace() {},
    reload() {},
  },
  history: { replaceState() {}, pushState() {}, state: null, length: 1 },
  navigator: { userAgent: "node" },
  document: doc,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
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
globalThis.document = doc;
globalThis.localStorage = {
  getItem: (k) => (kept.has(k) ? kept.get(k) : null),
  setItem: (k, v) => kept.set(k, String(v)),
  removeItem: (k) => kept.delete(k),
};
if (typeof globalThis.navigator === "undefined")
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node" }, configurable: true });

/* ---- a React of one level: hooks kept between draws, children left as elements ---- */

const cells = [];
let at = 0;
let effects = [];
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const cell = (init) => {
  const k = at++;
  if (!(k in cells)) cells[k] = init();
  return k;
};
globalThis.React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
  Fragment: "Fragment",
  Component: class {},
  useState: (init) => {
    const k = cell(() => (typeof init === "function" ? init() : init));
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useRef: (init) => cells[cell(() => ({ current: init }))],
  useCallback: (fn, deps) => {
    const k = cell(() => ({ fn, deps }));
    if (!same(cells[k].deps, deps)) cells[k] = { fn, deps };
    return cells[k].fn;
  },
  useMemo: (make, deps) => {
    const k = cell(() => ({ value: make(), deps }));
    if (!same(cells[k].deps, deps)) cells[k] = { value: make(), deps };
    return cells[k].value;
  },
  useEffect: (fn, deps) => {
    const k = cell(() => ({ deps: undefined, cleanup: undefined }));
    if (cells[k].deps && same(cells[k].deps, deps)) return;
    effects.push({ k, fn, deps });
  },
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  useId: () => cells[cell(() => `:r${at}:`)],
};
globalThis.React.useLayoutEffect = globalThis.React.useEffect;
globalThis.React.useReducer = (reducer, init) => {
  const [state, set] = globalThis.React.useState(init);
  return [state, (a) => set((s) => reducer(s, a))];
};
useStubHooks(globalThis.React);

bridgeHolds({ who: { activeWorkspaceId: "ws-1", workspaces: [], me: { email: "ana@example.com" } } }, { fresh: true });
const FrameApp = fromDashboard("bridge/FrameApp.tsx").default;
const { markHydrated } = fromDashboard("bridge/surface-status.ts");

/** The effects that reach out of the tab, kept unrun: the surfaces' runner and the build check, both keyed on the publisher. */
const reachesOut = (e) => (e.deps ?? []).some((d) => typeof d === "function");
const keptOut = [];

/** One draw, then its effects as React runs them after it, the two that reach out kept. */
function draw(props = { route: null }) {
  at = 0;
  effects = [];
  const tree = FrameApp(props);
  for (const e of effects) {
    if (reachesOut(e)) {
      keptOut.push(e);
      cells[e.k] = { deps: e.deps, cleanup: undefined };
      continue;
    }
    if (typeof cells[e.k]?.cleanup === "function") cells[e.k].cleanup();
    cells[e.k] = { deps: e.deps, cleanup: e.fn() };
  }
  return tree;
}

/** Every element in a tree, depth first. */
const all = (n, out = []) => {
  if (n == null || typeof n !== "object") return out;
  if (Array.isArray(n)) {
    for (const k of n) all(k, out);
    return out;
  }
  out.push(n);
  all(n.props?.children, out);
  return out;
};
const named = (tree, name) => all(tree).find((n) => typeof n.type === "function" && n.type.name === name) ?? null;

/** Who is looking, as the workspace's read says it: none of their workspaces yet, or one. */
const HARBOR = { id: "ws-1", slug: "harbor", name: "Harbor Nails", role: "owner" };
const looking = (workspaces) =>
  bridgeHolds({ who: { activeWorkspaceId: "ws-1", workspaces, me: { email: "ana@example.com" } } });

test("the create screen waits for the workspace's read before claiming there is nothing, and a workspace made opens on its first run", () => {
  // Before the workspace's read resolves EVERY account looks like it has no workspaces. Flashing "create your
  // workspace" at an owner who has one is the same class of lie as painting mockup data during a load.
  looking([]);
  const before = draw();
  assert.equal(named(before, "CreateWorkspace"), null, "no create screen before the read has landed");
  assert.equal(before.props.id, "root", "the frame stands");
  markHydrated(["workspace"]);
  const screen = draw();
  assert.equal(screen.type.name, "CreateWorkspace", "an account that belongs to nowhere gets the create screen");
  assert.equal(screen.props.email, "ana@example.com");
  assert.equal(screen.props.onCancel, undefined, "with nowhere to go back to");
  // Otherwise the owner creates a workspace and stays looking at nothing. By its slug: a new workspace is not in the
  // list yet, and an id address boots the app twice; on its first run.
  screen.props.onCreated({ id: "ws-new", slug: "luna-studio" });
  assert.equal(assigned.length, 1, "the app opens on the workspace made");
  assert.match(assigned[0], /\/w\/luna-studio\b/);
  assert.ok(assigned[0].includes(FIRST_RUN_ROUTE), `on its first run (${assigned[0]})`);
  assert.doesNotMatch(assigned[0], /ws-new/, "never by its id");
  looking([HARBOR]);
  assert.equal(draw().props.id, "root", "and an account with one is drawn the frame");
});

test("the frame hands the shell its preferences and their presses, and stamps the document; there is no floating pill", () => {
  looking([HARBOR]);
  markHydrated(["workspace"]);
  let frame = draw();
  let shell = named(frame, "ChanlyticsApp");
  assert.ok(shell, "the shell, under the frame's root");
  for (const prop of ["theme", "themePref", "look", "sidebar", "onTheme", "onLook", "onSidebar", "inboxDensity"])
    assert.ok(prop in shell.props, `the shell is handed ${prop}`);
  assert.ok(
    stamps.some(([name]) => name === "data-theme") && stamps.some(([name]) => name === "data-look"),
    "the document wears the theme and the look (stamped as the frame first drew, and again whenever either changes)",
  );
  // A press on the theme: device-prefs.ts keeps it (choosePref), the frame holds it, and the document wears it.
  shell.props.onTheme("dark");
  frame = draw();
  shell = named(frame, "ChanlyticsApp");
  assert.equal(shell.props.themePref, "dark", "the press is what the shell is handed next");
  assert.equal(shell.props.theme, "dark");
  assert.ok(
    stamps.some(([name, value]) => name === "data-theme" && value === "dark"),
    "and what the document wears",
  );
  assert.ok(
    [...kept.values()].some((v) => v.includes("dark")),
    "kept on this device",
  );
  const before = shell.props.onTheme;
  frame = draw();
  assert.equal(
    named(frame, "ChanlyticsApp").props.onTheme,
    before,
    "made once, so the shell's element is kept (defect 17)",
  );
  shell.props.onSidebar("rail");
  assert.equal(named(draw(), "ChanlyticsApp").props.sidebar, "rail", "the rail, pressed, is the shell's next");
  const words = JSON.stringify(all(frame).map((n) => n.props?.className ?? ""));
  assert.doesNotMatch(words, /bridge-pill|pill-signout/, "no floating pill: the line under the top bar says it");
});

test("what only the frame knows goes to the status line: the publisher the surfaces' runner calls", () => {
  looking([HARBOR]);
  draw();
  // Kept as they were first asked for: their inputs, the publisher among them, have not changed since.
  const publish = keptOut.flatMap((e) => e.deps).find((d) => typeof d === "function");
  assert.ok(publish, "the runner and the build check are handed one publisher");
  let said = 0;
  globalThis.window.addEventListener("shell:status", () => (said += 1));
  publish();
  assert.equal(said, 1, "it says the line, as the shell bridge reads it (shell.ts publishShellStatus)");
});

test("another workspace, asked for from the workspace menu, is the create screen with its way back", () => {
  looking([HARBOR]);
  markHydrated(["workspace"]);
  draw();
  globalThis.window.dispatchEvent(new globalThis.Event("shell:create-workspace"));
  const screen = draw();
  assert.equal(screen.type.name, "CreateWorkspace", "the frame heard the menu's ask (shell.createWorkspace)");
  assert.equal(typeof screen.props.onCancel, "function", "and the screen has a way back");
  screen.props.onCancel();
  assert.equal(draw().props.id, "root", "Back is the frame again");
  globalThis.window.dispatchEvent(new globalThis.Event("shell:create-workspace"));
  const again = draw();
  assigned.length = 0;
  again.props.onCreated({ id: "ws-2", slug: "bay-side" });
  assert.match(assigned[0] ?? "", /\/w\/bay-side\b/, "a workspace made from the menu opens at its slug");
  assert.ok((assigned[0] ?? "").includes(FIRST_RUN_ROUTE), "on its first run");
});

test("nothing of the workshop on a customer's screen: no seeded surfaces said, no live labels", () => {
  looking([HARBOR]);
  const text = JSON.stringify(all(draw()).map((n) => [typeof n.type === "string" ? n.type : n.type?.name, n.props]));
  assert.doesNotMatch(text, /other surfaces seeded|liveLabels/, "the frame is the customer's");
});

test("the route gate is worked out in every draw: the first draw after a move is the new page's own answer", () => {
  // The frame's gate (surfaces/frame/shell-hooks.ts useRouteGate) is drawn as a CHILD of FrameApp, whose effects run
  // after it. As state an effect set, a move committed the new page with the previous route's answer for one draw: a
  // page whose read was not in drew the old page's "ready". Run here with cells of its own, as one component across a move.
  const { useRouteGate } = fromDashboard("surfaces/frame/shell-hooks.ts");
  cells.length = 0;
  const gate = (page) => {
    at = 0;
    effects = [];
    return useRouteGate({ page, param: null, routeKey: page });
  };
  // Two pages whose first draw waits for no band beside them (route-draws.ts ROUTE_WAITS): Campaigns, then People.
  markHydrated(["playbooks"]);
  assert.equal(gate("playbooks").routeLoading, false, "a page whose read is in draws at once");
  const moved = gate("clients");
  assert.equal(moved.routeLoading, true, "moved to a page whose read is not in: loading, in that same draw");
  assert.equal(moved.surfaceUnavailable, false, "and not unavailable: nothing has failed yet");
  markHydrated(["people"]);
  assert.equal(gate("clients").routeLoading, false, "and the draw after its read lands opens, with no effect between");
});

test("the strip offers what the registry says is real, and only that: each tab a real page, never a retired address", () => {
  // The strip and the registry drifted apart in both directions at once: a real tab kept hidden (Lists, so People's bar
  // fell under its two-tab floor and disappeared), and demo pages offered in production (four Agents tabs to one Coming
  // Soon). Drawn (surfaces/frame/surface-tabs.tsx SurfaceTabs), each tab pressed: where it moves is a page the registry
  // classifies real, and not one that moved away. Until 27 Nov 2026 surface-registry.test.mjs read the strip's table.
  const { SurfaceTabs } = fromDashboard("surfaces/frame/surface-tabs.tsx");
  const { SURFACE_STATES, SURFACE_RETIRED } = fromDashboard("bridge/surface-registry.ts");
  cells.length = 0;
  const drawStrip = (page) => {
    at = 0;
    effects = [];
    const moves = [];
    const strip = SurfaceTabs({ page, param: null, views: null, onNavigate: (to) => moves.push(to) });
    return { strip, moves };
  };
  const { strip, moves } = drawStrip("inbox");
  assert.ok(strip, "the Inbox's group draws its strip");
  const ids = strip.props.tabs.map((t) => t.id);
  assert.ok(ids.length >= 2, "of two tabs or more");
  for (const id of ids) strip.props.onPick(id);
  assert.equal(moves.length, ids.length, "every tab is a move");
  for (const to of moves) {
    assert.equal(SURFACE_STATES[to], "real", `the ${to} tab is a page the registry says is real`);
    assert.equal(SURFACE_RETIRED[to], undefined, `${to} is not retired: the strip offers where it went`);
  }
  // A group whose real tabs number fewer than two draws nothing: People's one tab is a strip nobody would see.
  assert.equal(drawStrip("clients").strip, null, "a group of one draws no strip");
});

test("the route gate asks with the pane it is about to draw, and a demo page is gated by the one interception", () => {
  // A registry that resolves panes is useless if the caller drops the pane: Settings' Console door waits for who is
  // looking, its Details for the settings read. And the honesty gate is one interception over the registry, never a
  // route's own demo conditional: a page the registry calls demo draws nowhere (route-table.tsx routeGated).
  const { useRouteGate } = fromDashboard("surfaces/frame/shell-hooks.ts");
  cells.length = 0;
  const gate = (page, param = null) => {
    at = 0;
    effects = [];
    return useRouteGate({ page, param, routeKey: param ? `${page}/${param}` : page });
  };
  markHydrated(["workspace"]);
  assert.equal(
    gate("admin", "platform").routeLoading,
    false,
    "the Console's door waits for who is looking, and it is in",
  );
  assert.equal(gate("admin", "workspace").routeLoading, true, "Details waits for the settings read, which is not");
  markHydrated(["settings"]);
  assert.equal(gate("admin", "workspace").routeLoading, false, "and opens as it lands");
  for (const page of ["tasks", "fleet", "shared"])
    assert.equal(gate(page).demoGated, true, `${page}: the registry says demo, so the frame draws it nowhere`);
  for (const page of ["clients", "inbox", "playbooks"]) assert.equal(gate(page).demoGated, false, `${page} is real`);
});

test("the Inbox's tab says its count is on its way until the day is read, under the workspace's own name, and never once that read failed", () => {
  // The strip is drawn with the frame, before any read: its Inbox tab's count, made of the day's read, landed after it
  // and pushed Conversations and Live along (Ruben, 28 Nov 2026). While the day is unread the tab is told its figure is
  // coming, and the kit keeps it the room of the figure it last said on this device (kit/kept-room.ts).
  const { SurfaceTabs } = fromDashboard("surfaces/frame/surface-tabs.tsx");
  const { setStatus } = fromDashboard("bridge/surface-status.ts");
  const { setSurfaceValue, surfaceValue } = fromDashboard("surfaces/surface-values.ts");
  cells.length = 0;
  const drawStrip = () => {
    at = 0;
    effects = [];
    const strip = SurfaceTabs({ page: "conversations", param: null, views: null, onNavigate() {} });
    return { strip, tab: strip.props.tabs.find((t) => t.id === "inbox") };
  };
  assert.equal(surfaceValue("today"), undefined, "the day is unread as this begins");
  const unread = drawStrip();
  assert.equal(unread.tab.count, null, "no figure before the day is read");
  assert.equal(unread.tab.coming, true, "and one on its way");
  assert.equal(
    unread.strip.props.kept,
    "harbor/inbox",
    "remembered for the workspace the address names, and the strip",
  );
  assert.deepEqual(
    unread.strip.props.tabs.filter((t) => t.id !== "inbox").map((t) => t.coming),
    [false, false],
    "Conversations and Live say no count, and wait for none",
  );
  // The day's read failed: no count will come, and the tab keeps no room for one.
  setStatus("today", "seeded");
  assert.equal(drawStrip().tab.coming, false);
  // Read, with nobody waiting: none is said, and none is coming.
  setSurfaceValue("today", { queue: { rows: [] } });
  setStatus("today", "live");
  const read = drawStrip();
  assert.equal(read.tab.count, null);
  assert.equal(read.tab.coming, false);
  setSurfaceValue("today", undefined);
});
