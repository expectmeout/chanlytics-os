/**
 * Campaigns is Sequences (decision 0060; the home that stood here went in S6), with Messages beside it and Sent's sheets
 * under it: what the frame says around each address (src/surfaces/campaigns/routes.ts), the routes the registry hands the
 * frame, and the old addresses, which land in one move on the page that replaced them (contracts retiredRouteOf, the one
 * table of them, applied where a route is written, where the app moves, where an address is moved on load, and by the page).
 *
 *   campaigns[/sequences]            Sequences, Campaigns' first view   crumbs: Campaigns
 *   campaigns/sequences/<id>         a sequence open beside it     crumbs: Campaigns › <its name>
 *   campaigns/sequences/<id>/runs/<run>  a run's home, its one screen   crumbs: Campaigns › <its sequence> › <the run>
 *   campaigns/sequences/new[:once[:to:<list>]|:leads|:moment:<trigger>]  the one New   crumbs: Campaigns › New
 *   campaigns/messages/<name>        a message at its home, in Messages   crumbs: Campaigns › Messages › <its title>
 *   campaigns, campaigns/moment:<id>, campaigns/in:<group>  retired: Sequences, or the campaign's sequence
 *   campaigns/new[:to:<list>|:leads|:every|:moment:<trigger>|:edit:<id>]  retired: the one New, or the sequence's record
 *   broadcasts[/run:<id>[/sheet]|/to-send|/get-yes|/<list>]  retired: Sequences, the run's home, the Inbox's To send,
 *                                                             People's Get their yes, New's Send once on that list
 *   campaigns/messages               Messages, its other view      crumbs: Campaigns › Messages
 *   messages (the path's templates)          retired: campaigns/messages
 *   outbound[/<id>] (the path's playbooks)   retired: campaigns/sequences, campaigns/sequences/<id>
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const S = "../../../../apps/dashboard/src/surfaces";
const { campaignsChrome, broadcastsChrome } = await import(`${S}/campaigns/routes.ts`);
const { parseHome } = await import(`${S}/campaigns/home/address.ts`);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { rememberRun } = await import(`${S}/campaigns/broadcasts/run-names.ts`);
const { SURFACE_ROUTES, routeHasPage, onOnePage } = await import(`${S}/routes.ts`);
const {
  workspacePath,
  routeOfPath,
  routeOfHash,
  movedAddress,
  retiredRouteOf,
  runRoute,
  sendOnceRoute,
  newForLeadsRoute,
  parseSequencesRoute,
  TO_SEND_ROUTE,
  GET_YES_ROUTE,
  runTitleOf,
  runApproveWords,
} = await import("@chanlytics/contracts");

afterEach(() => {
  for (const k of ["playbooks", "broadcasts", "reach_outs", "sequences"]) setSurfaceValue(k, undefined);
  delete globalThis.window;
});

const HOME = { label: "Campaigns", to: "campaigns/sequences" };

/* ------------------------------------------------- Campaigns' addresses ------------------------------------------------- */

test("Campaigns' sheet's address says a message, and the home's are still read; the composer's went into the one New", () => {
  const none = { group: null, moment: null, message: null };
  assert.deepEqual(parseHome(null), none);
  // The home's addresses, read so a link kept from before says what it named as it lands on Sequences (retiredRouteOf).
  assert.deepEqual(parseHome("moment:pb-1"), { ...none, moment: "pb-1" });
  assert.deepEqual(parseHome("moment:ro-1:people"), { ...none, moment: "ro-1", part: "people" });
  assert.deepEqual(parseHome("moment:ro-1:elsewhere"), parseHome("moment:ro-1"));
  assert.deepEqual(parseHome("in:before"), { ...none, group: "before" });
  // Word-free ids only (decision 46): a word, a hyphen, a capital or nothing is no group.
  for (const odd of ["in:", "in:Before", "in:visit-tomorrow", "in:../x", "in:1st", "in:before:x"])
    assert.deepEqual(parseHome(odd), none, odd);
  // A message open in a drawer of its own, by its name (the call's text's, or the one a step's editor names).
  assert.deepEqual(parseHome("message:spring_offer"), { ...none, message: "spring_offer" });
  // The composer's addresses open no sheet any more: they land on the one New for whom they named, or on the sequence's
  // record (the Campaigns wiring review's lane 6), before the page is drawn (the next test). A word the page does not know
  // names nothing either: a link never lands on nothing, and lands on Sequences.
  for (const odd of [
    "new",
    "new:to:s1",
    "new:leads",
    "new:edit:ro-1",
    "new:every",
    "surprise",
    "moment:",
    "message:",
    "",
  ])
    assert.deepEqual(parseHome(odd), none, odd);
  // New's addresses, by who it is for, spell back to the same words.
  assert.equal(sendOnceRoute(), "campaigns/sequences/new:once");
  assert.equal(sendOnceRoute("s1"), "campaigns/sequences/new:once:to:s1");
  assert.equal(sendOnceRoute("seg:needs_you"), "campaigns/sequences/new:once:to:seg:needs_you");
  assert.equal(newForLeadsRoute(), "campaigns/sequences/new:leads");
  assert.deepEqual(parseSequencesRoute(sendOnceRoute()), { view: "new", who: "once" });
  assert.deepEqual(parseSequencesRoute(sendOnceRoute("s1")), { view: "new", who: "once", to: "s1" });
  assert.deepEqual(
    parseSequencesRoute(sendOnceRoute("seg:needs_you")),
    { view: "new", who: "once", to: "seg:needs_you" },
    "an audience's id keeps its own colons",
  );
  assert.deepEqual(parseSequencesRoute(newForLeadsRoute()), { view: "new", who: "leads" });
  assert.deepEqual(parseSequencesRoute("campaigns/sequences/new:moment:quiet_30"), { view: "new", moment: "quiet_30" });
  assert.deepEqual(parseSequencesRoute("campaigns/sequences/new:odd"), { view: "new" }, "a who it does not know asks");
});

test("the home's addresses, Sent's, and the composer's land in one move on the page that took each over", () => {
  assert.equal(retiredRouteOf("campaigns"), "campaigns/sequences");
  assert.equal(retiredRouteOf("campaigns/in:before"), "campaigns/sequences", "a group of the ledger that went");
  assert.equal(retiredRouteOf("campaigns/moment:pb-1"), "campaigns/sequences/pb-1");
  assert.equal(retiredRouteOf("campaigns/moment:ro-1:people"), "campaigns/sequences/ro-1/people");
  assert.equal(retiredRouteOf("broadcasts"), "campaigns/sequences");
  // A run's sheet in Sent is the run's home under its sequence (lane 2), the run naming the sequence until the page writes
  // its own; a day of History is that run, at its home.
  assert.equal(retiredRouteOf("broadcasts/run:b-1"), "campaigns/sequences/b-1/runs/b-1");
  assert.equal(retiredRouteOf("broadcasts/run:b-1/sheet"), "campaigns/sequences/b-1/runs/b-1");
  assert.equal(retiredRouteOf("broadcasts/run:"), "campaigns/sequences", "a run named by nothing is Sequences");
  assert.equal(retiredRouteOf("campaigns/sequences/sq-1/history/b-1"), "campaigns/sequences/sq-1/runs/b-1");
  // Sent's own views: To send is a part of the Inbox's Needs you (lane 4), Get their yes People's sheet (lane 7).
  assert.equal(retiredRouteOf("broadcasts/to-send"), TO_SEND_ROUTE);
  assert.equal(retiredRouteOf("broadcasts/get-yes"), GET_YES_ROUTE);
  // The composer is the one New (lane 6): Send once on its audience, Write to leads; a reach-out's change its record.
  assert.equal(retiredRouteOf("campaigns/new"), "campaigns/sequences/new:once");
  assert.equal(retiredRouteOf("campaigns/new:to:s1"), "campaigns/sequences/new:once:to:s1");
  assert.equal(retiredRouteOf("campaigns/new:to:"), "campaigns/sequences/new:once", "no audience named is no audience");
  assert.equal(retiredRouteOf("campaigns/new:leads"), "campaigns/sequences/new:leads");
  assert.equal(retiredRouteOf("campaigns/new:edit:ro-1"), "campaigns/sequences/ro-1");
  // The composer's Every time: New, and New on its moment.
  assert.equal(retiredRouteOf("campaigns/new:every"), "campaigns/sequences/new");
  assert.equal(retiredRouteOf("campaigns/new:moment:quiet_30"), "campaigns/sequences/new:moment:quiet_30");
  // A query after the route rides along.
  assert.equal(retiredRouteOf("campaigns/moment:pb-1?from=email"), "campaigns/sequences/pb-1?from=email");
  // Each page's own address stays where it is.
  for (const kept of [
    "campaigns/sequences",
    "campaigns/sequences/pb-1",
    "campaigns/sequences/pb-1/history",
    runRoute("b-1", "sq-1"),
    sendOnceRoute("s1"),
    newForLeadsRoute(),
    "campaigns/messages/spring_offer",
    "campaigns/messages",
    TO_SEND_ROUTE,
    GET_YES_ROUTE,
  ])
    assert.equal(retiredRouteOf(kept), null, kept);
  // A message's drawer over Sequences went into its home, the Library open on it (the framework's rating, 19 Oct 2026).
  assert.equal(retiredRouteOf("campaigns/message:spring_offer"), "campaigns/messages/spring_offer");
});

test("a run's home is under its sequence, one screen whatever the run is (the Campaigns wiring review's lane 2)", () => {
  assert.equal(runRoute("b-1", "sq-1"), "campaigns/sequences/sq-1/runs/b-1");
  // A writer that does not know the sequence names the run in its place: the server reads a sequence by any of its parts.
  assert.equal(runRoute("b-1"), "campaigns/sequences/b-1/runs/b-1");
  assert.equal(runRoute("b-1", null), "campaigns/sequences/b-1/runs/b-1");
  assert.deepEqual(parseSequencesRoute(runRoute("b-1", "sq-1")), {
    view: "record",
    id: "sq-1",
    tab: "history",
    run: "b-1",
  });
  // An older day of History reads as that run too, which the table of retired addresses moves on (above).
  assert.deepEqual(
    parseSequencesRoute("campaigns/sequences/sq-1/history/b-1"),
    parseSequencesRoute(runRoute("b-1", "sq-1")),
  );
  // A run word with nothing after it is the record's History.
  assert.deepEqual(parseSequencesRoute("campaigns/sequences/sq-1/runs"), { view: "record", id: "sq-1", tab: "steps" });
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
  assert.deepEqual(c("sequences").crumbs, [HOME, "New"], "the one New (lane 6)");
  // A run at its home: under its sequence, which goes back to its History, the days it is one of.
  globalThis.window = { location: { pathname: "/w/acme/campaigns/sequences/q-1/runs/b-1" } };
  setSurfaceValue("broadcasts", { rows: [{ id: "b-1", name: "Win-back · 2026-09-10", run_for: "2026-09-10" }] });
  // One that went keeps its day in its name, as its report's head says it.
  assert.deepEqual(c("sequences").crumbs, [
    HOME,
    { label: "Win-back", to: "campaigns/sequences/q-1/history" },
    "Win-back · 2026-09-10",
  ]);
  // A run older than Sent's newest fifty is named by its own read once the tab has made it, and "Run" before.
  globalThis.window = { location: { pathname: "/w/acme/campaigns/sequences/q-1/runs/b-old" } };
  assert.equal(c("sequences").crumbs.at(-1), "Run");
  rememberRun({ id: "b-old", name: "Win-back · 2026-08-01", run_for: "2026-08-01", state: "sent" });
  assert.equal(c("sequences").crumbs.at(-1), "Win-back · 2026-08-01");
  // The strip: Sequences and Messages, and Ads only where it is drawn.
  assert.deepEqual(
    c(null).views.tabs.map((t) => [t.id, t.label, t.to]),
    [
      ["sequences", "Sequences", "campaigns/sequences"],
      ["messages", "Messages", "campaigns/messages"],
    ],
  );
  // Messages is the strip's other view on the same mount (19 Oct 2026): its own tab lit, the same one head, the pane.
  for (const p of ["messages", "messages/x"]) {
    const at = c(p);
    assert.deepEqual(at.crumbs, [HOME, "Messages"], p);
    assert.equal(at.mount, "campaigns", `${p}: one mount with Sequences, so a switch keeps both drawn`);
    assert.equal(at.views?.picked, "messages", p);
    assert.equal(at.pane, true, p);
    assert.equal(at.act, null, p);
  }
});

/* ---------------------------------------------------- the rooms ---------------------------------------------------- */

test("a run is called by one name wherever it is named -- its own, less the day a sequence's run carries -- and approving it says how many, once", () => {
  assert.equal(runTitleOf({ name: "VIP color clients · 2026-10-18", run_for: "2026-10-18" }), "VIP color clients");
  assert.equal(runTitleOf({ name: "Autumn hours", run_for: null }), "Autumn hours", "a one-off keeps its name");
  assert.equal(runTitleOf({ name: "Autumn hours" }), "Autumn hours");
  assert.equal(
    runTitleOf({ name: "Win-back · 2026-10-17", run_for: "2026-10-18" }),
    "Win-back · 2026-10-17",
    "a day that is not its own is part of its name",
  );
  assert.equal(
    runTitleOf({ name: " · 2026-10-18", run_for: "2026-10-18" }),
    " · 2026-10-18",
    "never a name of nothing",
  );
  assert.equal(runApproveWords(1), "Approve · 1 person");
  assert.equal(runApproveWords(7), "Approve · 7 people");
});

test("Sent draws nothing of its own: every address of it lands, and while it does its crumbs are Campaigns', on Sequences", () => {
  for (const param of [null, "run:b-1", "get-yes", "to-send", "s1"]) {
    const at = broadcastsChrome({ param });
    assert.deepEqual(at.crumbs, ["Campaigns"], String(param));
    assert.equal(at.views.picked, "sequences", String(param));
    assert.equal(at.mount, "broadcasts");
    assert.equal(at.pane, true);
    assert.notEqual(
      retiredRouteOf(param ? `broadcasts/${param}` : "broadcasts"),
      null,
      `broadcasts/${param ?? ""} lands`,
    );
  }
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
    "campaigns/sequences/q-1/runs/b-1",
    "campaigns/sequences/new",
    "campaigns/sequences/new:once:to:s1",
    "campaigns/sequences/new:leads",
    "campaigns/moment:pb-1",
    "campaigns/new",
    "campaigns/new:every",
    "campaigns/new:leads",
    "campaigns/new:moment:quiet_30",
    "campaigns/new:to:s1",
    "campaigns/new:edit:ch-1",
    "campaigns/message:spring_offer",
    "campaigns/messages/spring_offer",
    "broadcasts",
    "broadcasts/run:b-1",
    "broadcasts/run:b-1/sheet",
    "broadcasts/get-yes",
    "broadcasts/s1",
    "campaigns/messages",
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
    onOnePage("campaigns/sequences/q-1", "campaigns/messages/spring_offer"),
    "a message at its home is a view of the same mount",
  );
  assert.ok(onOnePage("campaigns/new:to:s1", "campaigns"));
  assert.ok(onOnePage("campaigns/sequences", "campaigns/messages"), "Sequences and Messages are one mount's two views");
  assert.ok(onOnePage("campaigns/sequences/q-1", "campaigns/messages"));
  assert.ok(!onOnePage("campaigns", "broadcasts/get-yes"), "a room is its own page");
  assert.ok(!onOnePage("broadcasts/run:b-1", "campaigns"));
});

/* ------------------------------------------------ the old addresses ------------------------------------------------- */

test("the old Playbooks addresses land on Sequences in one move: outbound on the list, outbound/<id> on its sequence", () => {
  assert.equal(retiredRouteOf("outbound"), "campaigns/sequences");
  assert.equal(retiredRouteOf("outbound/pb-1"), "campaigns/sequences/pb-1");
  assert.equal(
    retiredRouteOf("outbound/pb-1/x"),
    "campaigns/sequences/pb-1",
    "the route's second word, as the shell reads its param",
  );
  for (const kept of [
    "campaigns/sequences",
    "campaigns/sequences/pb-1",
    "campaigns/sequences/pb-1/people",
    "campaigns/sequences/pb-1/runs/b-1",
    "campaigns/messages",
    "clients/c-1",
    "today",
  ]) {
    assert.equal(retiredRouteOf(kept), null, `${kept} is a page's own`);
  }
  // Written: every link the app makes lands in one move.
  assert.equal(workspacePath("acme", "outbound"), "/w/acme/campaigns/sequences");
  assert.equal(workspacePath("acme", "outbound/pb-1"), "/w/acme/campaigns/sequences/pb-1");
  assert.equal(workspacePath("acme", "campaigns"), "/w/acme/campaigns/sequences");
  assert.equal(workspacePath("acme", "campaigns/moment:pb-1"), "/w/acme/campaigns/sequences/pb-1");
  assert.equal(workspacePath("acme", "campaigns/new"), "/w/acme/campaigns/sequences/new:once");
  assert.equal(workspacePath("acme", "broadcasts/run:b-1"), "/w/acme/campaigns/sequences/b-1/runs/b-1");
  // Messages is Campaigns' other view (19 Oct 2026): its old route is a door to it.
  assert.equal(retiredRouteOf("messages"), "campaigns/messages");
  assert.equal(workspacePath("acme", "messages"), "/w/acme/campaigns/messages");
});

test("broadcasts/<audience>, which People and a list wrote to message these people, is New's Send once on that audience", () => {
  assert.equal(retiredRouteOf("broadcasts/s1"), "campaigns/sequences/new:once:to:s1");
  assert.equal(retiredRouteOf("broadcasts/new_week"), "campaigns/sequences/new:once:to:new_week");
  assert.equal(
    retiredRouteOf("broadcasts/s1/x"),
    "campaigns/sequences/new:once:to:s1",
    "the route's second word, as the shell reads its param",
  );
  for (const kept of ["broadcast", "campaigns/sequences/new:once:to:s1"])
    assert.equal(retiredRouteOf(kept), null, `${kept} is where it is`);
  // Sent's own list went to each sequence's History (D3): Sequences.
  assert.equal(retiredRouteOf("broadcasts"), "campaigns/sequences");
  // Written: People's "Message these people" lands in one move.
  assert.equal(workspacePath("acme", "broadcasts/s1"), "/w/acme/campaigns/sequences/new:once:to:s1");
  assert.equal(workspacePath("acme", "broadcasts"), "/w/acme/campaigns/sequences");
  // And an old link, a bookmark or a bell row that says it moves as the frame loads.
  const moved = (address) => movedAddress({ search: "", hash: "", ...address });
  assert.equal(moved({ pathname: "/w/acme", hash: "#/broadcasts/s1" }), "/w/acme/campaigns/sequences/new:once:to:s1");
  assert.equal(moved({ pathname: "/w/acme/broadcasts/s1" }), "/w/acme/campaigns/sequences/new:once:to:s1");
  assert.equal(
    moved({ pathname: "/w/acme/broadcasts/s1", search: "?from=people" }),
    "/w/acme/campaigns/sequences/new:once:to:s1?from=people",
  );
  assert.equal(moved({ pathname: "/w/acme", hash: "#/broadcasts/get-yes" }), "/w/acme/people/get-yes");
  assert.equal(moved({ pathname: "/w/acme", hash: "#/broadcasts/to-send" }), "/w/acme/inbox/to-send");
  assert.equal(moved({ pathname: "/w/acme/broadcasts" }), "/w/acme/campaigns/sequences");
  // The address it lands on reads back as New's Send once on that audience.
  assert.equal(routeOfPath("/w/acme/campaigns/sequences/new:once:to:s1"), "campaigns/sequences/new:once:to:s1");
  assert.deepEqual(parseSequencesRoute("campaigns/sequences/new:once:to:s1"), { view: "new", who: "once", to: "s1" });
});

test("a bookmark, a bell row or an email link that says the old route moves to the new address as the frame loads", () => {
  const moved = (address) => movedAddress({ search: "", hash: "", ...address });
  // The hash, as emails, the phone app's links and every bell row's `route` write it.
  assert.equal(moved({ pathname: "/w/acme", hash: "#/outbound" }), "/w/acme/campaigns/sequences");
  assert.equal(moved({ pathname: "/w/acme", hash: "#/outbound/pb-1" }), "/w/acme/campaigns/sequences/pb-1");
  assert.equal(
    moved({ pathname: "/w/acme", hash: "#/outbound/pb-1", search: "?from=email" }),
    "/w/acme/campaigns/sequences/pb-1?from=email",
  );
  // The path: the shell's own name, and the product's word the page had for a day (`playbooks`).
  assert.equal(moved({ pathname: "/w/acme/outbound/pb-1" }), "/w/acme/campaigns/sequences/pb-1");
  assert.equal(moved({ pathname: "/w/acme/playbooks" }), "/w/acme/campaigns/sequences");
  assert.equal(moved({ pathname: "/w/acme/playbooks/pb-1", hash: "#x" }), "/w/acme/campaigns/sequences/pb-1#x");
  // Campaigns' home and a campaign's drawer, written before, land on Sequences as the page loads, in one move.
  assert.equal(moved({ pathname: "/w/acme/campaigns/moment:pb-1" }), "/w/acme/campaigns/sequences/pb-1");
  assert.equal(moved({ pathname: "/w/acme/campaigns" }), "/w/acme/campaigns/sequences");
  assert.equal(
    moved({ pathname: "/w/acme", hash: "#/campaigns/moment:pb-1:people" }),
    "/w/acme/campaigns/sequences/pb-1/people",
  );
  // Sequences is where it is, a run's sheet moves to the run's home; Messages' old names move to Campaigns' view.
  assert.equal(moved({ pathname: "/w/acme/campaigns/sequences/pb-1" }), null);
  assert.equal(
    moved({ pathname: "/w/acme", hash: "#/broadcasts/run:b-1" }),
    "/w/acme/campaigns/sequences/b-1/runs/b-1",
  );
  assert.equal(moved({ pathname: "/w/acme", hash: "#/messages" }), "/w/acme/campaigns/messages");
  assert.equal(moved({ pathname: "/w/acme/templates" }), "/w/acme/campaigns/messages");
  assert.equal(routeOfPath("/w/acme/campaigns/moment:pb-1"), "campaigns/moment:pb-1");
  assert.equal(routeOfHash("#/campaigns"), "campaigns");
});
