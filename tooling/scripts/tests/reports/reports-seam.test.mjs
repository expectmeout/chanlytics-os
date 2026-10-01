/**
 * What a surface that has left the shell reads from the seam, typed (decision 0015, step 3): the value the override
 * publishes under its key, the name it is mirrored under for the pages that have not moved, the tab's cache keeping it
 * beside the window's globals, and `useSurface` handing it to a component and drawing that component again when the
 * surface moves.
 *
 * The real store, the real cache and the real hook, over a window with sessionStorage and the page tests' stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, redrawWanted, quiet } from "../_legacy-react.mjs";

const CACHE = "chanlytics.surfaces.v1";
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    peek: (k) => m.get(k),
  };
};
installLegacyReact();
globalThis.sessionStorage = storage();
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.__ACTIVE_WORKSPACE = "t-salon";

const S = "../../../../apps/dashboard/src";
const values = await import(`${S}/surfaces/surface-values.ts`);
const cache = await import(`${S}/legacy-bridge/surface-cache.ts`);
// Importing the overrides declares the mirrors, as the app's boot does.
await import(`${S}/surfaces/reports/surface.ts`);
await import(`${S}/legacy-bridge/google.ts`);
// The surface's signal, from the module the surface reads it through (the stub's own copy is the shell pages').
const { surfaceMoved: surfaceLanded } = await import(`${S}/legacy-bridge/surface-status.ts`);
const { useSurface } = await import(`${S}/surfaces/use-surface.ts`);

const REPORTS = { vm: { days: 30 }, days: 30, fetchedAt: 1 };

test("a value is held under its key and mirrored under the name the pages that have not moved read; nothing held is nothing on both", () => {
  assert.equal(values.surfaceValue("reports"), undefined, "before the first read there is nothing");
  values.setSurfaceValue("reports", REPORTS);
  assert.equal(values.surfaceValue("reports"), REPORTS, "held as it was published, by identity");
  assert.equal(globalThis.__REPORTS, REPORTS, "and mirrored under its old name, the one object");
  values.setSurfaceValue("reports", undefined);
  assert.equal(values.surfaceValue("reports"), undefined);
  assert.equal(globalThis.__REPORTS, undefined, "the mirror goes with the value");
  values.setSurfaceValue("google", { dto: { ready: {} }, fetchedAt: 2 });
  assert.equal(globalThis.__GOOGLE.fetchedAt, 2, "Google's is mirrored too, for Today's line and Setup");
  values.setSurfaceValue("google", undefined);
});

test("the tab's cache keeps the value beside the globals a surface owns, and gives it back before React draws", () => {
  values.setSurfaceValue("reports", REPORTS);
  cache.snapshotSurface("reports", [], "t-salon", undefined, "reports");
  cache.flushSurfaceCache();
  const kept = JSON.parse(globalThis.sessionStorage.peek(CACHE));
  assert.deepEqual(kept.surfaces.reports, { $value: REPORTS }, "the value, under its reserved name");
  values.setSurfaceValue("reports", undefined);
  const restored = cache.hydrateSurfaceCache();
  assert.ok(restored.has("reports"), "the surface has its real data before it draws: no loading state");
  assert.deepEqual(values.surfaceValue("reports"), REPORTS);
  assert.deepEqual(globalThis.__REPORTS, REPORTS, "and the mirror is back for the pages that read it");
  values.setSurfaceValue("reports", undefined);
});

test("a surface with no global and no value caches nothing; a name in the cache that is no surface's key is not taken for one", () => {
  const before = globalThis.sessionStorage.peek(CACHE);
  cache.snapshotSurface("nothing", [], "t-salon");
  cache.flushSurfaceCache();
  assert.equal(globalThis.sessionStorage.peek(CACHE), before, "nothing to keep, nothing written");
  values.restoreSurfaceValue("not-a-surface", { a: 1 });
  assert.equal(values.surfaceValue("not-a-surface"), undefined, "a name that is no surface's key holds nothing");
  values.restoreSurfaceValue("toString", { a: 1 });
  assert.equal(values.surfaceValue("toString"), undefined, "a name every object has is no key");
  assert.equal(typeof globalThis.toString, "function", "and the window's own is left as it is");
});

test("useSurface answers the surface's value and draws its component again when the surface moves, and not for another's", () => {
  values.setSurfaceValue("reports", undefined);
  const Page = () => globalThis.React.createElement("div", { "data-days": useSurface("reports")?.days ?? "none" });
  fresh();
  assert.equal(
    Page().props["data-days"],
    "none",
    "before the first read: nothing, which the page says as its own empty state",
  );
  values.setSurfaceValue("reports", REPORTS);
  quiet();
  surfaceLanded("today");
  assert.equal(redrawWanted(), false, "another surface's read is not this page's");
  surfaceLanded("reports");
  assert.equal(redrawWanted(), true, "this surface's rows landed: draw again");
  assert.equal(again(Page).props["data-days"], 30, "and the draw has the value");
  values.setSurfaceValue("reports", undefined);
});
