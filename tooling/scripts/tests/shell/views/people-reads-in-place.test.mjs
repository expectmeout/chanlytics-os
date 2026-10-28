/**
 * People on a cold load is drawn in one place, as it will stand once its rows are in (the People load review, 28 Oct
 * 2026). Each of these moved it on production:
 * - the frame's Reading… stood one draw, then the view was mounted again in its place, which said nothing until People was
 *   in: Reading…, an empty pane for 100 to 160 ms, then the list. People's scopes read in place from the first draw now
 *   (frame/shell-hooks.ts useViewFade), and each says Reading… where its rows will stand (people-route.tsx);
 * - a person's page stood under the head drawn with their name, and the head went as their page came, 55 px of a phone's
 *   top. Their address says the page draws its own head (people/chrome.ts `ownHead`), which the route table passes to the
 *   frame: its head draws no name over them (people-head.test.mjs), and its pane takes the screen over as their page does
 *   (`data-takeover`, mobile.css; e2e/people/people-loads.spec.ts measures the phone's).
 *
 * Run on the real hook and the real route table, over the stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { installLegacyReact, fresh, again } from "../../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
const win = globalThis.window;
const { useViewFade } = await importSrc("apps/dashboard/src/surfaces/frame/shell-hooks.ts");
const { drawRoute } = await importSrc("apps/dashboard/src/surfaces/frame/route-table.tsx");
const { SURFACE_ROUTES } = await importSrc("apps/dashboard/src/surfaces/routes.ts");
const strip = await importSrc("apps/dashboard/src/surfaces/frame/surface-tabs.tsx");
const words = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
// Where a view stands on a strip is the strip's, over People's scope words, as the shell publishes them (seed-globals.ts).
Object.assign(win, { stripPlace: strip.stripPlace, plScopes: words.plScopes, plScopeRoute: words.plScopeRoute });

const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";

/** The route view's answer, drawn once while the route reads and once as it lands, in one frame of the stub. */
function views(page, param, mountKey) {
  const placed = { current: null };
  fresh();
  const reading = again(() => useViewFade({ page, param }, mountKey, true, placed));
  const landed = again(() => useViewFade({ page, param }, mountKey, false, placed));
  return { reading, landed };
}

test("REGRESSION: People's list reads in place from its first draw -- the frame's Reading… stood one draw and the view was mounted again in its place, empty until People was in", () => {
  for (const param of [null, "seg:needs-you", "pipeline", "leads"]) {
    const { reading, landed } = views("clients", param, "clients");
    assert.equal(reading.readsInPlace, true, `${param ?? "Everyone"}: the scope says its own Reading…`);
    assert.equal(reading.viewKey, "clients", "under the view it will be drawn in");
    assert.equal(landed.viewKey, reading.viewKey, "so nothing is mounted again as People lands");
  }
  // A person's page waits for who is looking under the frame's own pane (registry routeSurfaceFor): it is no scope.
  const person = views("clients", ID, "clients");
  assert.equal(person.reading.readsInPlace, false);
  assert.equal(person.reading.viewKey, "clients/reading");
  // And a page the frame reads for is the frame's to say, its view keyed on readiness so it fades in as it lands.
  const calendar = views("calendar", null, "calendar");
  assert.equal(calendar.reading.readsInPlace, false);
  assert.notEqual(calendar.reading.viewKey, calendar.landed.viewKey);
});

test("REGRESSION: a person's address heads itself before their page is in -- the head drawn with their name went as their page came", () => {
  const drawn = (param) =>
    drawRoute({
      page: "clients",
      param,
      routeKey: `clients/${param ?? ""}`,
      navigate() {},
      backToPeople() {},
      routePage: { type: "RoutePage", props: {} },
      surfaceRoutes: SURFACE_ROUTES,
    });
  assert.equal(drawn(ID).ownHead, true, "a person's page draws its own head (people/chrome.ts)");
  assert.equal(drawn(null).ownHead, false, "People's list is headed by the frame");
});
