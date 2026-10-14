/**
 * Campaigns is one page, its home (canvas A, 3 Oct 2026), and its two other pages are rooms of it: what the frame says around
 * each address (src/surfaces/campaigns/routes.ts), the routes the registry hands the frame, and the old Playbooks addresses,
 * which land on the home for ever (contracts doorOf, applied where a route is written and where an address is moved on load).
 *
 *   campaigns                        the home                    crumbs: Campaigns
 *   campaigns/moment:<id>            a playbook open in a sheet  crumbs: Campaigns › <its name>
 *   campaigns/new[:to:<list>|:every|:moment:<trigger>|:edit:<id>]  the composer  crumbs: Campaigns › New message
 *   broadcasts[/run:<id>|/get-yes|/to-send]  Sent               crumbs: Campaigns › Sent [› …]
 *   broadcasts/<list>                        a door: campaigns/new:to:<list>
 *   messages (the path's templates)          the Library        crumbs: Campaigns › Library
 *   outbound[/<id>] (the path's playbooks)   a door: campaigns, campaigns/moment:<id>
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const S = "../../../../apps/dashboard/src/surfaces";
const { campaignsChrome, broadcastsChrome, broadcastsProps } = await import(`${S}/campaigns/routes.ts`);
const { parseHome, momentRoute, messageRoute, composeRoute, groupRoute } = await import(
  `${S}/campaigns/home/address.ts`
);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { SURFACE_ROUTES, routeHasPage, onOnePage } = await import(`${S}/routes.ts`);
const { workspacePath, routeOfPath, routeOfHash, movedAddress, doorOf, templateTitle } =
  await import("@chanlytics/contracts");

afterEach(() => {
  for (const k of ["playbooks", "broadcasts", "reach_outs"]) setSurfaceValue(k, undefined);
});

const HOME = { label: "Campaigns", to: "campaigns" };
const SENT = { label: "Sent", to: "broadcasts" };

/* ------------------------------------------------------ the home ------------------------------------------------------ */

test("the home's address says a moment open, or the composer, and spells back to the same words", () => {
  assert.deepEqual(parseHome(null), { group: null, moment: null, message: null, compose: null });
  assert.deepEqual(parseHome("moment:pb-1"), { group: null, moment: "pb-1", message: null, compose: null });
  // A reach-out open at who is in it (00426): the part is the address's, spelled back; any other part is its top.
  assert.deepEqual(parseHome("moment:ro-1:people"), {
    group: null,
    moment: "ro-1",
    part: "people",
    message: null,
    compose: null,
  });
  assert.deepEqual(parseHome("moment:ro-1:elsewhere"), parseHome("moment:ro-1"));
  assert.deepEqual(parseHome("new"), { group: null, moment: null, message: null, compose: { mode: "once", to: null } });
  assert.deepEqual(
    parseHome("new:to:s1"),
    { group: null, moment: null, message: null, compose: { mode: "once", to: "s1" } },
    "the audience it is for",
  );
  assert.deepEqual(parseHome("new:to:"), parseHome("new"), "no audience named is no audience");
  assert.deepEqual(parseHome("new:every"), {
    group: null,
    moment: null,
    message: null,
    compose: { mode: "every", moment: null, edit: null },
  });
  assert.deepEqual(parseHome("new:moment:quiet_30"), {
    group: null,
    moment: null,
    message: null,
    compose: { mode: "every", moment: "quiet_30", edit: null },
  });
  assert.deepEqual(parseHome("new:edit:pb-1"), {
    group: null,
    moment: null,
    message: null,
    compose: { mode: "every", moment: null, edit: "pb-1" },
  });
  // A message open in a drawer of its own, by its name (the call's text's, or the one a campaign's drawer names).
  assert.deepEqual(parseHome("message:spring_offer"), {
    group: null,
    moment: null,
    message: "spring_offer",
    compose: null,
  });
  assert.equal(messageRoute("spring_offer"), "campaigns/message:spring_offer");
  assert.equal(parseHome(messageRoute("visit_reminder").split("/")[1]).message, "visit_reminder", "and back");
  // A word the page does not know is the home: a link never lands on nothing.
  for (const odd of ["surprise", "moment:", "message:", "new:edit:", "run:b-1", ""])
    assert.deepEqual(parseHome(odd), parseHome(null), odd);
  assert.equal(momentRoute("pb-1"), "campaigns/moment:pb-1");
  // Write to leads, New message's third choice (00426), spelled as it is read.
  assert.equal(composeRoute("leads"), "campaigns/new:leads");
  assert.deepEqual(parseHome("new:leads"), { group: null, moment: null, message: null, compose: { mode: "leads" } });
  assert.equal(composeRoute("once"), "campaigns/new");
  assert.equal(composeRoute("once", { to: "s1" }), "campaigns/new:to:s1");
  assert.equal(composeRoute("once", { to: null }), "campaigns/new", "none named");
  assert.equal(
    composeRoute("once", { to: "s1" }) && parseHome(composeRoute("once", { to: "s1" }).split("/")[1]).compose.to,
    "s1",
    "and back",
  );
  assert.equal(composeRoute("every"), "campaigns/new:every");
  assert.equal(composeRoute("every", { moment: "visited" }), "campaigns/new:moment:visited");
  assert.equal(composeRoute("every", { edit: "pb-1" }), "campaigns/new:edit:pb-1", "changing one wins over a moment");
});

test("the ledger's group is the address's own: campaigns/in:<group>, word-free, spelled back as it was read", () => {
  assert.deepEqual(parseHome("in:before"), { group: "before", moment: null, message: null, compose: null });
  assert.deepEqual(parseHome("in:reach_out"), { group: "reach_out", moment: null, message: null, compose: null });
  // Word-free ids only (decision 46): a word, a hyphen, a capital or nothing is the home, never a group of nothing.
  for (const odd of ["in:", "in:Before", "in:visit-tomorrow", "in:../x", "in:1st", "in:before:x"])
    assert.deepEqual(parseHome(odd), parseHome(null), odd);
  assert.equal(groupRoute("before"), "campaigns/in:before");
  assert.equal(groupRoute(null), "campaigns", "every group is the home");
  assert.equal(parseHome(groupRoute("lists").split("/")[1]).group, "lists", "and back");
  // A sheet's address names the sheet alone: the group it stood over is kept by the page (use-home.ts useKeptGroup).
  assert.equal(momentRoute("pb-1"), "campaigns/moment:pb-1");
  assert.equal(composeRoute("every", { moment: "visited" }), "campaigns/new:moment:visited");
});

test("the home's crumbs name Campaigns, and a playbook or a reach-out by name once the surfaces hold it; every address is one mount", () => {
  const c = (param) => campaignsChrome({ param });
  assert.deepEqual(c(null), { crumbs: ["Campaigns"], mount: "campaigns", act: null });
  assert.deepEqual(c("moment:pb-1").crumbs, [HOME, "Campaign"], "before the first read no campaign is named");
  setSurfaceValue("playbooks", { rows: [{ id: "pb-1", name: "Win-back" }] });
  assert.deepEqual(c("moment:pb-1").crumbs, [HOME, "Win-back"]);
  assert.deepEqual(c("moment:pb-9").crumbs, [HOME, "Campaign"], "a link to one the surface does not hold names none");
  setSurfaceValue("reach_outs", [{ root_id: "ch-1", name: "Cold email to studios" }]);
  assert.deepEqual(c("moment:ch-1").crumbs, [HOME, "Cold email to studios"]);
  assert.deepEqual(c("new").crumbs, [HOME, "New message"]);
  assert.deepEqual(c("new:moment:visited").crumbs, [HOME, "New message"]);
  assert.deepEqual(c("new:edit:pb-1").crumbs, [HOME, "Win-back"], "changing a playbook is named for it");
  assert.deepEqual(c("new:edit:ch-1").crumbs, [HOME, "Cold email to studios"], "and a reach-out for its own name");
  assert.deepEqual(c("new:to:s1").crumbs, [HOME, "New message"], "the composer on a list is the composer");
  assert.deepEqual(
    c("message:spring_offer").crumbs,
    [HOME, templateTitle("spring_offer", null)],
    "a message by its title",
  );
  for (const p of [null, "moment:pb-1", "new", "new:every", "surprise"])
    assert.equal(c(p).mount, "campaigns", String(p));
  assert.equal(c(null).act, null, "a real workspace's New message is the page's own; the top bar has none");
});

/* ---------------------------------------------------- the rooms ---------------------------------------------------- */

test("Sent: the crumbs go back to Campaigns, name a run, the get-yes section, or an audience the surface offers; every address is one mount", () => {
  const b = (param) => broadcastsChrome({ param });
  assert.deepEqual(b(null), { mount: "broadcasts", crumbs: [HOME, "Sent"] });
  assert.deepEqual(b("run:b-1").crumbs, [HOME, SENT, "Broadcast"], "a run nothing holds yet");
  assert.deepEqual(b("get-yes").crumbs, [HOME, SENT, "Get their yes"]);
  assert.deepEqual(b("to-send").crumbs, [HOME, SENT, "To send"]);
  assert.deepEqual(b("s1").crumbs, [HOME, "Sent"], "an audience nothing holds yet");
  setSurfaceValue("broadcasts", {
    rows: [{ id: "b-1", name: "Win-back · Sep 10" }],
    audiences: [
      { kind: "everyone", id: null, label: "Everyone" },
      { kind: "saved", id: "s1", label: "Regulars" },
      { kind: "list", id: "new_week", label: "New this week" },
      { kind: "playbook", id: "pb-1", label: "Win-back" },
    ],
  });
  assert.deepEqual(b("run:b-1").crumbs, [HOME, SENT, "Win-back · Sep 10"]);
  assert.deepEqual(b("run:b-9").crumbs, [HOME, SENT, "Broadcast"]);
  assert.deepEqual(b("s1").crumbs, [HOME, SENT, "Regulars"]);
  assert.deepEqual(b("new_week").crumbs, [HOME, SENT, "New this week"]);
  assert.deepEqual(
    b("pb-1").crumbs,
    [HOME, "Sent"],
    "only a list or a kept list is an audience the composer opens on, never a playbook's",
  );
  assert.deepEqual(b("nobody").crumbs, [HOME, "Sent"]);
  assert.equal(b("run:b-1").mount, "broadcasts");
});

test("Broadcasts is handed a run, the get-yes section, or the audience a word names -- a run's id was once read as a list's (C9)", () => {
  const none = { initialSegment: null, initialRun: null, initialYes: false, initialToSend: false };
  assert.deepEqual(broadcastsProps("run:b-1"), { ...none, initialRun: "b-1" });
  assert.deepEqual(broadcastsProps("get-yes"), { ...none, initialYes: true });
  assert.deepEqual(broadcastsProps("to-send"), { ...none, initialToSend: true }, "the one To send is no audience");
  assert.deepEqual(broadcastsProps("s1"), { ...none, initialSegment: "s1" });
  assert.deepEqual(broadcastsProps(null), none);
});

test("the Library's crumbs go back to Campaigns, and no room has a strip of tabs", () => {
  assert.deepEqual(SURFACE_ROUTES.messages.crumbs, [HOME, "Library"]);
  assert.deepEqual(SURFACE_ROUTES.broadcasts.crumbs, [HOME, "Sent"]);
  assert.equal(
    SURFACE_ROUTES.messages.activeNav,
    "messages",
    "the sidebar lights Campaigns for each (sidebar.jsx groupMap)",
  );
});

/* ------------------------------------------------ what the frame draws ------------------------------------------------ */

test("the frame takes every address of the home, and of the rooms: a moment, the composer, a run, an audience", () => {
  for (const route of [
    "campaigns",
    "campaigns/moment:pb-1",
    "campaigns/new",
    "campaigns/new:every",
    "campaigns/new:moment:quiet_30",
    "campaigns/new:to:s1",
    "campaigns/new:edit:ch-1",
    "broadcasts",
    "broadcasts/run:b-1",
    "broadcasts/get-yes",
    "broadcasts/s1",
    "messages",
    "outbound",
    "outbound/pb-1",
  ])
    assert.ok(routeHasPage(route), route);
  assert.ok(!routeHasPage("messages/x"), "the Library draws no address under it, as Reports draws none");
  assert.equal(SURFACE_ROUTES.campaigns.activeNav, "campaigns");
  assert.equal(SURFACE_ROUTES.campaigns.pane, false, "the home is a page that scrolls, not the Inbox's two panes");
  assert.equal(SURFACE_ROUTES.campaigns.mount, "campaigns", "a moment opened over the home is no new page");
  // The rooms are the Inbox's two panes (campaigns/parts/split.tsx): the list, and what is open beside it, each scrolling itself.
  assert.equal(SURFACE_ROUTES.broadcasts.pane, true);
  assert.equal(SURFACE_ROUTES.messages.pane, true);
  assert.equal(
    SURFACE_ROUTES.outbound.activeNav,
    "campaigns",
    "the old list is a door, drawn under Campaigns while it moves",
  );
});

test("a move between two addresses of the home is the page's own: opening a moment is no request for a page", () => {
  assert.ok(onOnePage("campaigns", "campaigns/moment:pb-1"));
  assert.ok(onOnePage("campaigns/moment:pb-1", "campaigns/new"));
  assert.ok(onOnePage("campaigns/new", "campaigns"));
  assert.ok(onOnePage("campaigns/moment:pb-1", "campaigns/new:edit:pb-1"), "a change opened over its detail");
  assert.ok(onOnePage("campaigns/new:to:s1", "campaigns"));
  assert.ok(!onOnePage("campaigns", "broadcasts"), "a room is its own page");
  assert.ok(!onOnePage("broadcasts/run:b-1", "campaigns"));
});

/* ------------------------------------------------ the old addresses ------------------------------------------------- */

test("the old Playbooks addresses land on the home: outbound on campaigns, outbound/<id> on campaigns/moment:<id>", () => {
  assert.equal(doorOf("outbound"), "campaigns");
  assert.equal(doorOf("outbound/pb-1"), "campaigns/moment:pb-1");
  assert.equal(
    doorOf("outbound/pb-1/x"),
    "campaigns/moment:pb-1",
    "the route's second word, as the shell reads its param",
  );
  for (const kept of [
    "campaigns",
    "campaigns/moment:pb-1",
    "broadcasts",
    "broadcasts/run:b-1",
    "messages",
    "clients/c-1",
    "today",
  ]) {
    assert.equal(doorOf(kept), null, `${kept} is where it always was`);
  }
  // Written: every link the app makes lands in one move.
  assert.equal(workspacePath("acme", "outbound"), "/w/acme/campaigns");
  assert.equal(workspacePath("acme", "outbound/pb-1"), "/w/acme/campaigns/moment:pb-1");
  assert.equal(workspacePath("acme", "campaigns/new"), "/w/acme/campaigns/new");
  assert.equal(workspacePath("acme", "broadcasts/run:b-1"), "/w/acme/broadcasts/run:b-1");
  assert.equal(
    workspacePath("acme", "messages"),
    "/w/acme/templates",
    "the Library keeps the product's word in its path",
  );
});

test("broadcasts/<audience>, which People and a list write to message these people, is a door to the home's composer on that audience; a run, Get their yes and Sent itself stay", () => {
  assert.equal(doorOf("broadcasts/s1"), "campaigns/new:to:s1");
  assert.equal(doorOf("broadcasts/new_week"), "campaigns/new:to:new_week");
  assert.equal(
    doorOf("broadcasts/s1/x"),
    "campaigns/new:to:s1",
    "the route's second word, as the shell reads its param",
  );
  for (const kept of [
    "broadcasts",
    "broadcasts/run:b-1",
    "broadcasts/run:b-1/x",
    "broadcasts/get-yes",
    "broadcasts/to-send",
    "broadcast",
    "campaigns/new:to:s1",
  ])
    assert.equal(doorOf(kept), null, `${kept} is where it is`);
  // Written: People's "Message these people" lands in one move.
  assert.equal(workspacePath("acme", "broadcasts/s1"), "/w/acme/campaigns/new:to:s1");
  assert.equal(workspacePath("acme", "broadcasts/run:b-1"), "/w/acme/broadcasts/run:b-1");
  assert.equal(workspacePath("acme", "broadcasts"), "/w/acme/broadcasts");
  // And an old link, a bookmark or a bell row that says it moves as the frame loads.
  const moved = (address) => movedAddress({ search: "", hash: "", ...address });
  assert.equal(moved({ pathname: "/w/acme", hash: "#/broadcasts/s1" }), "/w/acme/campaigns/new:to:s1");
  assert.equal(moved({ pathname: "/w/acme/broadcasts/s1" }), "/w/acme/campaigns/new:to:s1");
  assert.equal(
    moved({ pathname: "/w/acme/broadcasts/s1", search: "?from=people" }),
    "/w/acme/campaigns/new:to:s1?from=people",
  );
  assert.equal(moved({ pathname: "/w/acme", hash: "#/broadcasts/get-yes" }), "/w/acme/broadcasts/get-yes");
  assert.equal(moved({ pathname: "/w/acme/broadcasts" }), null);
  // The address it lands on reads back as the composer on that audience.
  assert.equal(routeOfPath("/w/acme/campaigns/new:to:s1"), "campaigns/new:to:s1");
  assert.deepEqual(parseHome("new:to:s1").compose, { mode: "once", to: "s1" });
});

test("a bookmark, a bell row or an email link that says the old route moves to the new address as the frame loads", () => {
  const moved = (address) => movedAddress({ search: "", hash: "", ...address });
  // The hash, as emails, the phone app's links and every bell row's `route` write it.
  assert.equal(moved({ pathname: "/w/acme", hash: "#/outbound" }), "/w/acme/campaigns");
  assert.equal(moved({ pathname: "/w/acme", hash: "#/outbound/pb-1" }), "/w/acme/campaigns/moment:pb-1");
  assert.equal(
    moved({ pathname: "/w/acme", hash: "#/outbound/pb-1", search: "?from=email" }),
    "/w/acme/campaigns/moment:pb-1?from=email",
  );
  // The path: the shell's own name, and the product's word the page had for a day (`playbooks`).
  assert.equal(moved({ pathname: "/w/acme/outbound/pb-1" }), "/w/acme/campaigns/moment:pb-1");
  assert.equal(moved({ pathname: "/w/acme/playbooks" }), "/w/acme/campaigns");
  assert.equal(moved({ pathname: "/w/acme/playbooks/pb-1", hash: "#x" }), "/w/acme/campaigns/moment:pb-1#x");
  // The rooms and the home are where they are; the Library's old name still moves to its word.
  assert.equal(moved({ pathname: "/w/acme/campaigns/moment:pb-1" }), null);
  assert.equal(moved({ pathname: "/w/acme", hash: "#/broadcasts/run:b-1" }), "/w/acme/broadcasts/run:b-1");
  assert.equal(moved({ pathname: "/w/acme", hash: "#/messages" }), "/w/acme/templates");
  assert.equal(routeOfPath("/w/acme/campaigns/moment:pb-1"), "campaigns/moment:pb-1");
  assert.equal(routeOfHash("#/campaigns"), "campaigns");
});
