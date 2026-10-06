/**
 * What the style-equality recorder opens (tooling/scripts/checks/style-equality.mjs, PAGES) is only ever a
 * route the harness can draw. The harness is the mockup's static server: it draws the shell's own table and the kit's
 * gallery, and answers an App Router page (every route in apps/dashboard/src/surfaces/routes.ts) with "No surface at",
 * which `record` refuses. A page that leaves the shell takes its route out of the list in the same change; this holds
 * the list to it, so the recorder cannot rot into a tool that fails on its first page again (it did, on 5 Oct 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGES } from "../../checks/style-equality.mjs";
import { importSrc } from "../_source.mjs";

const { routeHasPage } = await importSrc("apps/dashboard/src/surfaces/routes.ts");

/** Every route the recorder opens, with the record that opens it. */
const opened = () => Object.entries(PAGES).flatMap(([record, routes]) => routes.map((route) => [record, route]));

test("the recorder opens no route that has left the shell: an App Router page is drawn by Next alone", () => {
  const gone = opened()
    .filter(([, route]) => routeHasPage(route))
    .map(([at, route]) => `${at}: ${route}`);
  assert.deepEqual(gone, [], "a route that left the shell comes out of PAGES in the change that moves it");
});

test("a record opens something", () => {
  for (const [record, routes] of Object.entries(PAGES)) assert.ok(routes.length > 0, `${record} opens no route`);
});
