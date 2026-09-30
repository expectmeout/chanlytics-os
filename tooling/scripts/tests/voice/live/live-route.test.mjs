/**
 * Live is an App Router page (decision 0015, step 8): what the frame says around it is the surface's
 * (src/surfaces/live/routes.ts), and its demo draws a contracts sample (src/surfaces/live/sample.ts), not the mockup's console.
 *
 * - The crumbs start at the Inbox, whose tab Live is, and name the caller of the call an address opens once the surface holds
 *   it (a call ended a moment ago is still named: the list holds the last few).
 * - The sample is the real page's own view model, passed through the same contracts function: one call in progress under
 *   the heartbeat rule, one that ended with its analysis, a line that is on; the same moment is the same page.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const S = "../../../../../apps/dashboard/src/surfaces";
const { liveChrome } = await import(`${S}/live/routes.ts`);
const { liveSample } = await import(`${S}/live/sample.ts`);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { SURFACE_ROUTES, routeHasPage } = await import(`${S}/routes.ts`);
const { liveStillUp } = await import("@chanlytics/contracts");

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

test("the demo's Live is the real view model over a sample business: a call on the line, one that ended, a line that is on", () => {
  const now = new Date("2026-09-28T18:00:00Z");
  const a = liveSample(now);
  assert.deepEqual(liveSample(now), a, "the same moment is the same page");
  assert.equal(a.now.length, 1, "one call in progress");
  assert.ok(
    a.now[0].live && liveStillUp(a.now[0], a.heartbeatMs, now.getTime()),
    "under the heartbeat rule, not the status flag alone",
  );
  assert.equal(a.now[0].transcript.length, 2, "the turns so far");
  assert.equal(a.recent.length, 1);
  assert.equal(a.recent[0].live, false);
  assert.ok(a.recent[0].wanted && a.recent[0].followUp, "an ended call carries its analysis");
  assert.equal(a.line.on, true);
  assert.equal(a.lineRead, true);
  assert.equal(a.fetchedAtMs, now.getTime());
  assert.doesNotMatch(JSON.stringify(a), /Serenity|Selena/, "nothing of the mockup's invented callers");
});
