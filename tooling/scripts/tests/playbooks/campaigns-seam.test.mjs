/**
 * What Campaigns and Live read from the seam, typed (decision 0015, steps 7 and 8): the value each override publishes under
 * its key, the old name it is mirrored under for the pages that have not moved (the frame's tab strip and route crumbs read
 * `__PLAYBOOKS` and `__BROADCASTS`, Today and Ask read `__LIVE`, Leads reads `__REACH_OUTS`), the tab's cache keeping each value
 * beside the globals it owns and giving it back before React draws, and the one difference between "not read yet" and "read
 * and failed": the reach-outs' `null` is a value, and `undefined` is nothing.
 *
 * The real store and the real cache, over a window with sessionStorage.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../_legacy-react.mjs";

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
const { playbooksOverride } = await import(`${S}/surfaces/campaigns/playbooks/surface.ts`);
const { broadcastsOverride } = await import(`${S}/surfaces/campaigns/broadcasts/surface.ts`);
const { reachOutsOverride } = await import(`${S}/surfaces/campaigns/reach-out/surface.ts`);
const { liveOverride } = await import(`${S}/surfaces/live/surface.ts`);
const { settingsOverride } = await import(`${S}/legacy-bridge/surfaces/settings.ts`);

test("each surface's value is held under its key and mirrored under the name the pages that have not moved read", () => {
  const rows = [
    ["playbooks", "__PLAYBOOKS", { rows: [], fetchedAt: 1 }],
    ["broadcasts", "__BROADCASTS", { rows: [], fetchedAt: 1 }],
    ["reach_outs", "__REACH_OUTS", [{ root_id: "r1" }]],
    ["live", "__LIVE", { now: [], recent: [], fetchedAtMs: 1 }],
  ];
  for (const [key, mirror, value] of rows) {
    assert.equal(values.surfaceValue(key), undefined, `${key}: before the first read there is nothing`);
    values.setSurfaceValue(key, value);
    assert.equal(values.surfaceValue(key), value, `${key}: held as it was published, by identity`);
    assert.equal(globalThis[mirror], value, `${key}: mirrored under ${mirror}, the one object`);
    values.setSurfaceValue(key, undefined);
    assert.equal(values.surfaceValue(key), undefined);
    assert.equal(globalThis[mirror], undefined, `${key}: the mirror goes with the value`);
  }
});

test("a reach-outs read that failed is a value (null), and one that has not landed is nothing", () => {
  assert.equal(values.surfaceValue("reach_outs"), undefined, "unread");
  values.setSurfaceValue("reach_outs", null);
  assert.equal(values.surfaceValue("reach_outs"), null, "read and failed: each page says so");
  assert.equal(globalThis.__REACH_OUTS, null, "and the mirror says it too, for Leads, which tells the two apart");
  values.setSurfaceValue("reach_outs", undefined);
  assert.equal(globalThis.__REACH_OUTS, undefined);
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
  const kept = JSON.parse(globalThis.sessionStorage.peek(CACHE));
  assert.deepEqual(kept.surfaces.playbooks, { $value: PLAYBOOKS }, "the value, under its reserved name");
  assert.deepEqual(kept.surfaces.reach_outs, { $value: CHAINS });
  values.setSurfaceValue("playbooks", undefined);
  values.setSurfaceValue("reach_outs", undefined);
  const restored = cache.hydrateSurfaceCache();
  assert.ok(restored.has("playbooks") && restored.has("reach_outs"), "real data before it draws: no loading state");
  assert.deepEqual(values.surfaceValue("playbooks"), PLAYBOOKS);
  assert.deepEqual(globalThis.__PLAYBOOKS, PLAYBOOKS, "and the mirror is back for the pages that read it");
  assert.deepEqual(values.surfaceValue("reach_outs"), CHAINS);
  values.setSurfaceValue("playbooks", undefined);
  values.setSurfaceValue("reach_outs", undefined);
});

test("Live is never kept: the runner snapshots nothing of a surface with no global and no value", () => {
  const before = globalThis.sessionStorage.peek(CACHE);
  values.setSurfaceValue("live", { now: [{ callId: "c1" }], recent: [], fetchedAtMs: 1 });
  cache.snapshotSurface("live", liveOverride.globals ?? [], "t-salon", undefined, liveOverride.value);
  cache.flushSurfaceCache();
  assert.equal(globalThis.sessionStorage.peek(CACHE), before, "nothing to keep, nothing written");
  values.setSurfaceValue("live", undefined);
});
