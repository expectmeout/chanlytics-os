/**
 * What Campaigns and Live read from the seam, typed (decision 0015, steps 7 and 8): the value each override publishes under
 * its key, the old name it is mirrored under where a page that has not moved still reads it (`__BROADCASTS` and `__LIVE`;
 * `__PLAYBOOKS` and `__REACH_OUTS` went on 12 Nov 2026, their last readers moved), the tab's cache keeping each value
 * beside the globals it owns and giving it back before React draws, and the one difference between "not read yet" and "read
 * and failed": the reach-outs' `null` is a value, and `undefined` is nothing.
 *
 * The real store and the real cache, over a window with sessionStorage.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact } from "../_stub-react.mjs";

// The cache's slot for the stub window's workspace (its address, /w/studio): local storage, one slot a workspace.
const CACHE = "chanlytics.surfaces.v2:studio";
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    peek: (k) => m.get(k),
  };
};
installStubReact();
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.__ACTIVE_WORKSPACE = "t-salon";

const S = "../../apps/dashboard/src";
const values = await import(`${S}/surfaces/surface-values.ts`);
const cache = await import(`${S}/bridge/surface-cache.ts`);
// Importing the overrides declares the mirrors, as the app's boot does.
const { playbooksOverride } = await import(`${S}/surfaces/campaigns/playbooks/surface.ts`);
const { broadcastsOverride } = await import(`${S}/surfaces/campaigns/broadcasts/surface.ts`);
const { reachOutsOverride } = await import(`${S}/surfaces/campaigns/reach-out/override.ts`);
const { liveOverride } = await import(`${S}/surfaces/live/surface.ts`);
const { settingsOverride } = await import(`${S}/bridge/surfaces/settings.ts`);

test("each surface's value is held under its key, and mirrored under its old name only where a page still reads it", () => {
  // [key, its old name, a value, whether a page still reads the old name]
  const rows = [
    ["playbooks", "__PLAYBOOKS", { rows: [], fetchedAt: 1 }, false],
    ["broadcasts", "__BROADCASTS", { rows: [], fetchedAt: 1 }, true],
    ["reach_outs", "__REACH_OUTS", [{ root_id: "r1" }], false],
    ["live", "__LIVE", { now: [], recent: [], fetchedAtMs: 1 }, true],
  ];
  for (const [key, mirror, value, mirrored] of rows) {
    assert.equal(values.surfaceValue(key), undefined, `${key}: before the first read there is nothing`);
    values.setSurfaceValue(key, value);
    assert.equal(values.surfaceValue(key), value, `${key}: held as it was published, by identity`);
    if (mirrored) assert.equal(globalThis[mirror], value, `${key}: mirrored under ${mirror}, the one object`);
    else assert.equal(mirror in globalThis, false, `${key}: no mirror, as no page reads ${mirror}`);
    values.setSurfaceValue(key, undefined);
    assert.equal(values.surfaceValue(key), undefined);
    if (mirrored) assert.equal(globalThis[mirror], undefined, `${key}: the mirror goes with the value`);
  }
});

test("a reach-outs read that failed is a value (null), and one that has not landed is nothing", () => {
  assert.equal(values.surfaceValue("reach_outs"), undefined, "unread");
  values.setSurfaceValue("reach_outs", null);
  assert.equal(values.surfaceValue("reach_outs"), null, "read and failed: each page says so");
  values.setSurfaceValue("reach_outs", undefined);
  assert.equal(values.surfaceValue("reach_outs"), undefined);
});

test("the overrides publish their typed value for the cache (the key it is published under), and Live's stays out of it", () => {
  assert.equal(playbooksOverride.value, "playbooks");
  assert.equal(broadcastsOverride.value, "broadcasts");
  assert.equal(reachOutsOverride.value, "reach_outs");
  assert.equal(settingsOverride.value, "settings", "Settings' slice is what Templates reads");
  // Deliberately not cached (surfaces/live/surface.ts): a reload must never paint a call that ended while the tab was closed.
  assert.equal(liveOverride.value, undefined);
  assert.deepEqual(liveOverride.globals, []);
});

test("the tab's cache keeps each value beside the globals a surface owns, and gives it back before React draws", () => {
  const PLAYBOOKS = { rows: [{ id: "pb-1" }], fetchedAt: 5 };
  const CHAINS = [{ root_id: "r1", name: "Trainers" }];
  values.setSurfaceValue("playbooks", PLAYBOOKS);
  values.setSurfaceValue("reach_outs", CHAINS);
  cache.snapshotSurface("playbooks", playbooksOverride.globals ?? [], "t-salon", undefined, playbooksOverride.value);
  cache.snapshotSurface("reach_outs", reachOutsOverride.globals ?? [], "t-salon", undefined, reachOutsOverride.value);
  cache.flushSurfaceCache();
  const kept = JSON.parse(globalThis.localStorage.peek(CACHE));
  // What it was kept under rides beside it (#1881: the build, its shape, when), never a window global's name.
  const valueOf = ({ $kept, ...rest }) => (assert.deepEqual(Object.keys($kept).sort(), ["at", "build", "shape"]), rest);
  assert.deepEqual(valueOf(kept.surfaces.playbooks), { $value: PLAYBOOKS }, "the value, under its reserved name");
  assert.deepEqual(valueOf(kept.surfaces.reach_outs), { $value: CHAINS });
  values.setSurfaceValue("playbooks", undefined);
  values.setSurfaceValue("reach_outs", undefined);
  const restored = cache.hydrateSurfaceCache();
  assert.ok(restored.has("playbooks") && restored.has("reach_outs"), "real data before it draws: no loading state");
  assert.deepEqual(values.surfaceValue("playbooks"), PLAYBOOKS);
  assert.deepEqual(values.surfaceValue("reach_outs"), CHAINS);
  values.setSurfaceValue("playbooks", undefined);
  values.setSurfaceValue("reach_outs", undefined);
});

test("Live is never kept: the runner snapshots nothing of a surface with no global and no value", () => {
  const before = globalThis.localStorage.peek(CACHE);
  values.setSurfaceValue("live", { now: [{ callId: "c1" }], recent: [], fetchedAtMs: 1 });
  cache.snapshotSurface("live", liveOverride.globals ?? [], "t-salon", undefined, liveOverride.value);
  cache.flushSurfaceCache();
  assert.equal(globalThis.localStorage.peek(CACHE), before, "nothing to keep, nothing written");
  values.setSurfaceValue("live", undefined);
});
