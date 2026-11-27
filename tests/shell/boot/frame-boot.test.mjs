/**
 * The frame's boot (apps/dashboard/src/bridge/boot/installs.ts), run here as FrameApp runs it at its module scope: every
 * part a page reads at its first draw installed before React draws, each surface heard, the cache restored before a page
 * is measured, and the route gate and the registry made before the frame's first render.
 *
 * FrameApp itself draws in a browser alone (`#frame-shell`, tests/repo/bundle-budget.test.mjs), so its boot is a module
 * of its own, and this runs it over a window of the test's own: what the boot touches of a browser, and no more. Where
 * FrameApp calls it is read in tests/shell/surfaces/surface-seam.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bridgeHolds } from "../_bridge-holds.mjs";

/** The window the boot is run over: an address, a history, the listeners it adds, a document and a navigator. */
const heard = new Map();
const doc = {
  visibilityState: "visible",
  title: "",
  addEventListener() {},
  removeEventListener() {},
  documentElement: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {} },
};
const win = {
  location: { pathname: "/w/acme/today", search: "", hash: "", assign() {}, replace() {}, reload() {} },
  history: { replaceState() {}, pushState() {}, state: null, length: 1 },
  navigator: { userAgent: "node" },
  document: doc,
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
globalThis.window = win;
globalThis.document = doc;
if (typeof globalThis.navigator === "undefined")
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node" }, configurable: true });
bridgeHolds({ who: { activeWorkspaceId: "ws-1" } }, { fresh: true });

// Required, as the pages require them: a static import of a dashboard module from an .mjs is a second copy (_bridge-holds.mjs).
const requireFromDashboard = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/dashboard/src/bridge/_.js"),
);
const { provided } = requireFromDashboard("./provided.ts");
const { bootFrame, FRAME_INSTALLS } = requireFromDashboard("./boot/installs.ts");
const { FRAME_SURFACES } = requireFromDashboard("./boot/surfaces.ts");
const { installRouteGate, installSurfaceRegistry } = requireFromDashboard("./surface-registry.ts");
const { installClock } = requireFromDashboard("./zone.ts");
const { installShell } = requireFromDashboard("./shell.ts");
const { surfaceVersion } = requireFromDashboard("./surface-status.ts");

/** Every part the boot installs (bridge/provided.ts), which a page reads at its first draw. */
const BOOT_PARTS = [
  "roles",
  "policy",
  "tip",
  "toast",
  "sheets",
  "peopleScopes",
  "surfaceState",
  "surfaceRetired",
  "surfaceGate",
  "surfaceFailed",
  "onSurfaceReady",
  "routeWaitMs",
  "refreshSurface",
  "clock",
  "tabMemory",
  "bell",
  "shell",
  "chrome",
  "warmPerson",
  "personNotes",
  "deal",
  "workspace",
  "tz",
  "replies",
  "href",
  "setPolicy",
  "saveSettings",
  "broadcasts",
  "refreshPlaybooks",
  "calendar",
  "billing",
];
const names = FRAME_INSTALLS.map((step) => step.name);
const at = (name) => names.indexOf(name);
const listening = () => [...heard.values()].reduce((n, fns) => n + fns.size, 0);

test("loading the boot installs nothing; running it installs every part a page reads at its first draw", () => {
  assert.deepEqual(
    BOOT_PARTS.filter((part) => provided(part) !== undefined),
    [],
    "a module that installs as it loads",
  );
  bootFrame();
  assert.deepEqual(
    BOOT_PARTS.filter((part) => provided(part) === undefined),
    [],
    "every part is the boot's to install",
  );
  // The policy store stands where the approval chips read it from the first paint (bridge/policy-store.ts); nothing is
  // put on the window.
  assert.equal(typeof provided("policy")?.modeOf, "function");
  assert.equal(win.POLICY, undefined);
});

test("a second boot changes nothing: each part, and each listener, as the first left it", () => {
  bootFrame();
  const parts = BOOT_PARTS.map((part) => provided(part));
  const listeners = listening();
  bootFrame();
  assert.deepEqual(
    BOOT_PARTS.filter((part, i) => provided(part) !== parts[i]),
    [],
  );
  assert.equal(listening(), listeners);
});

test("every surface the frame reads is heard from the boot: each of its events moves it before React draws", () => {
  bootFrame();
  assert.ok(FRAME_SURFACES.length >= 30, "the frame's surfaces are listed");
  const keys = FRAME_SURFACES.map((o) => o.key);
  assert.equal(new Set(keys).size, keys.length, "a surface is listed once");
  // Each event alone, as the runner says it: the surface's own count moves (surface-status.ts surfaceVersion). What else
  // hears the event (the bell, Ask) is its own test's; a listener of theirs that wants a real read's detail is let be.
  const unheard = FRAME_SURFACES.flatMap((o) =>
    (o.events ?? [])
      .filter((e) => {
        const before = surfaceVersion([o.key]);
        for (const fn of [...(heard.get(e) ?? [])])
          try {
            fn({ type: e, detail: null });
          } catch {
            // another listener's, wanting a read's own detail
          }
        return surfaceVersion([o.key]) === before;
      })
      .map((e) => `${o.key}: ${e}`),
  );
  assert.deepEqual(unheard, [], "an event of a surface's that moves nothing: its page would not draw again");
});

test("the boot's order is its contract", () => {
  assert.deepEqual(
    names.slice(0, 2),
    ["bootComing", "drawComing"],
    "before anything asks for the boot or a page's draw",
  );
  assert.equal(new Set(names).size, names.length, "a step is named once");
  // First of the installs: every page says a time by the workspace's clock from the first paint.
  assert.equal(
    FRAME_INSTALLS.find((step) => !["bootComing", "drawComing", "firstPartDrawn"].includes(step.name))?.run,
    installClock,
  );
  assert.ok(at("clock") < at("tabMemory"), "a tab's memory comes before any page reads it, after the clock");
  // The cache before a page is measured or a surface heard: a page drawn from it is said to have drawn held rows.
  assert.ok(at("cache") < at("pageSpeed") && at("cache") < at("surfaceSignals"));
  // The gate and the registry are the boot's, never an effect's: the frame's first render reads both.
  assert.equal(FRAME_INSTALLS[at("routeGate")]?.run, installRouteGate);
  assert.equal(FRAME_INSTALLS[at("surfaceRegistry")]?.run, installSurfaceRegistry);
  assert.equal(FRAME_INSTALLS[at("shell")]?.run, installShell);
});
