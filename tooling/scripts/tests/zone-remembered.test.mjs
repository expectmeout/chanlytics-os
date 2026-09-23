/**
 * A cold boot knows the workspace's zone at once.
 *
 * Measured on production, 23 Sep 2026: on a cold boot (a new tab, a phone reopening the app, where the tab's surface
 * cache is empty) the Calendar's first read started only after the workspace read answered, about 650ms in, because
 * it waits for the zone to learn which day is today. Today's day card drew half a second after the queue beside it.
 * The zone this browser last saw for a workspace now answers at once; the workspace's own, once published or read,
 * wins and is remembered in its place.
 *
 * Run against zone.ts itself, on a window with a storage and an address.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (p) => pathToFileURL(path.join(ROOT, p)).href;

const storage = () => {
  const kept = new Map();
  return {
    kept,
    getItem: (k) => (kept.has(k) ? kept.get(k) : null),
    setItem: (k, v) => kept.set(k, String(v)),
    removeItem: (k) => kept.delete(k),
  };
};
const tab = (over = {}) => ({ location: { pathname: "/w/melanys", hash: "" }, localStorage: storage(), ...over });

globalThis.window = tab();
const { knownZone, workspaceZone } = await import(at("apps/dashboard/src/legacy-bridge/zone.ts"));

test("the workspace's own zone, once published, is what the tab knows, and this browser remembers it by the workspace's address", () => {
  const win = tab({
    __WORKSPACES: [{ id: "t1", timezone: "America/New_York" }],
    __ACTIVE_WORKSPACE: "t1",
  });
  assert.equal(knownZone(win), "America/New_York");
  assert.deepEqual(JSON.parse(win.localStorage.getItem("chanlytics.zones.v1")), { melanys: "America/New_York" });
});

test("a cold boot answers from the zone this browser remembers, and makes no read to learn it", async () => {
  const win = tab();
  win.localStorage.setItem("chanlytics.zones.v1", JSON.stringify({ melanys: "America/Chicago", other: "Asia/Tokyo" }));
  assert.equal(knownZone(win), "America/Chicago", "REGRESSION: null until the workspace read answered");
  // No window.fetch at all: had it read, the read would have thrown.
  assert.equal(await workspaceZone(win), "America/Chicago");
  const elsewhere = tab({ location: { pathname: "/w/other", hash: "" }, localStorage: win.localStorage });
  assert.equal(knownZone(elsewhere), "Asia/Tokyo", "each workspace by its own address");
});

test("the workspace's own zone wins over the remembered one, and replaces it", () => {
  const win = tab({ __WORKSPACES: [{ id: "t1", timezone: "Europe/Madrid" }], __ACTIVE_WORKSPACE: "t1" });
  win.localStorage.setItem("chanlytics.zones.v1", JSON.stringify({ melanys: "America/Chicago" }));
  assert.equal(knownZone(win), "Europe/Madrid");
  assert.equal(JSON.parse(win.localStorage.getItem("chanlytics.zones.v1")).melanys, "Europe/Madrid");
});

test("off a workspace's address, and with storage blocked, nothing is invented", () => {
  assert.equal(knownZone(tab({ location: { pathname: "/", hash: "" } })), null);
  const blocked = tab({
    location: { pathname: "/w/blocked", hash: "" },
    localStorage: {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    },
  });
  assert.equal(knownZone(blocked), null);
});
