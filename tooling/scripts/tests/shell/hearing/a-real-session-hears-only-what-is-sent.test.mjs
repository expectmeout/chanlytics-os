/**
 * The chrome of a real workspace waits for nothing that is not sent (docs/decisions/0047, task 6.1 of the wiring plan; O1a, O1b, A3b).
 *
 * Five events had no sender after the mockup pages that held them left (broadcasts:sent, outbound:approved, billing:changed,
 * shortcuts:open, live:ended), yet ten places waited for them; and sixteen listeners for the events only the mockup sends sat in
 * files every workspace loads. Nothing drew a wrong thing, which is why it lasted: the real pages hear the live feed, and the
 * bell, the credits line and the sheet of keys they would have moved were not there to move. Here the chrome is drawn on the stub
 * React as a real session and as a demo, and the window is asked what each was told to listen for.
 *
 * And the landing's words for a page that is not built (SOON_META) are the mockup's own pages' alone: every row is a demo page of
 * the registry, so a page that shipped has no card that says it is not in this release.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";

installLegacyReact({
  __DEMO_MODE: false,
  usePPToast: () => [null, () => {}],
  // The demo's presence menu is the kit's, drawn by name: a host element is enough to see which listeners the top bar made.
  MoreMenu: "MoreMenu",
});
const W = globalThis.window;
W.PR_STORE = { away: false, transfers: true };
// The top bar, its bell and its two lines (surfaces/frame), under the names the frame draws them by.
const topbarParts = {
  ...(await importSrc("apps/dashboard/src/surfaces/frame/topbar/topbar.tsx")),
  ...(await importSrc("apps/dashboard/src/surfaces/frame/topbar/status-bars.tsx")),
  ...(await importSrc("apps/dashboard/src/surfaces/frame/topbar/notif-popover.tsx")),
};
Object.assign(W, {
  Topbar: topbarParts.Topbar,
  LiveCallBar: topbarParts.LiveCallBar,
  ShellStatusBar: topbarParts.ShellStatusBar,
  NotifPopover: topbarParts.NotifPopover,
});
// The sidebar (surfaces/frame/sidebar/sidebar.tsx), under the name the frame draws it by.
W.Sidebar = (await importSrc("apps/dashboard/src/surfaces/frame/sidebar/sidebar.tsx")).Sidebar;
// The strip (surfaces/frame/surface-tabs.tsx), under the names the frame draws and asks it by.
const surfaceTabs = await importSrc("apps/dashboard/src/surfaces/frame/surface-tabs.tsx");
Object.assign(W, {
  SurfaceTabs: surfaceTabs.SurfaceTabs,
  stripPlace: surfaceTabs.stripPlace,
  stripSlide: surfaceTabs.stripSlide,
  stripSwipe: surfaceTabs.stripSwipe,
});
// The shortcuts sheet (surfaces/frame/shortcuts.tsx), under the names the frame draws and calls it by.
const shortcutsSheet = await importSrc("apps/dashboard/src/surfaces/frame/shortcuts.tsx");
Object.assign(W, { ShortcutsSheet: shortcutsSheet.ShortcutsSheet, openShortcuts: shortcutsSheet.openShortcuts });
// The route table (surfaces/frame/route-table.tsx), under the names the frame reads it by.
const routeTable = await importSrc("apps/dashboard/src/surfaces/frame/route-table.tsx");
Object.assign(W, {
  SHELL_ROUTES: routeTable.SHELL_ROUTES,
  SOON_META: routeTable.SOON_META,
  drawRoute: routeTable.drawRoute,
});
const { hearPresence } = await importSrc("apps/dashboard/src/surfaces/inbox/store.ts");
const { SURFACE_STATES } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");

/** The events with no sender left, and the name a patched-ahead sidebar once heard its own name change by. */
const NO_SENDER = [
  "broadcasts:sent",
  "outbound:approved",
  "billing:changed",
  "shortcuts:open",
  "live:ended",
  "me:changed",
];
/** What only the mockup sends, which the top bar's bell and presence line wait for. */
const THE_DEMOS = [
  "store:listing",
  "leads:converted",
  "leads:arrived",
  "fleet:handoff",
  "presence:changed",
  "inbox:decisions",
];

/**
 * Every event the window was asked to be told of while `draw` ran, in a session that is a demo or is not. The demo's scripted
 * lead waits 18 seconds on a timer, which a draw does not run.
 */
const heardWhile = (demo, draw) => {
  const heard = [];
  const add = W.addEventListener;
  const timer = globalThis.setTimeout;
  const was = W.__DEMO_MODE;
  fresh();
  W.__DEMO_MODE = demo;
  W.addEventListener = (type, fn) => {
    heard.push(type);
    add(type, fn);
  };
  globalThis.setTimeout = () => 0;
  try {
    draw();
  } finally {
    W.addEventListener = add;
    globalThis.setTimeout = timer;
    W.__DEMO_MODE = was;
  }
  return new Set(heard);
};
const drawn =
  (Component, props = {}) =>
  () =>
    W.React.createElement(Component, props);
const missing = (heard, names) => names.filter((n) => !heard.has(n));
const present = (heard, names) => names.filter((n) => heard.has(n));

test("the top bar of a real workspace listens for none of the mockup's bell rows, and a demo's for the ones its pages send", () => {
  const real = heardWhile(false, drawn(W.Topbar, { crumbs: [] }));
  assert.deepEqual(present(real, [...NO_SENDER, ...THE_DEMOS]), [], "a real session registers none of them");
  const demo = heardWhile(true, drawn(W.Topbar, { crumbs: [] }));
  assert.deepEqual(missing(demo, THE_DEMOS), [], "the demo's bell hears what its pages, its lead and its verdict send");
  assert.deepEqual(present(demo, NO_SENDER), [], "and none of the five that nothing sends");
});

test("the live bar redraws on the live feed alone: a call that ends is a row on it, and no event says so", () => {
  const heard = heardWhile(false, drawn(W.LiveCallBar));
  assert.equal(heard.has("live:ended"), false);
});

test("the sidebar hears the workspace read; the count of what needs you is handed in, not heard, a fleet pause is the demo's, and the credits, the call ends and a patched-ahead name left", () => {
  const real = heardWhile(false, drawn(W.Sidebar, { onNavigate() {} }));
  assert.deepEqual(missing(real, ["surface:workspace"]), [], "what redraws it in a workspace");
  assert.deepEqual(
    present(real, [...NO_SENDER, "fleet:status", "inbox:counts", "inbox:decisions"]),
    [],
    "and nothing a real session never hears, nor a number the Inbox and Today once sent over each other's (decision 0048)",
  );
  const demo = heardWhile(true, drawn(W.Sidebar, { onNavigate() {} }));
  assert.equal(demo.has("fleet:status"), true, "the demo's strip of agents follows a pause");
  assert.deepEqual(present(demo, NO_SENDER), []);
});

test("the strip of views hears the live feed alone, the Needs-you badge being the count's own hook, and the sheet of keys hears the keyboard alone", () => {
  const tabs = heardWhile(false, drawn(W.SurfaceTabs, { page: "clients", param: null, views: null, onNavigate() {} }));
  assert.deepEqual([...tabs].sort(), ["surface:live"], "the Live tab's pulse: no event feeds the Needs-you badge");
  const sheet = heardWhile(false, drawn(W.ShortcutsSheet));
  assert.deepEqual([...sheet], ["keydown"], "it opens on ? and by openShortcuts(), never by an event");
});

test("the Inbox's veto store hears the member go Away only in a demo, where the control that sets it is drawn", () => {
  const stopped = [];
  const real = heardWhile(false, () => stopped.push(hearPresence()));
  assert.equal(real.has("presence:changed"), false, "a real session has no Away to hear");
  const demo = heardWhile(true, () => stopped.push(hearPresence()));
  assert.equal(demo.has("presence:changed"), true, "the demo's countdowns freeze and thaw with it");
  for (const stop of stopped) stop();
});

test("SOON_META words the landing of the mockup's own pages and no others: its keys are the registry's demo pages (A3b)", () => {
  const demoPages = Object.entries(SURFACE_STATES)
    .filter(([, state]) => state === "demo")
    .map(([page]) => page)
    .sort();
  assert.ok(demoPages.length > 0, "the registry names the mockup's pages");
  assert.deepEqual(
    Object.keys(W.SOON_META).sort(),
    demoPages,
    "a page that shipped has no card that says it is not in this release, and a demo page says its words",
  );
});
