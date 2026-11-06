/**
 * The outline lights the place the frame lights (surfaces/frame/places.ts OUTLINE_ROUTES, contracts outlineBootScript).
 *
 * The document's outline is drawn before the app's code has run, so the place a route lights is said to it by the first
 * word of the address, as the path writes it. The frame says it from its route table (routes.ts activeNav, through
 * placeLit, the sidebar's own reading). Here every route of the table with a fixed place is held to the outline's word for
 * it: a route that moves to another place, or a new route with a place, moves the outline's table in the same change, or
 * the cold load lights the wrong row and stands its words where the frame's will not (the nightly of 2 Nov 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTE_WORDS } from "@chanlytics/contracts";

const S = "../../../apps/dashboard/src";
const { SURFACE_ROUTES } = await import(`${S}/surfaces/routes.ts`);
const { NAV_GROUPS, OUTLINE_ROUTES, placeLit } = await import(`${S}/surfaces/frame/places.ts`);

/** The sidebar's places a load can light: every row but the demo's. */
const PLACES = new Set(NAV_GROUPS.flatMap((g) => g.items.filter((i) => !i.demoOnly).map((i) => i.id)));

test("every route with a fixed place lights, on the outline, the row the frame lights for it", () => {
  let held = 0;
  for (const [route, at] of Object.entries(SURFACE_ROUTES)) {
    if (typeof at.activeNav !== "string") continue;
    const word = Object.hasOwn(ROUTE_WORDS, route) ? ROUTE_WORDS[route] : route;
    const place = placeLit(at.activeNav);
    const want = PLACES.has(place) ? place : undefined;
    assert.equal(OUTLINE_ROUTES.lit[word], want, `${route} (the path's "${word}") lights ${want ?? "no row"}`);
    held += 1;
  }
  assert.ok(held > 8, "the route table's places were read");
});

test("the outline names only places the sidebar draws", () => {
  for (const [word, place] of Object.entries(OUTLINE_ROUTES.lit))
    assert.ok(PLACES.has(place), `"${word}" lights ${place}, which is no row of the sidebar`);
});
