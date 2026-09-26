/**
 * What a page's first draw waits for beside its own surface (surface-registry.ts ROUTE_WAITS), run through the gate the
 * shell asks (installRouteGate over surface-status), not read as text.
 *
 * Today draws what is left to set up ABOVE its queue. Read seventh, it landed after the queue and pushed it down
 * (Ruben, 24 Sep 2026). Its own file: the statuses are module state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window = { location: { pathname: "/w/harbor", hash: "#/today" } };
const reg = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const status = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
reg.installRouteGate();
const gate = globalThis.window.__surfaceGate;

test("Today waits for Setup beside its own surface; asked for its own alone, it does not", () => {
  assert.equal(gate("today"), false, "nothing in yet");
  status.setStatus("today", "live");
  assert.equal(gate("today"), false, "REGRESSION: the queue drawn while the card above it was still on its way");
  assert.equal(gate("today", null, true), true, "its own surface is in: the shell draws after the wait regardless");
  status.setStatus("setup", "live");
  assert.equal(gate("today"), true, "the card and the queue draw together");
  assert.equal(globalThis.window.__routeWaitMs, reg.ROUTE_WAIT_MS, "the shell is told how long a wait may hold it");
});

test("a Setup that failed is done waiting, and never holds a page that waits for nothing", () => {
  status.setStatus("inbox", "live");
  assert.equal(gate("inbox"), true, "the Inbox waits for its own surface alone");
  // A fresh key pair, as the statuses are module state: a page whose band failed draws, and says so where it would be.
  reg.ROUTE_WAITS.inbox = ["google"];
  try {
    assert.equal(gate("inbox"), false);
    status.setStatus("google", "seeded");
    assert.equal(gate("inbox"), true, "failed is over: the page draws");
  } finally {
    delete reg.ROUTE_WAITS.inbox;
  }
});
