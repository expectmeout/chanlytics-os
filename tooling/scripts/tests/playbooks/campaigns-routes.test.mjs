/**
 * Campaigns is Sequences (decision 0060; the home that stood here went in S6), with Messages beside it and Sent's sheets
 * under it: what the frame says around each address (src/surfaces/campaigns/routes.ts), the routes the registry hands the
 * frame, and the old addresses, which land where they always did (contracts doorOf, applied where a route is written and
 * where an address is moved on load) and from there on Sequences (contracts sequenceLandingOf, which the page applies).
 *
 *   campaigns[/sequences]            Sequences, Campaigns' first view   crumbs: Campaigns
 *   campaigns/sequences/<id>         a sequence open beside it     crumbs: Campaigns › <its name>
 *   campaigns/new[:to:<list>|:every|:leads|:moment:<trigger>|:edit:<id>]  a composer over it   crumbs: Campaigns
 *   campaigns/message:<name>         a message's drawer over it    crumbs: Campaigns
 *   campaigns/moment:<id>, campaigns/in:<group>  the home's, landing on the sequence, or on Sequences
 *   broadcasts[/run:<id>|/get-yes|/to-send]  Sent's sheets         crumbs: Campaigns [› …]; Sent's list lands on Sequences
 *   broadcasts/<list>                        a door: campaigns/new:to:<list>
 *   messages (the path's templates)          Messages              crumbs: Campaigns › Messages
 *   outbound[/<id>] (the path's playbooks)   a door: campaigns, campaigns/moment:<id>
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const S = "../../../../apps/dashboard/src/surfaces";
const { campaignsChrome, broadcastsChrome, broadcastsProps } = await import(`${S}/campaigns/routes.ts`);
const { parseHome, composeRoute } = await import(`${S}/campaigns/home/address.ts`);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { SURFACE_ROUTES, routeHasPage, onOnePage } = await import(`${S}/routes.ts`);
const { workspacePath, routeOfPath, routeOfHash, movedAddress, doorOf, sequenceLandingOf } =
  await import("@chanlytics/contracts");

afterEach(() => {
  for (const k of ["playbooks", "broadcasts", "reach_outs", "sequences"]) setSurfaceValue(k, undefined);
  delete globalThis.window;
});

const HOME = { label: "Campaigns", to: "campaigns/sequences" };

/* ------------------------------------------------- Campaigns' addresses ------------------------------------------------- */

test("Campaigns' sheets' addresses say the composer or a message, and spell back to the same words; the home's are still read", () => {
  assert.deepEqual(parseHome(null), { group: null, moment: null, message: null, compose: null });
  // The home's addresses, read so a link kept from before says what it named as it lands on Sequences (sequenceLandingOf).
  assert.deepEqual(parseHome("moment:pb-1"), { group: null, moment: "pb-1", message: null, compose: null });
  assert.deepEqual(parseHome("moment:ro-1:people"), {
    group: null,
    moment: "ro-1",
    part: "people",
    message: null,
    compose: null,
  });
  assert.deepEqual(parseHome("moment:ro-1:elsewhere"), parseHome("moment:ro-1"));
  assert.deepEqual(parseHome("in:before"), { group: "before", moment: null, message: null, compose: null });
  // Word-free ids only (decision 46): a word, a hyphen, a capital or nothing is no group.
  for (const odd of ["in:", "in:Before", "in:visit-tomorrow", "in:../x", "in:1st", "in:before:x"])
    assert.deepEqual(parseHome(odd), parseHome(null), odd);
  // The composer, on each of its modes.
  assert.deepEqual(parseHome("new"), { group: null, moment: null, message: null, compose: { mode: "once", to: null } });
  assert.deepEqual(
    parseHome("new:to:s1"),
    { group: null, moment: null, message: null, compose: { mode: "once", to: "s1" } },
    "the audience it is for",
  );
  assert.deepEqual(parseHome("new:to:"), parseHome("new"), "no audience named is no audience");
  // Its Every time went (the closed-loop audit of 17 Oct 2026, G): its addresses open no sheet, and land on New sequence, on
  // a moment, or on the sequence being changed before the page is drawn (the next test).
  for (const went of ["new:every", "new:moment:quiet_30", "new:edit:pb-1"])
    assert.deepEqual(parseHome(went), parseHome(null), went);
  // A message open in a drawer of its own, by its name (the call's text's, or the one a step's editor names).
  assert.deepEqual(parseHome("message:spring_offer"), {
    group: null,
    moment: null,
    message: "spring_offer",
    compose: null,
  });
  // A word the page does not know names nothing: a link never lands on nothing, and lands on Sequences.
  for (const odd of ["surprise", "moment:", "message:", "new:edit:", "run:b-1", ""])
    assert.deepEqual(parseHome(odd), parseHome(null), odd);
  // Write to leads, New message's other choice (00426), spelled as it is read.
  assert.equal(composeRoute("leads"), "campaigns/new:leads");
  assert.deepEqual(parseHome("new:leads"), { group: null, moment: null, message: null, compose: { mode: "leads" } });
  assert.equal(composeRoute("once"), "campaigns/new");
  assert.equal(composeRoute("once", { to: "s1" }), "campaigns/new:to:s1");
  assert.equal(composeRoute("once", { to: null }), "campaigns/new", "none named");
  assert.equal(parseHome(composeRoute("once", { to: "s1" }).split("/")[1]).compose.to, "s1", "and back");
});

test("the home's addresses, and Sent's list, land on Sequences: a campaign's on its sequence, a run's on its day of History", () => {
  assert.equal(sequenceLandingOf("campaigns"), "campaigns/sequences");
  assert.equal(sequenceLandingOf("campaigns/in:before"), "campaigns/sequences", "a group of the ledger that went");
  assert.equal(sequenceLandingOf("campaigns/moment:pb-1"), "campaigns/sequences/pb-1");
  assert.equal(sequenceLandingOf("campaigns/moment:ro-1:people"), "campaigns/sequences/ro-1/people");
  assert.equal(sequenceLandingOf("broadcasts"), "campaigns/sequences");
  assert.equal(sequenceLandingOf("broadcasts/run:b-1"), "campaigns/sequences/b-1/history/b-1");
  // The composer's Every time: New, New on its moment, and the sequence being changed.
  assert.equal(sequenceLandingOf("campaigns/new:every"), "campaigns/sequences/new");
  assert.equal(sequenceLandingOf("campaigns/new:moment:quiet_30"), "campaigns/sequences/new:moment:quiet_30");
  assert.equal(sequenceLandingOf("campaigns/new:edit:pb-1"), "campaigns/sequences/pb-1");
  // Where a sheet stands, and Sequences' own addresses, nothing moves.
  for (const kept of [
    "campaigns/sequences",
    "campaigns/sequences/pb-1",
    "campaigns/new",
    "campaigns/new:to:s1",
    "campaigns/message:spring_offer",
    "broadcasts/run:b-1/sheet",
    "broadcasts/get-yes",
    "broadcasts/to-send",
    "messages",
  ])
    assert.equal(sequenceLandingOf(kept), null, kept);
});

test("Campaigns' crumbs are its first view's at every address but Ads, a sheet over it among them -- Campaigns alone, as People's and Reports' are -- and every address is one mount", () => {
  const c = (param) => campaignsChrome({ param });
  for (const p of [
    null,
    "sequences",
    "moment:pb-1",
    "new",
    "new:every",
    "new:edit:pb-1",
    "new:to:s1",
    "message:x",
    "odd",
  ]) {
    const at = c(p);
    assert.deepEqual(at.crumbs, ["Campaigns"], String(p));
    assert.equal(at.mount, "campaigns", String(p));
    assert.equal(at.views?.picked, "sequences", String(p));
    assert.equal(at.pane, true, `${p}: a list and a record beside it, each scrolling itself`);
    assert.equal(at.act, null, "a real workspace's New is the page's own; the top bar has none");
  }
  // A sequence open is named once the list holds it, and a new one says so.
  globalThis.window = { location: { pathname: "/w/acme/campaigns/sequences/q-1" } };
  assert.deepEqual(c("sequences").crumbs, ["Campaigns"], "before the list is read no sequence is named");
  setSurfaceValue("sequences", { sequences: [{ id: "q-1", name: "Win-back" }] });
  assert.deepEqual(c("sequences").crumbs, [HOME, "Win-back"]);
  globalThis.window = { location: { pathname: "/w/acme/campaigns/sequences/new" } };
  assert.deepEqual(c("sequences").crumbs, [HOME, "New sequence"]);
  // The strip: Sequences and Messages, and Ads only where it is drawn.
  assert.deepEqual(
    c(null).views.tabs.map((t) => [t.id, t.label, t.to]),
    [
      ["sequences", "Sequences", "campaigns/sequences"],
      ["messages", "Messages", "messages"],
    ],
  );
});

/* ---------------------------------------------------- the rooms ---------------------------------------------------- */

test("Sent's sheets: the crumbs go back to Campaigns, name a run, Get their yes, or an audience the surface offers; every address is one mount", () => {
  const b = (param) => broadcastsChrome({ param });
  assert.deepEqual(b(null).crumbs, ["Campaigns"]);
  // Beside Sequences' list: Campaigns' strip, on Sequences, and the page its panes.
  assert.equal(b("get-yes").views.picked, "sequences");
  assert.equal(b("run:b-1").pane, true);
  assert.deepEqual(b("run:b-1").crumbs, [HOME, "Broadcast"], "a run nothing holds yet");
  assert.deepEqual(b("get-yes").crumbs, [HOME, "Get their yes"]);
  assert.deepEqual(b("to-send").crumbs, [HOME, "To send"]);
  assert.deepEqual(b("s1").crumbs, ["Campaigns"], "an audience nothing holds yet");
  setSurfaceValue("broadcasts", {
    rows: [{ id: "b-1", name: "Win-back · Sep 10" }],
    audiences: [
      { kind: "everyone", id: null, label: "Everyone" },
      { kind: "saved", id: "s1", label: "Regulars" },
      { kind: "list", id: "new_week", label: "New this week" },
      { kind: "playbook", id: "pb-1", label: "Win-back" },
    ],
  });
  assert.deepEqual(b("run:b-1").crumbs, [HOME, "Win-back · Sep 10"]);
  assert.deepEqual(b("run:b-9").crumbs, [HOME, "Broadcast"]);
  assert.deepEqual(b("s1").crumbs, [HOME, "Regulars"]);
  assert.deepEqual(b("new_week").crumbs, [HOME, "New this week"]);
  assert.deepEqual(
    b("pb-1").crumbs,
    ["Campaigns"],
    "only a list or a kept list is an audience the composer opens on, never a playbook's",
  );
  assert.deepEqual(b("nobody").crumbs, ["Campaigns"]);
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

test("Messages' crumbs go back to Campaigns, whose first view is Sequences, and the routes' own crumbs say the same", () => {
  assert.deepEqual(SURFACE_ROUTES.messages.crumbs, [HOME, "Messages"]);
  assert.deepEqual(SURFACE_ROUTES.broadcasts.crumbs, ["Campaigns"]);
  assert.deepEqual(SURFACE_ROUTES.campaigns.crumbs, ["Campaigns"]);
  assert.equal(
    SURFACE_ROUTES.messages.activeNav,
    "messages",
    "the sidebar lights Campaigns for each (sidebar.jsx groupMap)",
  );
});

/* ------------------------------------------------ what the frame draws ------------------------------------------------ */

test("the frame takes every address of Campaigns, and of its rooms: a sequence, the composer, a message, a run, an audience", () => {
  for (const route of [
    "campaigns",
    "campaigns/sequences",
    "campaigns/sequences/q-1",
    "campaigns/sequences/q-1/history/b-1",
    "campaigns/sequences/new",
    "campaigns/moment:pb-1",
    "campaigns/new",
    "campaigns/new:every",
    "campaigns/new:leads",
    "campaigns/new:moment:quiet_30",
    "campaigns/new:to:s1",
    "campaigns/new:edit:ch-1",
    "campaigns/message:spring_offer",
    "broadcasts",
    "broadcasts/run:b-1",
    "broadcasts/run:b-1/sheet",
    "broadcasts/get-yes",
    "broadcasts/s1",
    "messages",
    "outbound",
    "outbound/pb-1",
  ])
    assert.ok(routeHasPage(route), route);
  assert.ok(!routeHasPage("messages/x"), "Messages draws no address under it, as Reports draws none");
  assert.equal(SURFACE_ROUTES.campaigns.activeNav, "campaigns");
  assert.equal(
    SURFACE_ROUTES.campaigns.pane,
    true,
    "Sequences is the Inbox's two panes: the list, and a sequence beside it",
  );
  assert.equal(SURFACE_ROUTES.campaigns.mount, "campaigns", "a sequence or a sheet opened over it is no new page");
  // The rooms are the Inbox's two panes (campaigns/parts/split.tsx): the list, and what is open beside it, each scrolling itself.
  assert.equal(SURFACE_ROUTES.broadcasts.pane, true);
  assert.equal(SURFACE_ROUTES.messages.pane, true);
  assert.equal(
    SURFACE_ROUTES.outbound.activeNav,
    "campaigns",
    "the old list is a door, drawn under Campaigns while it moves",
  );
});

test("a move between two addresses of Campaigns is the page's own: opening a sequence or a sheet is no request for a page", () => {
  assert.ok(onOnePage("campaigns", "campaigns/sequences/q-1"));
  assert.ok(onOnePage("campaigns/sequences/q-1", "campaigns/new"));
  assert.ok(onOnePage("campaigns/new", "campaigns/sequences"));
  assert.ok(
    onOnePage("campaigns/sequences/q-1", "campaigns/message:spring_offer"),
    "a step's message over its sequence",
  );
  assert.ok(onOnePage("campaigns/new:to:s1", "campaigns"));
  assert.ok(!onOnePage("campaigns", "broadcasts/get-yes"), "a room is its own page");
  assert.ok(!onOnePage("broadcasts/run:b-1", "campaigns"));
});

/* ------------------------------------------------ the old addresses ------------------------------------------------- */

test("the old Playbooks addresses land on Campaigns: outbound on campaigns, outbound/<id> on campaigns/moment:<id>, and from there on Sequences", () => {
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
  assert.equal(workspacePath("acme", "messages"), "/w/acme/templates", "Messages keeps the product's word in its path");
});

test("broadcasts/<audience>, which People and a list write to message these people, is a door to Campaigns' composer on that audience; a run, Get their yes and Sent itself stay", () => {
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
  // The rooms and Campaigns are where they are; Messages' old name still moves to its word.
  assert.equal(moved({ pathname: "/w/acme/campaigns/moment:pb-1" }), null);
  assert.equal(moved({ pathname: "/w/acme", hash: "#/broadcasts/run:b-1" }), "/w/acme/broadcasts/run:b-1");
  assert.equal(moved({ pathname: "/w/acme", hash: "#/messages" }), "/w/acme/templates");
  assert.equal(routeOfPath("/w/acme/campaigns/moment:pb-1"), "campaigns/moment:pb-1");
  assert.equal(routeOfHash("#/campaigns"), "campaigns");
});
