/**
 * An address that is moving draws nothing while it moves (wiring/records-not-pages, task 1.6; finding A3c).
 *
 * The bell rows the edge wrote for a line's setup (and the "we got your request" rows, kept thirty days) still carry
 * `admin/setup`, which the registry moves to the first run (ROUTES_MOVED). The move runs in an effect after the first draw, and
 * the first draw was the honesty gate's card, "Settings - Not in this release", for the frame or more it took. The route table
 * (app-routes.jsx drawRoute) now answers a route that has a place to go (`retiredTo`, resolved with the route) with nothing,
 * whatever the gate says of it, and the page `admin` is Settings' own (surface-registry.ts), which opens Profile for an address
 * that names no pane of it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "demo" });
await import("../../../../apps/dashboard/src/legacy/pages/app-routes.jsx");

const route = (over) => ({
  page: "admin",
  param: "setup",
  routeKey: "admin/setup",
  demoGated: true,
  retiredTo: null,
  surfaceRoutes: {},
  routePage: null,
  navigate() {},
  openAsk() {},
  ...over,
});

test("an address with a place to go draws nothing, not the card that says Not in this release", () => {
  const moving = globalThis.drawRoute(route({ retiredTo: "start" }));
  assert.equal(moving.content, null, "REGRESSION: the card drew for the frame the move took");
  assert.equal(moving.pane, false);
  assert.equal(moving.primaryAction, null);
  assert.equal(moving.mountKey, "admin/setup", "and it is mounted under its own address as every route is");
});

test("a retired page a real workspace is sent from is the same: the Deal board's address draws nothing on the way to People", () => {
  const moving = globalThis.drawRoute(
    route({ page: "pipeline", param: null, routeKey: "pipeline/", retiredTo: "clients" }),
  );
  assert.equal(moving.content, null);
});

test("the gate still draws its card for a demo page nobody is sent from, and a page that is not gated draws as its row says", () => {
  const gated = globalThis.drawRoute(route({ page: "tasks", param: null, routeKey: "tasks/" }));
  assert.ok(gated.content, "a demo page in a real workspace is still the honest card");
  assert.deepEqual(gated.crumbs, ["Tasks"]);
  // The row's own answer, in a session that declared itself a demo: the parked page's landing (drawParked), since its
  // mockup went on 17 October 2026 (the closed-loop audit's S2, Ruben's word), so a demo says the gate's card too.
  const open = globalThis.drawRoute(route({ page: "tasks", param: null, routeKey: "tasks/", demoGated: false }));
  assert.deepEqual(open.crumbs, ["Tasks"]);
  assert.equal(open.content.props.surface, "tasks", "the Not-in-this-release card, drawn by the row");
});

test("an address under Settings that names no pane opens Profile, in the frame's crumbs as in the page", async () => {
  const { SET_TAB, settingsCrumbs } = await import("../../../../apps/dashboard/src/surfaces/settings/frame/tabs.ts");
  for (const param of ["opening", "seats", "nonsense/deeper", "setup"]) {
    assert.equal(SET_TAB(param).id, "profile", `${param}: Settings opens Profile`);
    assert.equal(settingsCrumbs(param).at(-1), "Profile", `${param}: and the crumb says so`);
  }
});
