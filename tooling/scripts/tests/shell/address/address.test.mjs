/**
 * The address of a page in the operator UI (contracts shell/address.ts, decision 0015, "The address first"): a route is
 * the path after the slug, `/w/acme/inbox/th-1`, and the hash spelling every email, phone link and bookmark says,
 * `/w/acme#/inbox/th-1`, is moved to it when the frame loads, and keeps working for ever.
 *
 * This is the hash-to-path mapping, run. The move itself, in a browser (a hash address lands on its path, a reload of a
 * path boots the frame), is e2e/shell/address.spec.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { movedAddress, routeOfAddress, routeOfHash, routeOfPath, workspacePath } from "@chanlytics/contracts";

/** The path's word for a route the shell names otherwise (docs/glossary.md), written here on its own, not read from contracts. */
const WORDS = { clients: "people", segments: "lists", outbound: "playbooks", messages: "templates" };
const inPath = (route) => {
  const head = route.split("/")[0];
  return Object.hasOwn(WORDS, head) ? WORDS[head] + route.slice(head.length) : route;
};

/** Every kind of route the shell draws (legacy/CLAUDE.md, "Routes"), each as it is written after the slug. */
const ROUTES = [
  "today",
  "inbox",
  "inbox/th-4f2",
  "clients",
  "clients/5f0c9a3e-1c2d-4e3f-8a4b-5c6d7e8f9a0b",
  "clients/seg:needs_you",
  "clients/list:s1",
  "clients/leads",
  "clients/leads:s-5e000000-0000-4000-8000-000000000001:c-review:p-1a2b3c4d-0000-4000-8000-000000000001",
  "clients/pipeline:v-board",
  "segments/s1",
  "calendar",
  "calendar/a-9",
  "calendar/2026-09-30",
  "reports",
  "conversations/phone:cv-k7",
  "live/c-live",
  "broadcasts/run:b-1",
  "outbound",
  "messages",
  "start",
  "start/phone",
  "soon/calendar",
  "admin/billing",
  "admin/integrations",
];

test("a hash address moves to its path: the route becomes what follows the slug", () => {
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#/inbox" }), "/w/acme/inbox");
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#/inbox/th-4f2" }), "/w/acme/inbox/th-4f2");
  assert.equal(movedAddress({ pathname: "/w/acme", search: "", hash: "#/today" }), "/w/acme/today");
  for (const route of ROUTES) {
    const to = movedAddress({ pathname: "/w/acme", hash: `#/${route}` });
    assert.equal(to, `/w/acme/${inPath(route)}`, route);
    // And the page it lands on reads the same route back, from the path alone.
    assert.equal(routeOfPath(to), route, `${route}, read back`);
    assert.equal(routeOfAddress({ pathname: to, hash: "" }), route, `${route}, read as an address`);
  }
});

test("the query stays, after the route, and a query the hash carries joins it", () => {
  assert.equal(
    movedAddress({ pathname: "/w/acme", search: "?billing=success", hash: "#/admin/billing" }),
    "/w/acme/admin/billing?billing=success",
    "a return from Stripe",
  );
  assert.equal(
    movedAddress({ pathname: "/w/acme", search: "", hash: "#/settings?tab=team" }),
    "/w/acme/settings?tab=team",
    "a query written inside the hash",
  );
  assert.equal(
    movedAddress({ pathname: "/w/acme", search: "?a=1", hash: "#/settings?tab=team" }),
    "/w/acme/settings?a=1&tab=team",
    "both",
  );
});

test("the slug is kept as it was written, and a slash after a route is dropped", () => {
  assert.equal(movedAddress({ pathname: "/w/a%20b", hash: "#/inbox" }), "/w/a%20b/inbox");
  assert.equal(
    movedAddress({ pathname: "/w/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", hash: "#/inbox" }),
    "/w/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/inbox",
    "a workspace named by its id: the server takes either",
  );
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#/inbox/" }), "/w/acme/inbox", "no trailing slash");
});

test("nothing moves when nothing is a hash route, or the path already says one", () => {
  // A path that names a route wins: the hash left in a pasted address is somebody else's.
  assert.equal(movedAddress({ pathname: "/w/acme/inbox", hash: "#/clients" }), null);
  assert.equal(movedAddress({ pathname: "/w/acme/inbox", hash: "" }), null);
  // Today is what the workspace's own page draws: `#/` names no route.
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#/" }), null);
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "" }), null);
  assert.equal(movedAddress({ pathname: "/w/acme" }), null);
  // A fragment that is not a route (a refused sign-in's, an anchor) is left for whoever owns it.
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#error=server_error&error_code=x" }), null);
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#access_token=abc" }), null);
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#inbox" }), null, "no slash: not a route");
  // Off a workspace page there is no slug to put a route under: the home and the sign-in read a hash themselves.
  for (const pathname of ["/", "/login", "/w", "/w/", "/yes/acme", "/api/v1/workspaces"])
    assert.equal(movedAddress({ pathname, hash: "#/inbox" }), null, pathname);
});

test("a route is read from the path, else the hash, else it is Today", () => {
  assert.equal(routeOfAddress({ pathname: "/w/acme/inbox/th-1", hash: "" }), "inbox/th-1");
  assert.equal(
    routeOfAddress({ pathname: "/w/acme/inbox/th-1/", hash: "" }),
    "inbox/th-1",
    "a trailing slash is not a segment",
  );
  assert.equal(routeOfAddress({ pathname: "/w/acme", hash: "#/reports" }), "reports", "an address not moved yet");
  assert.equal(routeOfAddress({ pathname: "/w/acme/inbox", hash: "#/reports" }), "inbox", "the path wins");
  assert.equal(routeOfAddress({ pathname: "/w/acme" }), "today");
  assert.equal(routeOfAddress({ pathname: "/w/acme", hash: "#error=x" }), "today", "a refusal is not a page");
  assert.equal(routeOfAddress({}), "today");
  assert.equal(routeOfAddress({ pathname: null, hash: null }), "today");
  // The standalone mockup has no workspace path, and its route is the hash's.
  assert.equal(routeOfAddress({ pathname: "/", hash: "#/clients/leads" }), "clients/leads");
  assert.equal(routeOfAddress({ pathname: "/Chanlytics.html", hash: "#/inbox" }), "inbox");
});

test("routeOfPath names a workspace's route and nothing else's; routeOfHash takes only what begins #/", () => {
  assert.equal(routeOfPath("/w/acme"), "");
  assert.equal(routeOfPath("/w/acme/"), "");
  assert.equal(routeOfPath("/w/acme/admin/billing"), "admin/billing");
  for (const off of ["/", "/login", "/w", "/w/", "/yes/acme/inbox", "", null, undefined])
    assert.equal(routeOfPath(off), null, String(off));
  assert.equal(routeOfHash("#/inbox"), "inbox");
  assert.equal(routeOfHash("#/"), "");
  for (const off of ["", "#", "#inbox", "#error=x", null, undefined]) assert.equal(routeOfHash(off), null, String(off));
});

test("a route's path is the workspace's, the slug encoded, and Today has none", () => {
  assert.equal(workspacePath("acme", "inbox/th-1"), "/w/acme/inbox/th-1");
  assert.equal(workspacePath("a b", "inbox"), "/w/a%20b/inbox");
  assert.equal(workspacePath("acme"), "/w/acme");
  assert.equal(workspacePath("acme", ""), "/w/acme");
});

test("the path says the product's word: people and lists, where the shell's route says clients and segments", () => {
  assert.equal(workspacePath("acme", "clients"), "/w/acme/people");
  assert.equal(
    workspacePath("acme", "clients/5f0c9a3e-1c2d-4e3f-8a4b-5c6d7e8f9a0b"),
    "/w/acme/people/5f0c9a3e-1c2d-4e3f-8a4b-5c6d7e8f9a0b",
  );
  assert.equal(workspacePath("acme", "clients/leads:s-1"), "/w/acme/people/leads:s-1");
  assert.equal(workspacePath("acme", "segments/s1"), "/w/acme/lists/s1");
  // Only the head of the route is a word: a route that merely contains one is untouched.
  assert.equal(workspacePath("acme", "inbox/clients"), "/w/acme/inbox/clients");
  assert.equal(workspacePath("acme", "clientsx"), "/w/acme/clientsx");
  assert.equal(
    workspacePath("acme", "constructor"),
    "/w/acme/constructor",
    "a name off Object.prototype is not a word",
  );
  // Read back: the path's word is the shell's route, and so is the old name.
  assert.equal(routeOfPath("/w/acme/people"), "clients");
  assert.equal(routeOfPath("/w/acme/people/c-1"), "clients/c-1");
  assert.equal(routeOfPath("/w/acme/people/pipeline:v-board"), "clients/pipeline:v-board");
  assert.equal(routeOfPath("/w/acme/lists/s1"), "segments/s1");
  assert.equal(routeOfPath("/w/acme/clients/c-1"), "clients/c-1", "the old name still reads");
  assert.equal(routeOfPath("/w/acme/peopleish"), "peopleish");
  assert.equal(routeOfHash("#/people/c-1"), "clients/c-1");
  assert.equal(routeOfAddress({ pathname: "/w/acme/people/leads", hash: "" }), "clients/leads");
  assert.equal(
    routeOfAddress({ pathname: "/", hash: "#/clients/leads" }),
    "clients/leads",
    "the mockup keeps its hash",
  );
});

test("the old name in an address moves to the word, for ever: a path, and a hash", () => {
  assert.equal(movedAddress({ pathname: "/w/acme/clients", hash: "" }), "/w/acme/people");
  assert.equal(movedAddress({ pathname: "/w/acme/clients/c-1/", hash: "" }), "/w/acme/people/c-1");
  assert.equal(
    movedAddress({ pathname: "/w/acme/clients/leads:s-1", search: "?a=1", hash: "" }),
    "/w/acme/people/leads:s-1?a=1",
    "the query stays",
  );
  assert.equal(
    movedAddress({ pathname: "/w/acme/segments/s1", hash: "#x" }),
    "/w/acme/lists/s1#x",
    "the hash stays too",
  );
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#/clients/c-1" }), "/w/acme/people/c-1");
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#/clients?tab=1" }), "/w/acme/people?tab=1");
  assert.equal(
    movedAddress({ pathname: "/w/acme", hash: "#/people/c-1" }),
    "/w/acme/people/c-1",
    "a hash that already says the word",
  );
  // The word itself is where it should be: nothing moves.
  assert.equal(movedAddress({ pathname: "/w/acme/people/c-1", hash: "" }), null);
  assert.equal(movedAddress({ pathname: "/w/acme/lists", hash: "" }), null);
  assert.equal(movedAddress({ pathname: "/w/acme/inbox", hash: "" }), null);
  assert.equal(
    movedAddress({ pathname: "/w/acme/clientsx", hash: "" }),
    null,
    "a route that only begins with the name",
  );
  assert.equal(movedAddress({ pathname: "/login/clients", hash: "" }), null, "off a workspace page");
});

test("Campaigns take the product's words: playbooks and templates, where the shell's route says outbound and messages", () => {
  assert.equal(workspacePath("acme", "outbound"), "/w/acme/playbooks");
  assert.equal(workspacePath("acme", "outbound/pb-1"), "/w/acme/playbooks/pb-1");
  assert.equal(workspacePath("acme", "messages"), "/w/acme/templates");
  assert.equal(workspacePath("acme", "broadcasts/run:b-1"), "/w/acme/broadcasts/run:b-1", "Broadcasts keep their word");
  assert.equal(routeOfPath("/w/acme/playbooks"), "outbound");
  assert.equal(routeOfPath("/w/acme/playbooks/pb-1"), "outbound/pb-1");
  assert.equal(routeOfPath("/w/acme/templates"), "messages");
  assert.equal(routeOfPath("/w/acme/outbound/pb-1"), "outbound/pb-1", "the old name still reads");
  assert.equal(routeOfHash("#/playbooks"), "outbound");
  // The old name, in a path or a hash, moves to the word for ever.
  assert.equal(movedAddress({ pathname: "/w/acme/outbound/pb-1", hash: "" }), "/w/acme/playbooks/pb-1");
  assert.equal(movedAddress({ pathname: "/w/acme/messages", search: "?a=1", hash: "" }), "/w/acme/templates?a=1");
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#/outbound" }), "/w/acme/playbooks");
  assert.equal(movedAddress({ pathname: "/w/acme", hash: "#/messages" }), "/w/acme/templates");
  assert.equal(movedAddress({ pathname: "/w/acme/playbooks", hash: "" }), null, "the word is where it should be");
  assert.equal(movedAddress({ pathname: "/w/acme/broadcasts", hash: "" }), null);
});
