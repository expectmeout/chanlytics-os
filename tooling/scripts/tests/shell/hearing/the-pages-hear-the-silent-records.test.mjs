/**
 * The pages hear the records that were silent (docs/decisions/0047, task 2.2 of the wiring plan; F3a, F4, F5b, F7a-c, N3, S1-07,
 * S1-09, S1-13, S1-14, S1-19, S1-20).
 *
 * Nine tables a page draws a record from were on no feed (00408 puts them on it): the person (contacts), the business's facts
 * (tenant_config), the rules (policies), templates, the mailbox's pause on offers (mailboxes), a held booking email
 * (appointment_notices), the team (memberships, invitations) and the workspace's status (tenants). A teammate's rename, a save of the
 * hours, Replies turned to Ask first, Meta's answer to a template, a teammate who joined: each reached another open tab only at a
 * return or a reload. The surfaces that draw them now name them, and the heavy ones hear them as they hear a message: on their own
 * page, and once when it comes back (onlyOnItsPage).
 *
 * Run on the real overrides' rules, with the registry's own rule for what a page reads as it comes on screen, and the real Inbox and
 * workspace surfaces over a wire that answers the reads they make.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

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

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** What the wire answers by route, and how many times each was asked for. */
const answers = {};
const asked = new Map();
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const route = u.pathname.replace("/api/v1/", "");
  asked.set(route, (asked.get(route) ?? 0) + 1);
  const answer = answers[route];
  return answer
    ? json(200, { ok: true, data: typeof answer === "function" ? answer() : answer })
    : json(404, { ok: false, error: { code: "not_found", message: "no" } });
};

const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const { ownsTable, readWhatWasMissed } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { workspaceOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surface-data.ts");
const { settingsOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surfaces/settings.ts");
const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
const { inboxOverride } = await importSrc("apps/dashboard/src/surfaces/inbox/surface.ts");
const { conversationsOverride } = await importSrc("apps/dashboard/src/surfaces/inbox/conversations-surface.ts");
const { todayOverride } = await importSrc("apps/dashboard/src/surfaces/today/surface.ts");
const { peopleOverride } = await importSrc("apps/dashboard/src/surfaces/people/surface.ts");
const { playbooksOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");
const { broadcastsOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts");
const { audiencesOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/audiences-surface.ts");
const { calendarOverride } = await importSrc("apps/dashboard/src/surfaces/calendar/surface.ts");
const { reachOutsOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/reach-out/surface.ts");
const { reportsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { reportsHeadlineOverride } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");
const { reportsPeopleOverride } = await importSrc("apps/dashboard/src/surfaces/reports/people-surface.ts");
const { receptionistOverride } = await importSrc("apps/dashboard/src/surfaces/reports/receptionist-surface.ts");
const { reportsCampaignsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/campaigns-surface.ts");
const { reviewsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/reviews-surface.ts");

const EVENTS = ["INSERT", "UPDATE", "DELETE"];
const change = (table, event = "UPDATE") => ({ table, event, row: {} });
const at = (hash) => {
  globalThis.location.hash = hash;
};
const flush = async () => {
  for (let i = 0; i < 12; i += 1) {
    for (let j = 0; j < 20; j += 1) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};
/** Whether a surface asks to be read for this table, at the address on screen now. */
const hears = (o, table, event = "UPDATE") => wantsRefresh(o, table, change(table, event));

test("every table these pages name is one the database tells a workspace of (00408)", () => {
  const told = watchedTables();
  const named = [
    settingsOverride,
    workspaceOverride,
    inboxOverride,
    conversationsOverride,
    todayOverride,
    peopleOverride,
    playbooksOverride,
    broadcastsOverride,
    audiencesOverride,
    calendarOverride,
    reachOutsOverride,
    reportsOverride,
    reportsHeadlineOverride,
    reportsPeopleOverride,
    receptionistOverride,
  ].flatMap((o) => (o.refreshOnTables ?? []).map((table) => [o.key, table]));
  assert.deepEqual(
    named.filter(([, table]) => !told.includes(table)),
    [],
  );
  for (const table of [
    "contacts",
    "tenant_config",
    "policies",
    "templates",
    "mailboxes",
    "appointment_notices",
    "memberships",
    "invitations",
    "tenants",
  ])
    assert.ok(told.includes(table), `${table} is told`);
});

test("always heard, wherever the tab is: Settings its facts, rules, library and team; the workspace its seats and status; the Inbox, Conversations and Today the person; the Calendar its held emails and settings; the chains their replies", () => {
  const ALWAYS = [
    [settingsOverride, ["tenant_config", "policies", "templates", "memberships", "invitations"]],
    [workspaceOverride, ["memberships", "tenants"]],
    // The templates the Inbox's reply box offers are the settings read's (offered-templates.ts), which hears them: not the Inbox's.
    [inboxOverride, ["contacts"]],
    [conversationsOverride, ["contacts"]],
    [todayOverride, ["contacts"]],
    [calendarOverride, ["appointment_notices", "tenant_config"]],
    [reachOutsOverride, ["sequence_replies"]],
  ];
  for (const hash of ["#/today", "#/campaigns", "#/calendar", "#/admin/workspace", "#/clients"]) {
    at(hash);
    for (const [o, tables] of ALWAYS)
      for (const table of tables)
        for (const event of EVENTS)
          assert.equal(hears(o, table, event), true, `${o.key}: ${table} ${event} on ${hash}`);
  }
  // And each hears none of the others' news: the library is not the person, a seat is not a message.
  at("#/today");
  assert.equal(hears(settingsOverride, "messages", "INSERT"), false, "Settings draws no message");
  assert.equal(hears(settingsOverride, "contacts"), false, "nor a person");
  assert.equal(hears(workspaceOverride, "messages", "INSERT"), false, "the workspace list is no message's");
  assert.equal(hears(workspaceOverride, "tenant_config"), false, "nor the settings'");
  assert.equal(hears(conversationsOverride, "templates"), false, "Conversations draws no template");
  assert.equal(
    hears(inboxOverride, "templates"),
    false,
    "the Inbox asks for no template of its own: Settings' read tells it",
  );
  assert.equal(hears(inboxOverride, "tenant_config"), false, "the Inbox draws no settings");
  // The Inbox, Conversations and Today hear the messages they always did.
  for (const o of [inboxOverride, conversationsOverride, todayOverride])
    for (const table of ["messages", "conversations", "escalations"])
      assert.equal(hears(o, table, "INSERT"), true, `${o.key}: ${table}`);
  // Today draws the day's figures and its queue, and no hours: its five reads name no configuration. It draws whether a mailbox
  // exists, its email chip (R6: W-channel-team-plus-3).
  for (const table of ["tenant_config", "templates", "policies", "memberships"])
    assert.equal(hears(todayOverride, table), false, `Today draws no ${table}`);
  for (const event of ["INSERT", "UPDATE"])
    assert.equal(hears(todayOverride, "mailboxes", event), true, `a mailbox ${event}`);
});

/** The surfaces that hear a table only on their own page, and where that is: [override, its page, a page that is not, the tables]. */
const ON_ITS_PAGE = [
  [
    peopleOverride,
    "#/clients",
    "#/calendar",
    // The text line and the mailbox its reach is counted against (R6: S3-3, W-channel-team-plus-3).
    [
      "contacts",
      "sequence_steps",
      "tenant_channels",
      "lines",
      "mailboxes",
      "billing_accounts",
      "policies",
      "templates",
      "tenant_config",
    ],
  ],
  // The playbooks on their own page, Campaigns' old address, since the composer's Every time went (the closed-loop audit of
  // 17 Oct 2026, G).
  [playbooksOverride, "#/outbound", "#/inbox", ["contacts", "templates", "mailboxes", "policies", "tenant_config"]],
  // Who each audience Sent's composer offers reaches (audiences-surface.ts), with the settings read's messages (offered-templates.ts):
  // it hears every other table the playbooks do. Away is the Inbox: Campaigns' composer hears these for the audiences too
  // (PAGE_HEARS, a cell of kinds; the test below).
  [audiencesOverride, "#/broadcasts", "#/inbox", ["contacts", "mailboxes", "policies", "tenant_config"]],
  [reportsOverride, "#/reports", "#/inbox", ["contacts"]],
  [reportsHeadlineOverride, "#/today", "#/inbox", ["contacts"]],
  [reportsPeopleOverride, "#/reports/people", "#/inbox", ["contacts", "tenant_config"]],
  [receptionistOverride, "#/reports/receptionist", "#/inbox", ["contacts", "tenant_config"]],
];

test("the heavy pages hear them on their own page alone: People, the playbooks, the audiences and the Reports lenses", () => {
  for (const [o, home, away, tables] of ON_ITS_PAGE)
    for (const table of tables) {
      at(home);
      for (const event of EVENTS) assert.equal(hears(o, table, event), true, `${o.key}: ${table} ${event} on ${home}`);
      at(away);
      assert.equal(hears(o, table), false, `${o.key}: ${table} is kept for its page on ${away}`);
    }
  at("#/today");
});

test("what a heavy page let pass is read once as it comes on screen: a teammate's rename, a save of the settings, a template", () => {
  const win = {
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  for (const [o, home, away, tables] of ON_ITS_PAGE.slice(0, 3)) {
    for (const table of tables) {
      at(away);
      const read = [];
      const stop = readWhatWasMissed([o], (keys) => read.push(...keys), win);
      try {
        assert.equal(hears(o, table), false, `${o.key}: ${table} passes by on ${away}`);
        at(home);
        win.on?.();
        assert.deepEqual(read, [o.key], `${o.key}: ${table} is read once as ${home} comes on screen`);
        at(away);
        win.on?.();
        at(home);
        win.on?.();
        assert.deepEqual(read, [o.key], `${o.key}: and once: the next arrival reads nothing new`);
      } finally {
        stop();
      }
    }
  }
  at("#/today");
});

test("each keeps the tables it had: People its own, the composers their runs and playbooks, whatever page the tab is on", () => {
  at("#/today");
  for (const table of ["deals", "person_notes", "segments", "segment_members", "appointments"])
    assert.equal(hears(peopleOverride, table), true, `People: ${table}`);
  assert.equal(hears(broadcastsOverride, "sequence_batches"), true, "Sent's runs");
  assert.equal(hears(playbooksOverride, "sequence_batches"), true, "the playbooks' runs");
  assert.equal(hears(playbooksOverride, "sequence_steps"), true, "and the playbooks themselves");
  // A message is still a page's own to hear.
  assert.equal(hears(peopleOverride, "messages", "INSERT"), false, "People: a message passes by off its page");
  at("#/clients");
  assert.equal(hears(peopleOverride, "messages", "INSERT"), true, "and is heard on it");
  at("#/today");
});

test("the Reports pages that count people hear the book; the lenses that count no person do not", () => {
  // The Campaigns lens counts the yeses and stops, columns of the people: a person's answer moved is heard on the lens, a person
  // made is no answer (the wiring's second audit, W-person-list-lead-8).
  at("#/reports/campaigns");
  assert.equal(hears(reportsCampaignsOverride, "contacts"), true, "the Campaigns lens: an answer moved");
  assert.equal(hears(reportsCampaignsOverride, "contacts", "INSERT"), false, "and not a person made");
  at("#/reports/reviews");
  assert.equal(hears(reviewsOverride, "contacts"), false, "the Reviews lens counts reviews");
  assert.equal(hears(reviewsOverride, "tenant_config"), false);
  at("#/today");
});

test("the Inbox asks for no template: a person's change is its own to hear, a template's is Settings', which the picker is made of (templates-are-read-once.test.mjs)", async () => {
  Object.assign(answers, { conversations: { conversations: [] }, escalations: { escalations: [] } });
  at("#/inbox");
  const templates = () => asked.get("templates") ?? 0;
  await inboxOverride.apply();
  assert.equal(templates(), 0, "the Inbox's read asks for no templates");
  assert.equal(
    wantsRefresh(inboxOverride, "contacts", change("contacts")),
    true,
    "a person's change moves the thread heads",
  );
  assert.equal(
    wantsRefresh(inboxOverride, "templates", change("templates")),
    false,
    "a template's is not the Inbox's to hear",
  );
  assert.equal(wantsRefresh(settingsOverride, "templates", change("templates")), true, "it is Settings'");
});

test("a member whose seat in the workspace on screen is gone is sent to one of their others, or to the front door where they have none", async () => {
  const replaced = [];
  const was = globalThis.location.replace;
  globalThis.location.replace = (to) => replaced.push(to);
  const w = globalThis;
  const ws = (slug) => ({ id: `id-${slug}`, slug, name: slug, status: "active", timezone: "UTC" });
  const user = { id: "u1", email: "member@example.com" };
  try {
    // The tab's first read: it holds no list yet, and the one it brings holds the workspace it shows. Nothing is sent anywhere.
    w.__WORKSPACES = undefined;
    w.__ACTIVE_WORKSPACE = undefined;
    answers.workspaces = { workspaces: [ws("a"), ws("b")], activeWorkspaceId: "id-a", user };
    await workspaceOverride.apply();
    assert.deepEqual(replaced, [], "the first read has no seat to have lost");
    assert.equal(w.__ACTIVE_WORKSPACE, "id-a");

    // A teammate removes their seat in A: the memberships notice makes the next read, and the list no longer holds A.
    answers.workspaces = { workspaces: [ws("b")], activeWorkspaceId: "id-b", user };
    await workspaceOverride.apply();
    assert.deepEqual(replaced, ["/w/b"], "to the workspace the server calls theirs now");

    // A member of nothing else: the front door, which shows them none.
    replaced.length = 0;
    w.__WORKSPACES = [ws("a"), ws("b")];
    w.__ACTIVE_WORKSPACE = "id-a";
    answers.workspaces = { workspaces: [], activeWorkspaceId: null, user };
    await workspaceOverride.apply();
    assert.deepEqual(replaced, ["/"]);

    // A role changed, the seat kept: the read lands, the tab stays, and it is told the new role.
    replaced.length = 0;
    w.__WORKSPACES = [ws("a"), ws("b")];
    w.__ACTIVE_WORKSPACE = "id-a";
    answers.workspaces = {
      workspaces: [ws("a"), ws("b")],
      activeWorkspaceId: "id-a",
      user: { ...user, role: "viewer" },
    };
    await workspaceOverride.apply();
    assert.deepEqual(replaced, [], "a seat that stands is no reason to leave");
    assert.equal(w.__ME.role, "viewer");
  } finally {
    globalThis.location.replace = was;
    await flush();
  }
});

test("in Campaigns' composer the audiences hear what moves them there, a person, a channel, the rules, the facts, the plan, a visit, and leave a message to Sent; what passed is read where it is owned", () => {
  // The composer draws who each audience reaches for who can hear you and the send-once composer, and Sent's runs for the pause on
  // offers and the Send by ticks (the wiring's second audit, W-review-facts-rules-2): a STOP, a number Meta flagged or a rule saved
  // moved them nowhere while it was open. A message moves a run's replies, which the composer reads from Campaigns' own 30 days: it
  // is Sent's, as it was. Campaigns' landing, Sequences' list, draws neither: there they are kept for the pages that draw them.
  assert.equal(
    ownsTable("audiences", "contacts", "campaigns"),
    false,
    "Campaigns' landing keeps a person for Sent's pages",
  );
  at("#/campaigns/new");
  for (const table of [
    "contacts",
    "tenant_channels",
    "lines",
    "mailboxes",
    "billing_accounts",
    "policies",
    "tenant_config",
    "appointments",
  ])
    assert.equal(hears(audiencesOverride, table), true, `audiences: ${table} in the composer`);
  // Sent's runs, there, hear what their Send by ticks and the month are worded from, and nothing of People.
  for (const table of ["tenant_channels", "lines", "mailboxes", "billing_accounts", "tenant_config"])
    assert.equal(hears(broadcastsOverride, table), true, `broadcasts: ${table} in the composer`);
  assert.equal(hears(broadcastsOverride, "contacts"), false, "Sent's runs read no one");
  for (const [table, event] of [
    ["messages", "INSERT"],
    ["conversations", "UPDATE"],
    ["escalations", "INSERT"],
  ]) {
    assert.equal(hears(audiencesOverride, table, event), false, `audiences: ${table} waits for Sent`);
    assert.equal(hears(broadcastsOverride, table, event), false, `broadcasts: ${table} waits for Sent`);
  }
  const win = {
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  const read = [];
  const stop = readWhatWasMissed([audiencesOverride], (keys) => read.push(...keys), win);
  try {
    hears(audiencesOverride, "messages", "INSERT");
    at("#/inbox");
    win.on?.();
    at("#/campaigns/new");
    win.on?.();
    assert.deepEqual(
      read,
      [],
      "a message the composer let pass is not read as it comes back: it moves nothing drawn there",
    );
    at("#/broadcasts");
    win.on?.();
    assert.deepEqual(read, ["audiences"], "it is read once as Sent comes on screen");
    at("#/inbox");
    hears(audiencesOverride, "contacts");
    at("#/campaigns/new");
    win.on?.();
    assert.deepEqual(
      read,
      ["audiences", "audiences"],
      "a person's answer passed on the Inbox is read as the composer comes back",
    );
  } finally {
    stop();
    at("#/today");
  }
});
