/**
 * Live is an App Router page (decision 0015, step 8): what the frame says around it is the surface's
 * (src/surfaces/live/routes.ts). Its demo's sample went with demo mode (16 Nov 2026).
 *
 * - The crumbs start at the Inbox, whose tab Live is, and name the caller of the call an address opens once the surface holds
 *   it (a call ended a moment ago is still named: the list holds the last few).
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const S = "../../../apps/dashboard/src/surfaces";
const { liveChrome } = await import(`${S}/live/routes.ts`);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { SURFACE_ROUTES, routeHasPage } = await import(`${S}/routes.ts`);

afterEach(() => setSurfaceValue("live", undefined));

test("Live's crumbs start at the Inbox, and name the caller of the call the address opens once the surface holds it", () => {
  const inbox = { label: "Inbox", to: "inbox" };
  assert.deepEqual(liveChrome({ param: null }).crumbs, [inbox, "Live"]);
  assert.deepEqual(liveChrome({ param: "c-1" }).crumbs, [inbox, "Live"], "before the first read no call is named");
  setSurfaceValue("live", {
    now: [{ callId: "c-1", who: "Rosa Díaz" }],
    recent: [{ callId: "c-2", who: "Emily Chen" }],
  });
  assert.deepEqual(liveChrome({ param: "c-1" }).crumbs, [inbox, { label: "Live", to: "live" }, "Rosa Díaz"]);
  assert.deepEqual(
    liveChrome({ param: "c-2" }).crumbs,
    [inbox, { label: "Live", to: "live" }, "Emily Chen"],
    "a finished call too",
  );
  assert.deepEqual(
    liveChrome({ param: "c-9" }).crumbs,
    [inbox, "Live"],
    "a call the surface does not hold is named by nobody",
  );
  assert.equal(liveChrome({ param: null }).mount, "live", "the page follows its call: one mount across them");
});

test("the frame takes Live and every call under it, lit under the Inbox's Live", () => {
  assert.ok(routeHasPage("live"));
  assert.ok(routeHasPage("live/c-1"));
  assert.equal(SURFACE_ROUTES.live.activeNav, "live");
  assert.equal(SURFACE_ROUTES.live.pane, true);
});
