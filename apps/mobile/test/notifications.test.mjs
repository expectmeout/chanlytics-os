/**
 * The pure part of being told (src/shell/notifications.ts): which tab a route belongs to, and the route a push
 * carries, refused when it is not the page's own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { tabOf, routeOfData, tapOfData, TAB_ROUTES } from "../src/shell/notifications-pure.ts";

test("each tab opens on a route the web has, and that route is the tab's own: More's page is Today under its drawer", () => {
  for (const tab of ["today", "inbox", "calendar", "people"]) {
    assert.equal(
      tabOf(TAB_ROUTES[tab]),
      tab,
      `REGRESSION: the People tab opened #/people, which the web does not have`,
    );
  }
  assert.equal(TAB_ROUTES.people, "clients");
  assert.equal(TAB_ROUTES.more, "today");
});

test("a route belongs to the tab that draws it; everything else is More's, where the drawer reaches all", () => {
  assert.equal(tabOf("inbox"), "inbox");
  assert.equal(tabOf("inbox/th-abc"), "inbox");
  assert.equal(tabOf("today"), "today");
  assert.equal(tabOf("calendar"), "calendar");
  assert.equal(tabOf("clients"), "people");
  assert.equal(tabOf("clients/leads"), "people");
  assert.equal(tabOf("reports"), "more");
  assert.equal(tabOf("admin/setup"), "more");
  assert.equal(tabOf("inboxes"), "more", "a prefix is not a tab");
});

test("a push's route is one of the page's own or nothing", () => {
  assert.equal(routeOfData({ route: "inbox/th-1", notification_id: "n" }), "inbox/th-1");
  assert.equal(routeOfData({ route: "https://example.com" }), null);
  assert.equal(routeOfData({ route: null }), null);
  assert.equal(routeOfData("inbox"), null);
});

test("a tap opens its route in the workspace it was told for, by that workspace's id, or in the one on screen", () => {
  const W = "22222222-2222-4222-8222-222222222222";
  assert.deepEqual(tapOfData({ route: "inbox/th-1", notification_id: "n", tenant_id: W }), {
    route: "inbox/th-1",
    workspace: W,
  });
  assert.deepEqual(tapOfData({ route: "inbox/th-1", tenant_id: "acme" }), { route: "inbox/th-1", workspace: null });
  assert.deepEqual(tapOfData({ route: "inbox" }), { route: "inbox", workspace: null });
  assert.equal(tapOfData({ route: "https://example.com", tenant_id: W }), null, "no route, no tap");
});
