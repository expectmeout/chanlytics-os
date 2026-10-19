/**
 * An alert opens ONE place, whichever of the bell, the phone and the mail it reaches you by (wiring/records-not-pages,
 * task 1.7; findings A2a, NS-4, A2d and N2). The bell opened the row's route and, with none, the kind's list door; the phone
 * carried the route as the row had it (null with none); the mail carried no link at all. Now the three take the place from
 * one function, `noticeRoute`, and a link anywhere outside the app is written by one more, `appLink`, which builds on the
 * path the product's pages already have (`workspacePath`).
 *
 * The edge's mails and returns are run in their own files here (every-alert-mail-..., google-returns-..., the alert test);
 * this file holds the contracts they stand on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appLink,
  movedAddress,
  noticeRoute,
  openItLine,
  routeOfAddress,
  serverNotificationRows,
  SERVER_NOTIFICATION_KINDS,
  EMAILED_NOTIFICATION_KINDS,
} from "@chanlytics/contracts";

const ID = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";

/** A page's address, read back the way the frame reads it on load. */
const routeOf = (link) => {
  const u = new URL(link, "https://app.example");
  const moved = movedAddress({ pathname: u.pathname, search: u.search, hash: u.hash });
  return routeOfAddress(moved ? new URL(moved, "https://app.example") : u);
};

test("a link names the workspace and the page, in the words the product writes its paths in", () => {
  assert.equal(appLink("acme", "inbox/th-1"), "/w/acme/inbox/th-1");
  assert.equal(appLink("acme"), "/w/acme", "no route is the workspace's own page");
  assert.equal(appLink("acme", ""), "/w/acme");
  assert.equal(
    appLink("acme", "admin/notifications"),
    "/w/acme/settings/notifications",
    "the shell's name, the product's word",
  );
  assert.equal(appLink("acme", "clients/leads"), "/w/acme/people/leads");
  assert.equal(
    appLink("acme", "outbound/pb-1"),
    "/w/acme/campaigns/sequences/pb-1",
    "a retired route lands where it moved to",
  );
  assert.equal(appLink("a b", "inbox"), "/w/a%20b/inbox", "the slug is encoded, as workspacePath encodes it");
});

test("a query rides after the route, in the order it was given, and what is not a value is left out", () => {
  assert.equal(
    appLink("acme", "admin/integrations", { google: "connected" }),
    "/w/acme/settings/integrations?google=connected",
  );
  assert.equal(
    appLink("acme", "admin/integrations", { google: "error", why: "state_expired" }),
    "/w/acme/settings/integrations?google=error&why=state_expired",
  );
  assert.equal(
    appLink("acme", "today", { x: undefined, y: null }),
    "/w/acme/today",
    "nothing to say is no question mark",
  );
  assert.equal(appLink("acme", "", { billing: "success" }), "/w/acme?billing=success");
  assert.equal(appLink("acme", "inbox", { q: "a b&c" }), "/w/acme/inbox?q=a%20b%26c", "a value is encoded");
  assert.equal(
    appLink("acme", "clients/leads?search=1", { x: "2" }),
    "/w/acme/people/leads?search=1&x=2",
    "a route that already asks is added to",
  );
});

test("with no workspace known, a link is the front door with the route as a hash, which the home carries to the workspace", () => {
  assert.equal(appLink(null, "admin/notifications"), "/#/admin/notifications");
  assert.equal(
    appLink(undefined, "admin/integrations", { google: "error", why: "declined" }),
    "/?google=error&why=declined#/admin/integrations",
  );
  assert.equal(appLink("", "inbox"), "/#/inbox", "an empty slug names nothing");
  assert.equal(appLink(null), "/", "and no route is the door itself");
});

test("every link reads back as the route it was written for", () => {
  for (const route of [
    "inbox/th-" + ID,
    "broadcasts/run:" + ID,
    "conversations/cv-" + ID,
    "admin/workspace/calendar",
    "clients/leads",
    "today",
  ]) {
    assert.equal(routeOf(appLink("acme", route)), route, route);
    assert.equal(routeOf(appLink(null, route)), route, `${route}, by the front door`);
  }
});

test("a notice opens its own route, and with none the kind's list door; an unknown kind is a plain alert", () => {
  assert.equal(noticeRoute("handoff", `inbox/th-${ID}`), `inbox/th-${ID}`);
  assert.equal(noticeRoute("handoff", null), "inbox");
  assert.equal(noticeRoute("handoff", undefined), "inbox");
  assert.equal(noticeRoute("handoff", ""), "inbox", "an empty route is none");
  // A send that went or stopped opens Sequences, where its day is (Sent retired with #1644, 16 Oct 2026).
  assert.equal(noticeRoute("broadcast_sent", null), "campaigns/sequences");
  assert.equal(noticeRoute("nobody-knows-this-kind", null), "today");
  assert.equal(noticeRoute(null, null), "today");
  assert.equal(noticeRoute("constructor", null), "today", "a word on every object is not a kind");
  assert.equal(
    noticeRoute("booking_notice", null),
    "admin/workspace",
    "the kind's list door, which a group of rows opens",
  );
});

test("the bell opens the place the mail and the phone are sent to, for every kind, with a route and without one", () => {
  const row = (kind, route) => ({
    id: "11111111-1111-4111-8111-111111111111",
    kind,
    title: "A title",
    body: "A body",
    route,
    subject_type: null,
    subject_id: null,
    created_at: "2026-10-11T10:00:00.000Z",
    read: false,
    dismissed: false,
  });
  for (const kind of SERVER_NOTIFICATION_KINDS) {
    // The day's reach-out numbers open the Reach-outs whatever route their row was kept with (a row of 9 Oct says `outbound`).
    const routes = kind === "reach_out_day" ? [null] : [null, `inbox/th-${ID}`, `broadcasts/run:${ID}`];
    for (const route of routes) {
      const [bell] = serverNotificationRows({ notifications: [row(kind, route)], seen_at: null });
      assert.equal(bell.to, noticeRoute(kind, route), `${kind} ${route}`);
    }
  }
});

test("the line at the foot of a mail is contracts' words around the link", () => {
  assert.equal(openItLine("https://app.example/w/acme/inbox"), "Open it: https://app.example/w/acme/inbox");
});

test("every kind that is emailed has a door to open, so no mail can be left without a link", () => {
  assert.ok(EMAILED_NOTIFICATION_KINDS.length >= 10);
  for (const kind of EMAILED_NOTIFICATION_KINDS) assert.ok(noticeRoute(kind, null), kind);
});
