/**
 * Moving quickly between pages with reads still out: the page arrived at draws on its own reads alone, and the answer of
 * a page left lands in its own place and nowhere else (the reviews of 28 Nov 2026: R3.12; lane 11's item 2).
 *
 * The order the runner reads in after a move is held where the runner is run (tests/shell/surfaces/surface-boot.test.mjs:
 * a move asked while the boot is out, a move while the rest is out; tests/shell/address: reads after a move's motion).
 * This holds the two things a quick walk leans on beside that order, each on the real seam: the gate of the page on screen
 * is its own, whatever else is still out, and a view picked through the seam never waits behind the view it left. Held as
 * they stand: this found nothing to mend.
 *
 * Its own file: the statuses are module state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { provided } from "../_bridge-holds.mjs";

globalThis.window = {
  location: { pathname: "/w/harbor/conversations", hash: "" },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};
const reg = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
const status = await importSrc("apps/dashboard/src/bridge/surface-status.ts");
const data = await importSrc("apps/dashboard/src/bridge/surface-data.ts");
reg.installRouteGate();
const gate = (page) => provided("surfaceGate")(page);

test("a walk from Conversations to Live to People, each read still out: People draws when People's read lands", async () => {
  // Three pages pressed one after another; nothing has landed. And a page elsewhere holds its own first draw for code.
  let landCode = () => {};
  status.firstDrawWaitsFor("campaigns", new Promise((land) => (landCode = land)));
  for (const page of ["conversations", "live", "clients"]) assert.equal(gate(page), false, `${page}: nothing in yet`);

  // The last page's own read lands first: it draws, with the two pages left still reading.
  status.setStatus("people", "live");
  assert.equal(gate("clients"), true, "REGRESSION: the page on screen held for the reads of pages left behind");
  assert.equal(gate("conversations"), false);
  assert.equal(gate("live"), false);
  assert.equal(status.codeOutFor("campaigns"), true, "another page's wait for its code is its own");

  // A page left behind fails its read, and another lands late: each is its own surface's news, and People stays drawn.
  status.setStatus("conversations", "seeded");
  status.setStatus("live", "live");
  assert.equal(gate("clients"), true);
  assert.equal(status.isSurfaceFailed("conversations"), true);
  assert.equal(status.isSurfaceFailed("people"), false, "a failure of a page left is not the page on screen's");
  assert.equal(gate("live"), true, "and going back to Live finds it read");

  landCode();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(status.codeOutFor("campaigns"), false);
});

test("a view picked while the read of the view left is still out is read at once, and each answer is its own view's", async () => {
  // A surface whose view the page picks through the seam (Reports' period, the Calendar's days): reads of one view take
  // their turn, and a read of another view starts at once.
  const asked = [];
  const landing = {};
  const published = [];
  let shown = "7d";
  const surface = {
    key: "made_up_period",
    view: () => shown,
    apply: async () => {
      const mine = shown;
      asked.push(mine);
      await new Promise((land) => (landing[mine] = land));
      // The surface drops an answer for a view it has left, as each picked surface does.
      if (mine === shown) published.push(mine);
    },
  };
  const first = data.activateOverride(surface);
  assert.equal(data.readIsOut(surface), true);
  shown = "30d";
  assert.equal(data.readIsOut(surface), false, "no read of the view now shown is out");
  const second = data.activateOverride(surface);
  assert.deepEqual(asked, ["7d", "30d"], "REGRESSION: the pick waited behind the read of the view it left");

  // The newer view's answer lands first, then the older one's: only the view shown is published.
  landing["30d"]();
  assert.equal(await second, true);
  landing["7d"]();
  assert.equal(await first, true);
  assert.deepEqual(published, ["30d"], "the answer for the view left is dropped, never drawn over the one shown");
  assert.equal(data.readIsOut(surface), false);
});
