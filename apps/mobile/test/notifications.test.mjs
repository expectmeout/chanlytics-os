/**
 * The pure part of being told (src/shell/notifications.ts): which tab a route belongs to, and the route and badge a
 * push carries, refused when they are not the page's own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { tabOf, routeOfData, badgeOfData, TAB_ROUTES } from "../src/shell/notifications-pure.ts";

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

test("a push's route is one of the page's own or nothing; its badge a whole number or nothing", () => {
  assert.equal(routeOfData({ route: "inbox/th-1", notification_id: "n" }), "inbox/th-1");
  assert.equal(routeOfData({ route: "https://example.com" }), null);
  assert.equal(routeOfData({ route: null }), null);
  assert.equal(routeOfData("inbox"), null);
  assert.equal(badgeOfData({ badge: 3 }), 3);
  assert.equal(badgeOfData({ badge: -1 }), null);
  assert.equal(badgeOfData({}), null);
});
