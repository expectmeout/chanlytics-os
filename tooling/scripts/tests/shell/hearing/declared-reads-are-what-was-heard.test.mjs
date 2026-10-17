/**
 * A page's live tables are derived from the kinds of record it declares (docs/decisions/0047, point 3 and task 3.1 of the wiring plan).
 *
 * Every surface kept its tables beside its reads, by hand, and nothing tied the two: four times a reader began to draw a record and the
 * lists fell behind (#1399, #1417, #1423, #1551). Contracts now names each table's record kind (RECORD_KINDS) and a surface declares
 * `reads` (the kinds it draws) and `fresh` (live, on its page alone, after an age, or on its owner's own change); the tables it hears
 * (`refreshOnTables`) and the rule over them (`refreshWhen`) come from `declareReads`, with what it leaves unheard said, and why.
 *
 * Run on the real kinds and the real overrides: every table of the feed is one kind's; the derivation is held to what each surface
 * heard before the declaration (the tables, and which of them only on its page); and what a surface hears and what it omits account
 * for every table of the kinds it draws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { registeredSurfaces } from "./_reads.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/a", hash: "#/today" };
globalThis.location.pathname = "/w/a";
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.dispatchEvent ??= () => true;
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "a", name: "A", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

const { RECORD_KINDS, liveTablesOf } = await importSrc("packages/contracts/src/activity/record-kinds.ts");
const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
const { heardTables, heardOnItsPage, subscribesToRealtime, wantsRefresh } = await importSrc(
  "apps/dashboard/src/legacy-bridge/surface-realtime.ts",
);
const { declareReads, ownsTable, ownsTheScreen } = await importSrc(
  "apps/dashboard/src/legacy-bridge/surface-registry.ts",
);
const { ON_DEMAND_STALE_MIN } = await importSrc("apps/dashboard/src/legacy-bridge/surface-data.ts");

/** Every surface the shell registers (LegacyApp.tsx), from the module it imports each from: the shell's own list, no copy of it. */
const OVERRIDES = [];
for (const { name, file } of registeredSurfaces()) OVERRIDES.push((await importSrc(file))[name]);
const byKey = (key) => OVERRIDES.find((o) => o.key === key);

/** What the Campaigns composers and the playbooks drew from the business beside the messages, as they heard it on their page. */
const COMPOSER_PAGE = [
  "messages",
  "conversations",
  "escalations",
  "appointments",
  "tenant_channels",
  "lines",
  "billing_accounts",
  "contacts",
  "templates",
  "mailboxes",
  "policies",
  "tenant_config",
  // The lists To offers and counts (the wiring's second audit, W-person-list-lead-7).
  "segments",
  "segment_members",
];
/**
 * Sent's composer without the templates: the messages it offers are the settings read's, the one read of the templates, which hears
 * them and which Sent follows (offered-templates.ts, task 3.3). Playbooks keep them: the server reads a message's category to count
 * the run of a playbook whose message is stricter than its moment.
 */
const SENT_PAGE = COMPOSER_PAGE.filter((table) => table !== "templates");

/**
 * The tables each surface heard before its declaration (the arrays the overrides wrote by hand, at 132ab95eb with the wiring plan's
 * tasks 2.1 and 2.2 on it, less the templates the Inbox and Sent no longer read themselves, task 3.3). The derived tables equal
 * them: a declaration moves nothing a page heard.
 */
const HEARD_BEFORE = {
  workspace: ["memberships", "tenants"],
  // And the Library's counts, what sends each message and how many it sent (W-campaign-run-template-reachout-2).
  // And what the Business pane resolves its facts from, on its pages (R6: W-review-facts-rules-3, S1-4).
  settings: [
    "tenant_config",
    "policies",
    "templates",
    "memberships",
    "invitations",
    "sequences",
    "sequence_steps",
    "sequence_batches",
    "tenant_channels",
    "lines",
    "google_listings",
    // The visits the Business pane states, on its pages (reads-not-heard's owed, closed 15 October).
    "appointments",
  ],
  // The channel rows, read once for every page that draws a number (R6: W-channel-team-plus-1, S3-1, S10-9).
  channels: ["tenant_channels"],
  notifications: ["notifications"],
  inbox: ["messages", "conversations", "escalations", "contacts"],
  // And the calls its Calls tab draws, not a transcript turn (X3-2).
  conversations: ["messages", "conversations", "escalations", "contacts", "calls"],
  // And the mailbox its email chip draws (R6: W-channel-team-plus-3).
  today: [
    "messages",
    "conversations",
    "escalations",
    "calls",
    "lead_rounds",
    "tenant_channels",
    "lines",
    "mailboxes",
    "billing_accounts",
    "contacts",
  ],
  people: [
    "messages",
    "conversations",
    "escalations",
    "contacts",
    "sequences",
    "sequence_steps",
    "tenant_channels",
    "billing_accounts",
    "policies",
    "templates",
    "tenant_config",
    "appointments",
    "deals",
    "person_notes",
    "segments",
    "segment_members",
    // Decision 0052 (#1566) adds what a row draws of the business a person works at and the signer a reply of theirs offers.
    "leads",
    "sequence_replies",
    // The runs a row's "Follow-up to approve" names (W-campaign-run-template-reachout-9).
    "sequence_batches",
    // The text line and the mailbox its reach is counted against (R6: S3-3, W-channel-team-plus-3).
    "lines",
    "mailboxes",
    // A call's start and end (its last contact and call count, never a turn) and the team who wrote a note or is a step's
    // (reads-not-heard's owed, closed 15 October).
    "calls",
    "memberships",
  ],
  leads: ["leads", "lead_searches", "lead_rounds", "lead_search_members"],
  // Task 3.2 adds the calls the report counts (not a transcript turn) and the hours its "while closed" counts by.
  reports: ["messages", "conversations", "escalations", "calls", "deals", "appointments", "contacts", "tenant_config"],
  // And the calendar settings its booking line reads (S3-4).
  reports_headline: ["messages", "calls", "appointments", "contacts", "tenant_config"],
  // And the rule the reply box's choice is (W-review-facts-rules-8).
  reports_reviews: ["google_reviews", "google_listings", "google_connections", "policies"],
  reports_receptionist: ["messages", "escalations", "calls", "appointments", "contacts", "tenant_config"],
  // The People lens also counts who can be reached by the number, the text line and the mailbox; the Campaigns lens a reach-out's
  // replies, the number's standing and the sending domains (wiring plan task 3.2, reads-are-heard.test.mjs).
  reports_people: [
    "messages",
    "calls",
    "person_notes",
    "contacts",
    "tenant_config",
    "tenant_channels",
    "lines",
    "mailboxes",
  ],
  reports_campaigns: [
    "messages",
    "conversations",
    "escalations",
    "sequence_batches",
    "sequence_replies",
    "tenant_channels",
    "mailbox_connections",
    // A person's answer (the wiring's second audit, W-person-list-lead-8): an update of one, never a person made.
    "contacts",
    // A template's verdict, which its tile counts (W-campaign-run-template-reachout-10).
    "templates",
    // The hosted mailbox a reach-out may write from, and a deal won (reads-not-heard's owed, closed 15 October).
    "mailboxes",
    "deals",
  ],
  // Its line is the channels read's, which it follows (R6).
  live: ["calls"],
  // And a deal an audience names, and the team the people read names; the playbooks a deal (owed, closed 15 October).
  broadcasts: [...SENT_PAGE, "sequence_batches", "deals", "memberships"],
  playbooks: [...COMPOSER_PAGE, "sequence_batches", "sequences", "sequence_steps", "deals"],
  // And the rule that is a chain's mode (W-review-facts-rules-8); a chain's templates and a lead's deal won (owed, closed).
  reach_outs: ["sequences", "sequence_steps", "sequence_batches", "sequence_replies", "policies", "templates", "deals"],
  // A person's answer, by an update of them (the wiring's second audit, S3-2). And a deal won and the numbers and mailboxes the
  // reach-outs counted left from (owed, closed 15 October).
  campaign_results: [
    "messages",
    "conversations",
    "escalations",
    "sequence_batches",
    "sequence_replies",
    "contacts",
    "deals",
    "tenant_channels",
    "mailboxes",
    "mailbox_connections",
  ],
  // Campaigns › Sequences (decision 0060), declared as it arrived: a sequence and its steps, its batches, a lead's reply and a
  // customer's (the messages), the rule that says who approves, the workspace's word and clock, and the list or the search it
  // starts on.
  sequences: [
    "sequences",
    "sequence_steps",
    "sequence_batches",
    "sequence_replies",
    "messages",
    "policies",
    "tenant_config",
    "tenants",
    "segments",
    "lead_searches",
  ],
  // And the mailbox a reply came to (decision 0056; owed, closed 15 October).
  reach_out_replies: ["sequence_replies", "mailboxes", "mailbox_connections"],
  partner: [],
  alerts: [],
  // And the person a visit is (W-person-list-lead-6): an update of them, never a person made.
  // And the mailbox the Business tab's forwarding code is kept on (R6: S4-4).
  calendar: ["appointments", "appointment_notices", "tenant_config", "contacts", "mailboxes"],
  // The Calendar's campaign marks (its lane C): the runs, the campaigns, the classes' modes and the workspace's pause.
  calendar_runs: ["sequence_batches", "sequences", "sequence_steps", "policies", "tenants"],
  // The counts of the lists pinned to Today (the wiring's second audit, R10): what the lists are made of, a person's threads,
  // holds and calls, visits, steps and deals, the lists kept by hand, who can be reached, the settings and the workspace's row.
  today_pins: [
    "contacts",
    "messages",
    "conversations",
    "escalations",
    "calls",
    "appointments",
    "person_notes",
    "deals",
    "segments",
    "segment_members",
    "tenant_channels",
    "lines",
    "mailboxes",
    "tenant_config",
    "tenants",
  ],
  // Not the bell's rows, which Setup's read never read. And what its rows state (the wiring's second audit, S4-3, S3-6,
  // W-review-facts-rules-4): the team, the templates, the settings and rules, a visit, a person's answer and their deals, the first
  // WhatsApp message and the Google listing.
  setup: [
    "lines",
    "tenant_channels",
    "capability_activations",
    "business_records",
    "billing_accounts",
    "google_connections",
    "calls",
    "mailbox_connections",
    "mailboxes",
    "memberships",
    "invitations",
    "templates",
    "tenant_config",
    "policies",
    "appointments",
    "appointment_notices",
    "contacts",
    "deals",
    "messages",
    "conversations",
    "google_listings",
  ],
  // And the rule that says whether the receptionist answers a review on its own (W-review-facts-rules-8).
  google: ["google_listings", "google_reviews", "google_connections", "policies"],
  billing: ["billing_accounts"],
  // A person's page, a surface of its own since the wiring's second audit (R5): what the page draws of them that People hears on
  // its own list alone, read for the one person on screen (people-detail.ts personOverride).
  // And the team who wrote or took something, and the connected mailbox a business's emails left from (owed, closed 15 October).
  person: [
    "contacts",
    "escalations",
    "calls",
    "sequence_batches",
    "sequences",
    "sequence_steps",
    "policies",
    "tenant_config",
    "leads",
    "memberships",
    "mailbox_connections",
  ],
};

/**
 * Of those, the tables a surface heard only while its page was on screen (the tables it gave `onlyOnItsPage`); the rest it heard
 * wherever the tab was. A surface not named here heard every table everywhere.
 */
const ON_ITS_PAGE_BEFORE = {
  people: [
    "messages",
    "conversations",
    "escalations",
    "contacts",
    "sequences",
    "sequence_steps",
    "tenant_channels",
    "billing_accounts",
    "policies",
    "templates",
    "tenant_config",
    // Decision 0052 (#1566): the business a person works at, heard on People's page as the rest are. A reply's signer is heard on
    // every page since S1-1 (the Inbox thread a bell row opens draws it from People's rows).
    "leads",
    // The runs a row's follow-up names (W-campaign-run-template-reachout-9).
    "sequence_batches",
    // The text line and the mailbox its reach is counted against (R6).
    "lines",
    "mailboxes",
    // A call's start and end, and the team (owed, closed 15 October).
    "calls",
    "memberships",
  ],
  broadcasts: [...SENT_PAGE, "deals", "memberships"],
  playbooks: [...COMPOSER_PAGE, "deals"],
  reports: HEARD_BEFORE.reports,
  reports_headline: HEARD_BEFORE.reports_headline,
  reports_receptionist: HEARD_BEFORE.reports_receptionist,
  reports_people: HEARD_BEFORE.reports_people,
  reports_campaigns: HEARD_BEFORE.reports_campaigns,
  reports_reviews: HEARD_BEFORE.reports_reviews,
  campaign_results: HEARD_BEFORE.campaign_results,
  // Its batches and its sequences wherever the tab is (`always`), the rest on its page.
  sequences: ["sequence_replies", "messages", "policies", "tenant_config", "tenants", "segments", "lead_searches"],
  person: HEARD_BEFORE.person,
  calendar_runs: HEARD_BEFORE.calendar_runs,
  today_pins: HEARD_BEFORE.today_pins,
  // The Library's counts, on the Library and Settings' panes (W-campaign-run-template-reachout-2), and the Business pane's facts
  // (R6).
  settings: [
    "sequences",
    "sequence_steps",
    "sequence_batches",
    "tenant_channels",
    "lines",
    "google_listings",
    "appointments",
  ],
  // A search's rows and strip, on Leads' scope (S10-5).
  leads: HEARD_BEFORE.leads,
  // What Setup's rows state, on Start and Today's card (S4-3).
  setup: [
    "templates",
    "tenant_config",
    "policies",
    "appointments",
    "appointment_notices",
    "contacts",
    "deals",
    "messages",
    "conversations",
  ],
};

/** A route no surface heard on its page alone owns: Live's, which is heard everywhere. */
const AWAY = "live";
/** The routes to look a surface's own page for, and the pages that differ from the first to own it. */
const ROUTES = [
  "today",
  "inbox",
  "conversations",
  "clients",
  "reports",
  "reports/receptionist",
  "reports/people",
  "reports/reviews",
  "campaigns",
  // Campaigns' composer, where the playbooks' moments and Campaigns' own 30 days are drawn (its landing is Sequences' list).
  "campaigns/new",
  "broadcasts",
  "calendar",
  "live",
  // A person's page, on its first tab and another (the wiring's second audit, W-person-list-lead-1): last, so a surface that owns
  // a page above is asked there.
  "clients/0b9c4f6e-1d2a-4c3b-9e8f-7a6b5c4d3e2f",
  "clients/0b9c4f6e-1d2a-4c3b-9e8f-7a6b5c4d3e2f/history",
];
/** The Campaigns lens hears the feed on the lens alone, though the Overview draws the surface too; the Library is Settings' page. */
const HOME = {
  reports_campaigns: "reports/campaigns",
  settings: "messages",
  leads: "clients/leads",
  sequences: "campaigns/sequences",
};
/** The first route that owns every table the surface hears on its page alone: its own page, not one that owns some kinds of it. */
const homeOf = (o) =>
  HOME[o.key] ?? ROUTES.find((route) => (o.refreshOnTables ?? []).every((table) => ownsTable(o.key, table, route)));

const at = (route) => {
  globalThis.location.hash = `#/${route}`;
};
const change = (table, event = "INSERT") => ({ table, event, row: {} });
/** Whether a surface asks to be read for this table, at the address on screen now. */
const hears = (o, table) => wantsRefresh(o, table, change(table));
const sorted = (xs) => [...xs].sort();
/** Whether it asks for an insert or an update of the table: a person's page asks for no row made now (people-detail.ts). */
const hearsAny = (o, table) => ["INSERT", "UPDATE"].some((event) => wantsRefresh(o, table, change(table, event)));

test("the kinds name every table the database tells a workspace of, each in exactly one kind", () => {
  const named = Object.values(RECORD_KINDS).flat();
  assert.deepEqual(sorted(named), sorted(watchedTables()), "a table joins the feed with its kind, in one change");
  assert.equal(new Set(named).size, named.length, "no table is two kinds'");
  for (const [kind, tables] of Object.entries(RECORD_KINDS)) assert.ok(tables.length > 0, `${kind} names a table`);
  // The kinds the decision names.
  assert.deepEqual(Object.keys(RECORD_KINDS), [
    "person",
    "conversation",
    "call",
    "hold",
    "visit",
    "step",
    "deal",
    "list",
    "lead",
    "campaign",
    "send",
    "template",
    "reach_out",
    "review",
    "facts",
    "rules",
    "channel",
    "team",
    "workspace",
    "notification",
    "billing",
  ]);
});

test("liveTablesOf: the tables of the kinds, each once, in the order the kinds are named", () => {
  assert.deepEqual(liveTablesOf([]), []);
  assert.deepEqual(liveTablesOf(["person"]), ["contacts"]);
  assert.deepEqual(liveTablesOf(["hold", "conversation", "hold"]), ["escalations", "messages", "conversations"]);
  for (const kind of Object.keys(RECORD_KINDS)) assert.deepEqual(liveTablesOf([kind]), [...RECORD_KINDS[kind]], kind);
  assert.deepEqual(
    liveTablesOf(Object.keys(RECORD_KINDS)).sort(),
    sorted(watchedTables()),
    "all the kinds, the whole feed",
  );
});

test("a declaration hears the tables of its kinds, less what it omits and plus what it adds", () => {
  const omit = [{ tables: ["mailboxes", "mailbox_connections"], why: "a reason" }];
  assert.deepEqual(heardTables({ reads: ["channel"], fresh: "live" }), RECORD_KINDS.channel);
  assert.deepEqual(heardTables({ reads: ["channel"], fresh: "live", omit }), [
    "tenant_channels",
    "lines",
    "capability_activations",
    "business_records",
  ]);
  assert.deepEqual(
    heardTables({ reads: ["person", "channel"], fresh: "its-page", omit, extra: ["calls", "contacts"] }),
    ["contacts", "tenant_channels", "lines", "capability_activations", "business_records", "calls"],
    "an extra table is heard once, and a table of the kinds is not heard twice",
  );
  // The feed tells a surface that is aged, or read on its owner's own change, nothing.
  for (const fresh of [{ aged: 5 }, "own-change"])
    assert.deepEqual(heardTables({ reads: ["person"], fresh, extra: ["calls"] }), [], JSON.stringify(fresh));
  // Heard on its page: all it hears under "its-page", less the kinds that are its own.
  assert.deepEqual(heardOnItsPage({ reads: ["person", "deal", "step"], fresh: "its-page" }), [
    "contacts",
    "deals",
    "person_notes",
  ]);
  assert.deepEqual(heardOnItsPage({ reads: ["person", "deal", "step"], fresh: "its-page", always: ["deal", "step"] }), [
    "contacts",
  ]);
  assert.deepEqual(
    heardOnItsPage({ reads: ["person"], fresh: "live" }),
    [],
    "a live surface hears nothing only on a page",
  );
});

test("declareReads gives the kinds, the freshness, the tables and the rule over them, and nothing the declaration does not hold", () => {
  const live = declareReads("live", { reads: ["call", "person"], fresh: "live" });
  assert.deepEqual(live, { reads: ["call", "person"], fresh: "live", refreshOnTables: ["calls", "contacts"] });
  const when = (c) => c.table !== "calls";
  assert.equal(
    declareReads("live", { reads: ["call"], fresh: "live", when }).refreshWhen,
    when,
    "its own rule, as written",
  );
  const omit = [{ tables: ["lead_searches"], why: "a reason" }];
  assert.deepEqual(
    declareReads("live", { reads: ["lead"], fresh: "live", omit }).omit,
    omit,
    "what it left out stays on it",
  );
  const none = declareReads("partner", { reads: [], fresh: "own-change" });
  assert.deepEqual(
    none,
    { reads: [], fresh: "own-change" },
    "a surface the feed tells nothing has no tables and no rule",
  );
  assert.equal(subscribesToRealtime(none), false);
});

test("under its-page, a surface hears its page's tables on its page and its own kinds anywhere; its own rule is asked first and the page may be narrowed", () => {
  const people = declareReads("people", { reads: ["person", "deal"], fresh: "its-page", always: ["deal"] });
  assert.deepEqual(people.refreshOnTables, ["contacts", "deals"]);
  at("clients");
  assert.equal(people.refreshWhen(change("contacts")), true, "on its page");
  at(AWAY);
  assert.equal(people.refreshWhen(change("contacts")), false, "kept for it elsewhere");
  assert.equal(people.refreshWhen(change("deals")), true, "its own kind, wherever the tab is");

  const quiet = declareReads("people", {
    reads: ["call", "person"],
    fresh: "its-page",
    when: (c) => !(c.table === "calls" && c.event === "UPDATE"),
  });
  at("clients");
  assert.equal(quiet.refreshWhen(change("contacts")), true);
  assert.equal(
    quiet.refreshWhen({ table: "calls", event: "UPDATE", row: {} }),
    false,
    "its own rule says no on its page",
  );
  assert.equal(quiet.refreshWhen(change("calls")), true);

  let onTheLens = true;
  const narrowed = declareReads("people", {
    reads: ["person"],
    fresh: "its-page",
    page: (here) => (c) => here(c) && onTheLens,
  });
  at("clients");
  assert.equal(narrowed.refreshWhen(change("contacts")), true);
  onTheLens = false;
  assert.equal(ownsTheScreen("people", "clients"), true, "the page owns the screen");
  assert.equal(narrowed.refreshWhen(change("contacts")), false, "but the surface's own page rule is narrower");
  onTheLens = true;
  at(AWAY);
  assert.equal(narrowed.refreshWhen(change("contacts")), false, "and it is never wider than the standard rule");
  at("today");
});

test("every surface declares kinds that exist and a freshness the feed's tables agree with", () => {
  assert.equal(OVERRIDES.length, new Set(OVERRIDES.map((o) => o.key)).size, "one override a key");
  for (const o of OVERRIDES) {
    assert.ok(Array.isArray(o.reads), `${o.key} declares reads`);
    assert.equal(new Set(o.reads).size, o.reads.length, `${o.key}: a kind is named once`);
    for (const kind of o.reads) assert.ok(kind in RECORD_KINDS, `${o.key}: ${kind} is a kind of record`);
    const fresh = o.fresh;
    const known =
      fresh === "live" ||
      fresh === "its-page" ||
      fresh === "own-change" ||
      (typeof fresh === "object" && fresh !== null && Number.isInteger(fresh.aged) && fresh.aged > 0);
    assert.ok(known, `${o.key}: ${JSON.stringify(fresh)} is a freshness`);
    const hearsTheFeed = (fresh === "live" || fresh === "its-page") && o.reads.length > 0;
    assert.equal(
      !!o.refreshOnTables?.length,
      hearsTheFeed,
      `${o.key}: it hears the feed when it is live or heard on its page, and not otherwise`,
    );
    assert.equal(subscribesToRealtime(o), hearsTheFeed, `${o.key}: it joins the feed exactly then`);
  }
});

test("each surface hears what it heard before the declaration: the same tables, from the kinds it draws", () => {
  assert.deepEqual(
    sorted(Object.keys(HEARD_BEFORE)),
    sorted(OVERRIDES.map((o) => o.key)),
    "every surface is accounted for",
  );
  const told = watchedTables();
  for (const o of OVERRIDES) {
    assert.deepEqual(sorted(o.refreshOnTables ?? []), sorted(HEARD_BEFORE[o.key]), `${o.key} hears what it heard`);
    for (const table of o.refreshOnTables ?? [])
      assert.ok(told.includes(table), `${o.key}: ${table} is told to a workspace`);
  }
});

test("what a surface hears and what it omits account for every table of the kinds it draws, and an omission says why", () => {
  for (const o of OVERRIDES) {
    const drawn = liveTablesOf(o.reads);
    const heard = o.refreshOnTables ?? [];
    const omitted = (o.omit ?? []).flatMap((group) => group.tables);
    if (o.fresh === "live" || o.fresh === "its-page") {
      assert.deepEqual(
        sorted([...heard, ...omitted]),
        sorted(drawn),
        `${o.key}: heard and omitted are the kinds' tables`,
      );
      assert.equal(
        new Set([...heard, ...omitted]).size,
        heard.length + omitted.length,
        `${o.key}: none both heard and omitted`,
      );
    } else assert.deepEqual(heard, [], `${o.key}: the feed tells it nothing`);
    for (const group of o.omit ?? []) {
      assert.ok(group.tables.length > 0, `${o.key}: an omission names a table`);
      assert.ok(group.why.trim().length > 20, `${o.key}: ${group.tables.join(", ")} says why it is not heard`);
    }
  }
});

test("a surface heard only on its page hears the tables it gave onlyOnItsPage there and keeps them elsewhere, and the rest wherever the tab is", () => {
  for (const o of OVERRIDES) {
    const page = ON_ITS_PAGE_BEFORE[o.key];
    const hearsEverywhere = (o.refreshOnTables ?? []).filter((t) => !page?.includes(t));
    assert.equal(o.fresh === "its-page", !!page, `${o.key}: its-page is what it had`);
    if (page) {
      const home = homeOf(o);
      assert.ok(home, `${o.key}: a page that owns it`);
      assert.equal(ownsTheScreen(o.key, AWAY), false, `${AWAY} is not ${o.key}'s page`);
      for (const table of page) {
        at(home);
        // Setup reads again for the first WhatsApp message alone, and not while it is unread (its own test, below).
        if (!(o.key === "setup" && (table === "messages" || table === "conversations")))
          assert.equal(hearsAny(o, table), true, `${o.key}: ${table} on ${home}`);
        at(AWAY);
        assert.equal(hearsAny(o, table), false, `${o.key}: ${table} is kept for its page on ${AWAY}`);
      }
    }
    at(AWAY);
    for (const table of hearsEverywhere) {
      // Setup reads again for a call that ends, not for one that starts (its own rule, setup.test.mjs).
      if (o.key === "setup" && table === "calls") continue;
      // An insert or an update: the Calendar hears a person changed, never one made (calendar/surface.ts).
      assert.equal(hearsAny(o, table), true, `${o.key}: ${table} is its own, heard wherever the tab is`);
    }
  }
  at("today");
});

test("Setup reads again for the first WhatsApp message alone: while the number is on and none has arrived, where its rows are drawn", async () => {
  // Start and Today's card draw it (the Activate, "not tried yet"); Connections draws Setup's calendar row and not the message.
  const setup = byKey("setup");
  const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const withWhatsapp = (whatsapp) =>
    setSurfaceValue("setup", { dto: { channels: { whatsapp, voice: { lastInboundAt: null } } } });
  const waiting = { present: true, active: true, number: "+15555550123", quality: null, lastInboundAt: null };
  try {
    for (const route of ["today", "start"]) {
      at(route);
      setSurfaceValue("setup", undefined);
      assert.equal(hears(setup, "messages"), false, `${route}: unread, nothing is known to wait for`);
      withWhatsapp(waiting);
      for (const table of ["messages", "conversations"]) {
        assert.equal(hears(setup, table), true, `${route}: ${table} made while the first is awaited`);
        assert.equal(
          wantsRefresh(setup, table, change(table, "UPDATE")),
          false,
          `${route}: ${table} changed is no first`,
        );
      }
      withWhatsapp({ ...waiting, lastInboundAt: "2026-10-13T12:00:00Z" });
      assert.equal(
        hears(setup, "messages"),
        false,
        `${route}: once one has arrived, a message is nothing Setup states`,
      );
      withWhatsapp({ ...waiting, active: false });
      assert.equal(hears(setup, "messages"), false, `${route}: a number switched off awaits nothing`);
    }
    // Elsewhere the first message is kept for Setup's pages, as its other page-only records are.
    withWhatsapp(waiting);
    for (const route of ["inbox", "admin/integrations"]) {
      at(route);
      assert.equal(hears(setup, "messages"), false, `${route}: kept for Setup's pages`);
    }
    // Connections hears what its calendar row draws of Setup: a settings save and a visit read.
    at("admin/integrations");
    for (const table of ["tenant_config", "appointments"])
      assert.equal(wantsRefresh(setup, table, change(table, "UPDATE")), true, `Connections: ${table}`);
  } finally {
    setSurfaceValue("setup", undefined);
    at("today");
  }
});

test("a surface the feed tells nothing is read where it is drawn after an age, or on its owner's own change", () => {
  const alerts = byKey("alerts");
  assert.deepEqual(alerts.fresh, { aged: ON_DEMAND_STALE_MIN }, "aged by the measure every on-demand read is held to");
  assert.equal(alerts.onDemand, true, "an aged surface is read where it is drawn");
  assert.equal(typeof alerts.isStale, "function");
  const partner = byKey("partner");
  assert.equal(partner.fresh, "own-change");
  for (const o of [alerts, partner]) {
    assert.deepEqual(o.reads, [], `${o.key} draws no record of the workspace's`);
    assert.equal(subscribesToRealtime(o), false, `${o.key} joins no feed`);
    for (const table of watchedTables())
      assert.equal(wantsRefresh(o, table, change(table)), false, `${o.key}: ${table}`);
  }
  // Every surface read after an age is one read only where it is drawn.
  for (const o of OVERRIDES.filter((x) => typeof x.fresh === "object")) assert.equal(o.onDemand, true, o.key);
});
