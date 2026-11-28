/**
 * The bell, the activity log, the channels and the autonomy matrix for the page; the templates for the composers,
 * Settings and Ask, the message chosen among its rows; and what campaigns.messages, journey, playbooks and
 * calendar.room say.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freeWindows, PLAYBOOK_CARD_WORDS } from "@chanlytics/contracts";
import { journeyGuide } from "../../../apps/dashboard/src/server/ask/journey/guide.ts";
import {
  A,
  B,
  DAY,
  EM1,
  EM2,
  EM3,
  LIFE_NOW,
  LIST_ARCHIVED,
  LIST_GONE,
  LIST_HAND,
  LIST_NAMING,
  LIST_RULE,
  N1,
  N2,
  N4,
  ONE_ICS,
  PB1,
  PB2,
  ROOM_HOURS,
  ROOM_ICS,
  ROOM_NOW,
  SEEN,
  TEMPLATES_ALL_ASKED,
  TP1,
  TP2,
  TP3,
  TP4,
  TP9,
  USER,
  activityReader,
  activityRoute,
  activityWorld,
  asked,
  audiencePoolOf,
  autonomy,
  calCtx,
  calProfile,
  calTables,
  channelsReader,
  channelsRoute,
  channelsWorld,
  countsWorld,
  dayCtx,
  findPoolList,
  kernel,
  listsPoolWorld,
  listsReader,
  logged,
  matrixWorld,
  memberIn,
  messagesOfRead,
  newToolContext,
  notificationsReader,
  notificationsRoute,
  notificationsWorld,
  ownRow,
  pagedPeople,
  pbRow,
  policies,
  policiesRoute,
  poolPerson,
  req,
  roomTables,
  runTool,
  selects,
  slotsOf,
  sumOpen,
  templatesReader,
  templatesRoute,
  templatesWorld,
  tplRow,
  turnIn,
  usageWorld,
  withFeed,
  worldCtx,
} from "./_readers.mjs";

test("the notifications, for the page: GET notifications answers its reader's payload over reads-routes' fixture in both workspaces -- the month's rows newest first, each with this person's own marks, and when they last opened the bell -- the thirty days counted back from the turn's clock; the marks read only for the rows listed, and only this person's: another person's mark is not mine, my own dismissal is", async () => {
  const today = Date.now();
  for (const [tenant, ids, seen] of [
    [A, [N1, N2], "2026-09-10T12:00:00Z"],
    [B, [N4], null],
  ]) {
    const page = await notificationsRoute.GET.run(req(`?workspace=${tenant}`), dayCtx(notificationsWorld(today)));
    const r = await kernel.load(turnIn(dayCtx(notificationsWorld(today)), tenant), notificationsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual([r.data.notifications.map((n) => n.id), r.data.seen_at], [ids, seen]);
    assert.deepEqual(r.rows, []);
  }
  // On the turn's clock: my own dismissal of N1 beside another person's mark on it, my read of N2.
  const NOW = Date.parse("2026-09-20T12:00:00Z");
  const mine = [{ notification_id: N1, user_id: USER, read_at: null, dismissed_at: new Date(NOW).toISOString() }];
  const ctx = dayCtx(notificationsWorld(NOW, { mine }));
  const r = await kernel.load(memberIn(ctx, A, "viewer", new Date(NOW)), notificationsReader, undefined);
  assert.deepEqual(
    r.data.notifications.map((n) => [n.id, n.read, n.dismissed]),
    [
      [N1, false, true],
      [N2, true, false],
    ],
    "this person's marks ride on each row: my dismissal of N1, my read of N2; another person's read of N1 is not mine",
  );
  assert.deepEqual(asked(ctx), ["notification_reads.select", "notifications.select", "notification_marks.select"]);
  const [rows] = selects(ctx, "notifications");
  assert.deepEqual(
    rows.filters.find(([op]) => op === "gte"),
    ["gte", "created_at", new Date(NOW - 30 * DAY).toISOString()],
    "thirty days back from the turn's clock",
  );
  const [marks] = selects(ctx, "notification_marks");
  assert.deepEqual(
    marks.filters,
    [
      ["eq", "user_id", USER],
      ["in", "notification_id", [N1, N2]],
    ],
    "my marks, for the rows listed and no others",
  );
  // Four weeks on, the month reaches back two days: only yesterday's row is still in it.
  const later = await kernel.load(
    memberIn(dayCtx(notificationsWorld(NOW)), A, "viewer", new Date(NOW + 28 * DAY)),
    notificationsReader,
    undefined,
  );
  assert.deepEqual(
    later.data.notifications.map((n) => n.id),
    [N1],
  );
  // No row this month: no mark is read at all.
  const quiet = dayCtx(notificationsWorld(NOW, { rows: [] }));
  const none = await kernel.load(turnIn(quiet), notificationsReader, undefined);
  assert.deepEqual(none.data, { notifications: [], seen_at: "2026-09-10T12:00:00Z", read_through_at: null, unread: 0 });
  assert.deepEqual(asked(quiet), ["notification_reads.select", "notifications.select"]);
});

test("the bell's read lists its newest sixty and counts the unread rows past them, less the ones the server closed (00421)", async () => {
  const NOW = Date.parse("2026-09-20T12:00:00Z");
  const many = Array.from({ length: 62 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    tenant_id: A,
    kind: "alert",
    title: `Row ${i}`,
    body: "…",
    route: null,
    subject_type: null,
    subject_id: null,
    recipient_user_id: null,
    created_at: new Date(NOW - (i + 1) * 3_600_000).toISOString(),
    closed_at: i === 61 ? new Date(NOW).toISOString() : null,
  }));
  const r = await kernel.load(
    memberIn(dayCtx(notificationsWorld(NOW, { rows: many })), A, "viewer", new Date(NOW)),
    notificationsReader,
    undefined,
  );
  assert.equal(r.data.notifications.length, 60, "the newest sixty, listed");
  assert.equal(
    r.data.unread,
    61,
    "the sixty listed and the sixty-first, past the list; the sixty-second was closed when what it asked for ended",
  );
  assert.equal(r.data.notifications[0].closed_at, null, "each listed row says whether the server closed it");
});

test("the activity log, for the page: GET activity answers its reader's payload over activity.test.mjs's fixture -- both ledgers newest first, the noise left out, the actors named -- with a filter handed in as the route parsed it: none, a person, a day by the workspace's clock; the route keeps the owner's door and the reader trusts its caller; not a row a citation names", async () => {
  const w = activityWorld();
  for (const [q, filter, ids] of [
    ["", {}, ["e-e5", "d-d3", "d-d2", "e-e1", "d-d1", "e-e4"]],
    [`&person=${w.person}`, { person: w.person }, ["d-d2", "d-d1", "e-e4"]],
    ["&day=2026-09-11", { day: "2026-09-11" }, ["d-d3", "d-d2", "e-e1", "d-d1"]],
  ]) {
    const routed = worldCtx(w);
    const page = await activityRoute.GET.run(req(`?workspace=${A}${q}`), routed);
    const ctx = worldCtx(w);
    const r = await kernel.load(memberIn(ctx, A, "owner"), activityReader, filter);
    assert.deepEqual(r.data, page, `the route's payload: ${q || "no filter"}`);
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(
      r.data.rows.map((x) => x.id),
      ids,
    );
    assert.deepEqual(r.rows, []);
    assert.deepEqual(asked(routed), ["memberships.select", ...asked(ctx)], "the workspace's door, then the same reads");
  }
  assert.deepEqual(activityRoute.GET.policy.role, "owner", "the owner's door is the route's");
});

test("the channels, for the page and for Ask: GET channels answers its reader's payload over reads-routes' fixture -- the named workspace's rows by kind, when each last heard from a customer, and the quality Meta assigned the WhatsApp number, from its config -- the last message, the last call and the rows asked at once, as the route asked them; not a row a citation names", async () => {
  for (const tenant of [A, B]) {
    const page = await channelsRoute.GET.run(req(`?workspace=${tenant}`), dayCtx(channelsWorld()));
    const ctx = dayCtx(channelsWorld());
    const r = await kernel.load(turnIn(ctx, tenant), channelsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(r.rows, []);
    assert.deepEqual(asked(ctx), ["messages.select", "calls.select", "tenant_channels.select"]);
  }
  const harbor = (await kernel.load(turnIn(dayCtx(channelsWorld())), channelsReader, undefined)).data;
  assert.deepEqual(
    harbor.channels.map((c) => [c.id, c.kind, c.quality, c.messaging_limit]),
    [["ch1", "whatsapp", "GREEN", "TIER_1K"]],
  );
  assert.deepEqual(Object.keys(harbor.channels[0]), [
    "id",
    "kind",
    "number_e164",
    "status",
    "created_at",
    "last_inbound_at",
    "quality",
    "quality_event",
    "messaging_limit",
    "quality_at",
    "standing",
    "standing_read_at",
    // When the number first connected (#1541), which the toast and the row try its link by.
    "connected_at",
  ]);
  // When each last heard from a customer: WhatsApp's last inbound message, the line's last inbound call.
  const heard = channelsWorld({
    tenant_channels: [
      ...channelsWorld().tenant_channels,
      {
        id: "ch3",
        tenant_id: A,
        kind: "voice",
        number_e164: "+13055550197",
        status: "active",
        created_at: "2026-08-02T00:00:00Z",
        config: null,
      },
    ],
    messages: [
      {
        tenant_id: A,
        direction: "inbound",
        channel: "whatsapp",
        channel_ts: "2026-09-20T10:00:00Z",
        created_at: "2026-09-20T10:00:01Z",
      },
    ],
    calls: [{ tenant_id: A, direction: "inbound", started_at: "2026-09-19T10:00:00Z" }],
  });
  const r = await kernel.load(turnIn(dayCtx(heard)), channelsReader, undefined);
  assert.deepEqual(r.data, await channelsRoute.GET.run(req(`?workspace=${A}`), dayCtx(heard)));
  assert.deepEqual(
    r.data.channels.map((c) => [c.kind, c.last_inbound_at]),
    [
      ["voice", "2026-09-19T10:00:00Z"],
      ["whatsapp", "2026-09-20T10:00:00Z"],
    ],
    "by kind, each with when it last heard from a customer",
  );
});

test("the channels carry what Meta holds about the WhatsApp number, as the edge kept it on the row's config, and when it was read: read back as held, so a config that holds no standing says none -- the page's route says the same as the reader, byte for byte", async () => {
  const held = {
    can_send: "BLOCKED",
    problems: [
      {
        entity: "WABA",
        code: 141006,
        said: "A payment method is required to send messages",
        fix: "Add a payment method in WhatsApp Manager",
      },
    ],
    notes: [],
    name: "Harbor Moving",
    name_status: "APPROVED",
    verification: "not_verified",
    limit: "TIER_250",
    has_payment_method: false,
    owner_business_id: "410540000000001",
    waba_id: "205540000000001",
  };
  const world = (config) =>
    channelsWorld({
      tenant_channels: [{ ...channelsWorld().tenant_channels[0], config }, channelsWorld().tenant_channels[1]],
    });
  const first = async (config) =>
    (await kernel.load(turnIn(dayCtx(world(config))), channelsReader, undefined)).data.channels[0];
  const stamped = { quality_rating: "GREEN", standing: held, standing_read_at: "2026-10-06T14:55:00Z" };
  const ok = await first(stamped);
  assert.deepEqual([ok.standing, ok.standing_read_at, ok.quality], [held, "2026-10-06T14:55:00Z", "GREEN"]);
  const page = await channelsRoute.GET.run(req(`?workspace=${A}`), dayCtx(world(stamped)));
  assert.equal(JSON.stringify(page.channels[0]), JSON.stringify(ok), "the route says what the reader says");
  for (const standing of [undefined, null, "BLOCKED", [], {}, { can_send: "" }, { problems: [] }]) {
    const c = await first({ standing });
    assert.deepEqual([c.standing, c.standing_read_at], [null, null], JSON.stringify(standing));
  }
  assert.equal(
    channelsRoute.GET.policy.role,
    null,
    "every member reads it, as they read the quality: the policy is the route's and is not changed",
  );
});

test("the autonomy matrix, for the page: GET policies answers its reader's payload over settings-routes' fixture in both workspaces -- the workspace's own rows by class, never a person's, the reader's role, -- the rows through the turn's reader, fresh on every request; a turn that holds them reads them no more", async () => {
  for (const [tenant, role, classes] of [
    [A, "viewer", ["money", "reply"]],
    [B, "operator", ["booking", "reply"]],
  ]) {
    const page = await policiesRoute.GET.run(req(`?workspace=${tenant}`), dayCtx(matrixWorld()));
    const ctx = dayCtx(matrixWorld());
    const r = await kernel.load(memberIn(ctx, tenant, role), autonomy, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(Object.keys(r.data), [
      "policies",
      "role",
      "held",
      "suggestions",
      "own_modes",
      "reply_tokens",
      "evidence",
      "weeks_approved",
    ]);
    assert.deepEqual(
      [r.data.policies.map((p) => p.class), r.data.role],
      [classes, role],
      "the workspace's rows, by class; a person's own row is not the matrix",
    );
    assert.deepEqual(r.rows, []);
    // And what the owner's corrections show (decision 0063): the held drafts are a function, the suggestions a table;
    // the people set differently (item 10, 18 Oct 2026): their rows, then the names of the newest; and the week's
    // replies, which say the day's budget in replies (item 12); and the weeks approved, AI's suggested rung's record (00714).
    assert.deepEqual(
      asked(ctx),
      ["policies.select", "fact_suggestions.select", "policies.select", "events.select", "content_plans.select"].concat(
        tenant === A ? ["contacts.select"] : [],
      ),
    );
    assert.deepEqual(
      r.data.reply_tokens,
      tenant === A ? { replies: 2, tokens: 2500 } : { replies: 1, tokens: 500 },
      "the workspace's own replies of the last seven days, in and out; nothing older, and no other kind",
    );
  }
  // A week that could not be read says so, and the rest of the page stands: the dial says tokens.
  const down = await kernel.load(
    memberIn(dayCtx(matrixWorld(), { faults: { "events.select": { message: "down" } } }), A, "viewer"),
    autonomy,
    undefined,
  );
  assert.equal(down.data.reply_tokens, null);
  assert.equal(down.data.policies.length, 2);
  // A person's own row is counted and named on Replies' line, by their workspace alone.
  const own = await kernel.load(memberIn(dayCtx(matrixWorld()), A, "viewer"), autonomy, undefined);
  assert.deepEqual(own.data.own_modes, {
    total: 1,
    by_mode: { auto: 0, ask: 0, never: 1 },
    named: [{ id: "k1", name: "Dana Reyes", mode: "never" }],
  });
  const none = await kernel.load(memberIn(dayCtx(matrixWorld()), B, "operator"), autonomy, undefined);
  assert.deepEqual(none.data.own_modes, { total: 0, by_mode: { auto: 0, ask: 0, never: 0 }, named: [] });
  // A route keeps nothing: the same request twice reads the matrix twice.
  const twice = dayCtx(matrixWorld());
  await policiesRoute.GET.run(req(`?workspace=${A}`), twice);
  await policiesRoute.GET.run(req(`?workspace=${A}`), twice);
  assert.equal(selects(twice, "policies").length, 4, "fresh on every request: the matrix and the people set apart");
  // A turn that holds the rows (workspace.settings, campaigns.playbooks) reads them no more.
  const turn = memberIn(dayCtx(matrixWorld()), A, "viewer");
  await kernel.load(turn, policies, undefined);
  const held = turn.ctx.supabase.seen.length;
  await kernel.load(turn, autonomy, undefined);
  // What it reads beyond them is the learning loop's own (decision 0063), the held drafts and the notes waiting, and the
  // people set differently: their rows and their names.
  const beyond = turn.ctx.supabase.seen.slice(held);
  assert.ok(
    beyond.every(
      (q) =>
        q.table === "fact_suggestions" ||
        q.rpc === "held_drafts_by_intent" ||
        q.table === "contacts" ||
        q.table === "events" ||
        // The weeks approved (00714), the record AI's suggested rung reads.
        q.table === "content_plans" ||
        (q.table === "policies" && JSON.stringify(q).includes("contact")),
    ),
    "the turn's own reads",
  );
});

test("the templates, for the composers, Settings and Ask: GET templates answers its reader's payload over outbound-routes' fixtures, `all` as the route parses it -- the composers' read the approved and unhidden alone, each row the message as the customer receives it and why this product cannot send it, and nothing more read; Settings' every template, with what sends each and how many went out -- and each template a row a citation names, with no address of its own: it opens the page it came from", async () => {
  for (const [q, all, names, keys, reads] of [
    // `held`: what the composers' read left out, counted by why, so an empty picker can say it (contracts noTemplateWords).
    ["", false, ["visit_reminder", "offer"], ["templates", "held", "messages", "booking"], ["templates.select"]],
    [
      "&all=1",
      true,
      ["hello_world", "offer", "visit_reminder"],
      ["templates", "held", "messages", "booking", "used_by", "sends"],
      TEMPLATES_ALL_ASKED,
    ],
    ["&all=0", false, ["visit_reminder", "offer"], ["templates", "held", "messages", "booking"], ["templates.select"]],
  ]) {
    const routed = dayCtx(templatesWorld());
    const page = await templatesRoute.GET.run(req(`?workspace=${B}${q}`), routed);
    const ctx = dayCtx(templatesWorld());
    const r = await kernel.load(turnIn(ctx, B), templatesReader, { all });
    assert.deepEqual(r.data, page, `the route's payload: ${q || "the composers'"}`);
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(
      [Object.keys(r.data), r.data.templates.map((t) => t.name)],
      [keys, names],
      "the composers see the approved and unhidden, and what WhatsApp is still checking; Settings sees everything, by name",
    );
    assert.deepEqual(
      r.rows,
      r.data.templates.map((t) => ({
        kind: "template",
        id: t.id,
        route: `campaigns/messages/${t.name}`,
        label: t.title || t.name,
      })),
      "a template opens its own message in the Library, from Settings' read and the composers' alike (W-campaign-run-template-reachout-6)",
    );
    assert.deepEqual(asked(ctx), reads);
    assert.deepEqual(asked(routed), ["memberships.select", ...reads], "the workspace's door, then the same reads");
  }
  // The row as the composers get it: its category (a marketing template goes only to a yes to offers) and its title,
  // the heading, footer and buttons out of Meta's array, and why it can't go from here -- never the array itself.
  const [reminder] = (await kernel.load(turnIn(dayCtx(templatesWorld()), B), templatesReader, { all: false })).data
    .templates;
  assert.deepEqual(
    [reminder.category, reminder.title, reminder.header, reminder.footer, reminder.buttons, reminder.blocked],
    [
      "utility",
      "Visit reminder",
      "Your visit",
      "Reply STOP to opt out",
      [{ text: "Book", kind: "url" }],
      "a button that takes a value",
    ],
  );
  assert.equal("components" in reminder, false, "Meta's array stays behind");
  const settingsRead = (await kernel.load(turnIn(dayCtx(templatesWorld()), B), templatesReader, { all: true })).data;
  assert.equal(settingsRead.templates.find((t) => t.name === "offer").category, "marketing");
  // What sends each, and how many went out: outbound-routes' shape, the route's payload.
  const usage = dayCtx(usageWorld());
  const u = await kernel.load(turnIn(usage, B), templatesReader, { all: true });
  assert.deepEqual(u.data, await templatesRoute.GET.run(req(`?workspace=${B}&all=1`), dayCtx(usageWorld())));
  assert.deepEqual(
    [u.data.used_by.winback_offer.playbooks.map((p) => [p.name, p.paused]), u.data.used_by.winback_offer.broadcasts],
    [
      [
        ["Win-back", false],
        ["Second wind", true],
      ],
      1,
    ],
    "both playbooks, which is paused, and the one run a person sent: a playbook's own run is not a second broadcast",
  );
  assert.deepEqual(u.data.sends.winback_offer, { count: 2, last_at: "2026-09-17T14:00:00Z" });
  assert.equal(u.data.used_by.elsewhere, undefined, "another workspace's are not this one's");
});

test("GET templates names the call's text it finds among every WhatsApp row, a hidden one too, as the edge texts it: Campaigns' home keeps today's lookup without Settings' read", async () => {
  const w = usageWorld();
  w.templates = w.templates.map((t) => (t.name === "booking_link" ? { ...t, hidden_at: "2026-09-01T00:00:00Z" } : t));
  const r = await kernel.load(turnIn(dayCtx(w), B), templatesReader, { all: false });
  assert.equal(
    r.data.templates.some((t) => t.name === "booking_link"),
    false,
    "the composers are not offered it",
  );
  assert.equal(r.data.booking?.name, "booking_link", "and the phone agent still texts it after a call");
  // A workspace with no WhatsApp row that carries the booking link answers none.
  const none = usageWorld();
  none.templates = none.templates.filter((t) => t.channel !== "whatsapp");
  assert.equal((await kernel.load(turnIn(dayCtx(none), B), templatesReader, { all: false })).data.booking, null);
});

test("the read answers one message for a WhatsApp version in review and the approved email of its name and language, its standing kept inside it, and hands the composers the version being checked beside the email", async () => {
  const rows = [
    tplRow(TP1, B, {
      name: "winback_offer",
      meta_status: "pending",
      category: "marketing",
      variables: [{ position: 1 }],
    }),
    ownRow(EM1, "email", { name: "winback_offer", category: "marketing", variables: [{ position: 1 }] }),
  ];
  for (const all of [false, true]) {
    const data = await messagesOfRead(rows, all);
    assert.equal(data.messages.length, 1, `one message, not a row for each version (all: ${all})`);
    const [message] = data.messages;
    assert.equal(message.name, "winback_offer");
    assert.equal(message.versions.whatsapp?.status, "pending", "the version in review keeps its status");
    assert.equal(message.versions.whatsapp?.id, TP1);
    assert.equal(message.versions.email?.id, EM1);
    assert.equal(message.versions.sms, null);
    assert.equal(message.offered, true, "the email version is one the message can be sent on");
    assert.deepEqual(
      [message.anchor, message.category, message.slots],
      [{ id: TP1, channel: "whatsapp" }, "marketing", 1],
      "Meta's row anchors it and gives it its category, whatever its status",
    );
    // The composers' rows hold the version WhatsApp is still checking too (the one picker rule); Settings' every row.
    assert.deepEqual(
      data.templates.map((t) => t.id),
      all ? [TP1, EM1] : [EM1, TP1],
    );
    assert.deepEqual(
      data.held,
      { pending: 1, rejected: 0, paused: 0, disabled: 0, hidden: 0 },
      "what the list left out",
    );
  }
  // A WhatsApp version in review alone is a message, and one the composers offer now (the one picker rule).
  const alone = (await messagesOfRead([rows[0]])).messages;
  assert.deepEqual(
    alone.map((m) => [m.name, m.offered, m.versions.whatsapp?.status, m.versions.email]),
    [["winback_offer", true, "pending", null]],
  );
});

test("the read answers a message with no WhatsApp row, one a name and language, in the order its rows appear; a hidden one and a reach-out's email are not offered or not messages", async () => {
  const data = await messagesOfRead([
    ownRow(EM1, "email", { name: "harbor_note", language: "en_US", category: "utility" }),
    ownRow(EM2, "sms", { name: "harbor_note", language: "en_US", category: "utility" }),
    ownRow(EM3, "email", {
      name: "harbor_note",
      language: "es_MX",
      category: "utility",
      hidden_at: "2026-09-01T00:00:00Z",
    }),
    ownRow(TP3, "email", { name: "reach_out_0a1b2c3d4e5f60718293a4b5c6d7e8f9", language: "en" }),
  ]);
  assert.deepEqual(
    data.messages.map((m) => [m.name, m.language, m.anchor.channel, m.hidden, m.offered, m.versions.whatsapp]),
    [
      ["harbor_note", "en_US", "email", false, true, null],
      ["harbor_note", "es_MX", "email", true, false, null],
    ],
    "a reach-out's email belongs to no message; the hidden language is a message the pickers do not list",
  );
  assert.deepEqual(
    data.messages.map((m) => m.versions.sms?.id ?? null),
    [EM2, null],
    "the text beside the email",
  );
});

test("an email whose subject holds a value is not blocked, and a WhatsApp row with a document for a heading still is: blocked is judged on a WhatsApp row alone", async () => {
  const HEADING = [
    { type: "HEADER", format: "TEXT", text: "Hi {{1}}" },
    { type: "BODY", text: "Hi {{1}}" },
  ];
  const data = await messagesOfRead(
    [
      ownRow(EM1, "email", { name: "subject_note", components: HEADING }),
      ownRow(EM2, "sms", { name: "subject_note" }),
      tplRow(TP1, B, {
        name: "pdf_note",
        components: [
          { type: "HEADER", format: "DOCUMENT" },
          { type: "BODY", text: "Hi" },
        ],
      }),
      // The same heading on Meta's array is "a heading that takes a value": WhatsApp's row is held, the email's is not.
      tplRow(TP2, B, { name: "subject_note", components: HEADING }),
    ],
    true,
  );
  const blockedOf = (id) => data.templates.find((t) => t.id === id).blocked;
  assert.equal(blockedOf(EM1), null, "an email's subject may take a value");
  assert.equal(blockedOf(EM2), null, "a text has none to judge");
  assert.equal(blockedOf(TP1), "a document for a heading", "WhatsApp's row is still judged");
  assert.equal(blockedOf(TP2), "a heading that takes a value");
  // The message holds the email whatever its WhatsApp version is held for.
  const subject = data.messages.find((m) => m.name === "subject_note");
  assert.equal(subject.versions.whatsapp?.blocked, "a heading that takes a value");
  assert.equal(subject.versions.email?.id, EM1);
  assert.equal(subject.offered, true, "by its email and its text");
  assert.equal(data.messages.find((m) => m.name === "pdf_note").offered, false, "a WhatsApp row alone it cannot send");
});

test("the booking message is chosen among WhatsApp rows alone: an email named like the booking starter is not it", async () => {
  const KEPT = "booking_link";
  const world = [
    // The call's text, as an email: the starter the call prefers, on the wrong channel.
    ownRow(EM1, "email", { name: "call_text", variables: [{ position: 1 }, { position: 2 }, { position: 3 }] }),
    tplRow(TP4, B, { name: KEPT, variables: [{ position: 1 }, { position: 2 }, { position: 3 }] }),
  ];
  const { used_by: usedBy } = await messagesOfRead(world, true);
  assert.deepEqual(
    Object.entries(usedBy).map(([name, u]) => [name, u.booking]),
    [[KEPT, true]],
    "the Inbox books with the WhatsApp starter; the email of the other's name is used by nothing",
  );
  // With a WhatsApp row of that name it is the one chosen, as it always was.
  const both = await messagesOfRead([...world, tplRow(TP3, B, { name: "call_text", variables: [] })], true);
  assert.deepEqual(
    Object.entries(both.used_by).map(([name, u]) => [name, u.booking]),
    [["call_text", true]],
  );
});

test("findPoolList takes the turn's lists: handed the workspace's lists as the lists reader holds them -- archived and members included -- it answers what it answers reading them itself, for a list kept by hand, a rule list, a rule that names another list, an archived list and one that is not there, and reads no list; without them it reads its own, as the send does", async () => {
  const w = listsPoolWorld();
  // Counted by WhatsApp alone, as before the channels were: none of these lists reads who can be sent what.
  const pool = await audiencePoolOf(worldCtx(w), A, "America/New_York", new Date(), null);
  const want = {
    [LIST_HAND]: { label: "Regulars", memberIds: ["p1", "p3"], rule: null },
    [LIST_RULE]: { label: "Talked to us", memberIds: ["p1", "p2"] },
    [LIST_NAMING]: { label: "Regulars who talked", memberIds: ["p1"] },
    [LIST_ARCHIVED]: { label: "Old list", memberIds: ["p2"], rule: null, archived: true },
    [LIST_GONE]: null,
  };
  for (const id of [LIST_HAND, LIST_RULE, LIST_NAMING, LIST_ARCHIVED, LIST_GONE]) {
    const ref = { kind: "saved", id };
    const reading = worldCtx(w);
    const itself = await findPoolList(reading, A, pool, ref);
    const handed = worldCtx(w);
    const lists = (await kernel.load(turnIn(handed), listsReader, undefined)).data.lists;
    const held = handed.supabase.seen.length;
    const got = await findPoolList(handed, A, pool, ref, lists);
    assert.deepEqual(got, itself, `the same answer, handed or read: ${id}`);
    assert.equal(handed.supabase.seen.length, held, `handed the lists, it reads none: ${id}`);
    assert.ok(asked(reading).includes("segments.select"), `without them, it reads its own: ${id}`);
    const expected = want[id];
    if (!expected) assert.equal(got, null, "no such list");
    else for (const [k, v] of Object.entries(expected)) assert.deepEqual(got[k], v, `${id}: ${k}`);
  }
  // A People list reads no saved list either way.
  const builtin = worldCtx(w);
  assert.deepEqual(
    await findPoolList(builtin, A, pool, { kind: "builtin", id: "phoned_only" }, []),
    await findPoolList(worldCtx(w), A, pool, { kind: "builtin", id: "phoned_only" }),
  );
  assert.deepEqual(asked(builtin), []);
});

/**
 * 10 Oct 2026 (Ask, the marketing manager, task 3): before Ask writes a message it reads the library whole, a version
 * still in Meta's review among its message's versions, so it never writes a twin of one the workspace holds. One message
 * here, an approved email and a WhatsApp version in review, which a campaign sends; another workspace's beside it.
 */
test("campaigns.messages reads the whole library, a WhatsApp version still in review among its message's versions with each version's state, its slots and the campaigns that send it, each version a row a citation names; campaigns.audiences still lists the message by the one version a broadcast may go by now", async () => {
  const slot = [{ position: 1, label: "First name", example: "Ana" }];
  const w = countsWorld(pagedPeople([]), {
    templates: [
      tplRow(TP1, A, { name: "spring_offer", meta_status: "pending", category: "marketing", variables: slot }),
      tplRow(EM1, A, {
        channel: "email",
        name: "spring_offer",
        category: "marketing",
        source: "chanlytics",
        variables: slot,
      }),
      tplRow(TP9, B, { name: "spring_offer", meta_status: "pending", category: "marketing" }),
    ],
    playbooks: [
      pbRow(PB1, { name: "Spring", template_name: "spring_offer" }),
      pbRow(PB2, { tenant_id: B, name: "Elsewhere", template_name: "spring_offer" }),
    ],
  });
  const tc = newToolContext(worldCtx(w), A, "viewer", "America/New_York", new Date());
  const out = await runTool(tc, { name: "campaigns", input: { action: "messages" } });
  assert.equal(out.isError, false, out.result);
  assert.deepEqual(
    JSON.parse(out.result).messages,
    [
      {
        name: "spring_offer",
        title: "Spring offer",
        language: "en_US",
        category: "marketing",
        away: false,
        versions: [
          { channel: "whatsapp", id: TP1, state: "pending", words: { subject: null, body: "See you at {{1}}" } },
          { channel: "email", id: EM1, state: "approved", words: { subject: null, body: "See you at {{1}}" } },
        ],
        slots: [{ position: 1, label: "First name", kind: "first_name" }],
        used_by: [{ id: PB1, name: "Spring" }],
      },
    ],
    "one message, both versions with their states and words; this workspace's campaign alone",
  );
  assert.deepEqual([...tc.read.template.keys()].sort(), [TP1, EM1].sort(), "each version a template a citation names");
  // The composers' list: the message under the WhatsApp row its words are read from, by the email it can go by now.
  const aud = await runTool(tc, { name: "campaigns", input: { action: "lists" } });
  assert.equal(aud.isError, false, aud.result);
  assert.deepEqual(
    JSON.parse(aud.result).templates.map((m) => [m.template_id, m.name, m.channels]),
    [[TP1, "spring_offer", { whatsapp: false, email: true, sms: false }]],
  );
});

/**
 * 10 Oct 2026 (Ask, the marketing manager, task 4): what am I missing is the journey as Campaigns' home draws it, its
 * head and its rail as data, composed from the readers the page's surfaces answer from, so the number Ask says is the
 * page's. Harbor here: a calendar connected, its WhatsApp number, deals off, and one running win-back by appointments.
 */
test("campaigns.journey says the customer journey: 2 of 4 moments covered, first contact by the receptionist and quiet by the running win-back, which its stage names; the day before and after off; and the guide beside it, the day before's row among its rows; the win-back a row a citation names", async () => {
  const w = countsWorld(pagedPeople([poolPerson(1)]), {
    ...calTables("https://cal.example/journey.ics"),
    playbooks: [pbRow(PB1, { name: "Come back soon", trigger: "lapsed" })],
  });
  await withFeed({ body: ONE_ICS }, async () => {
    const tc = newToolContext(worldCtx(w), A, "viewer", "America/New_York", new Date());
    const out = await runTool(tc, { name: "campaigns", input: { action: "journey" } });
    assert.equal(out.isError, false, out.result);
    const said = JSON.parse(out.result);
    assert.equal(said.covered, 2, "first contact and quiet");
    assert.equal(said.of, 4, "a calendar, deals off: no proposal waiting");
    assert.deepEqual(
      said.stages.map((s) => [s.id, s.label, s.covered, s.state, s.moment]),
      [
        ["first_contact", "First contact", true, "Answers · asks for the yes", null],
        ["before", "Appointment tomorrow", false, "Off", "visit_tomorrow"],
        ["after", "After the appointment", false, "Off", "visited"],
        ["quiet", "Quiet or lapsed", true, "On · daily 10:00 AM", "lapsed"],
      ],
    );
    assert.deepEqual(
      said.stages.find((s) => s.id === "quiet").campaigns,
      [{ id: PB1, name: "Come back soon", state: "On · daily 10:00 AM" }],
      "the win-back, named on the stage it covers",
    );
    assert.deepEqual(
      said.stages.filter((s) => s.id !== "quiet").map((s) => s.campaigns),
      [[], [], []],
      "AI and the call's text are no campaign",
    );
    // The guide for the workspace's shape, in its word (the stages' "Appointment tomorrow"): the page's word, once.
    assert.deepEqual(said.guide, journeyGuide({ calendarOn: true, hasDeals: false, word: "appointment" }));
    assert.equal(
      said.guide.find((r) => r.stage === "after").sends,
      "the day after an appointment you mark kept, when nothing is booked next: a thank-you and how it went, with a review ask where you have a review link",
    );
    const before = said.guide.find((r) => r.stage === "before");
    assert.deepEqual(
      [Object.keys(before), before.moment, before.sends],
      [["stage", "moment", "sends"], "visit_tomorrow", "the day before an appointment on the calendar: a reminder"],
      "the day before's row: its moment, and what it sends when",
    );
    // The win-back here goes by appointments, so its row says its moment's own days, never weeks of its own.
    assert.equal(
      said.guide.find((r) => r.stage === "quiet").sends,
      "no appointment in 45 days, and nothing booked: a win-back",
    );
    assert.deepEqual([...tc.read.playbook.keys()], [PB1], "the campaign it names, a row a citation names");
  });
});

test("campaigns.playbooks says a campaign's end and its sequence's mode as its card does: one past its last day, still running, has no next run and says it ended; one with new words says its next batch asks first, and its last day ahead", async () => {
  const PB3 = "99999999-9999-4999-8999-999999999993";
  const monthly = { trigger: "everyone_monthly", policy_class: "campaign", cadence_days: 30, gap_days: 0 };
  const w = countsWorld(pagedPeople([]), {
    policies: [{ tenant_id: A, class: "campaign", mode: "auto", subject_type: null, subject_id: null }],
    playbooks: [
      pbRow(PB1, { ...monthly, name: "November offer", until: "2026-11-30", words_ok_at: SEEN }),
      pbRow(PB2, { ...monthly, name: "Winter offer", until: "2026-12-31", words_ok_at: null }),
      pbRow(PB3, { ...monthly, name: "Always on", until: null, words_ok_at: SEEN }),
    ],
  });
  const tc = newToolContext(worldCtx(w), A, "owner", "America/New_York", LIFE_NOW);
  const out = await runTool(tc, { name: "campaigns", input: { action: "moments" } });
  assert.equal(out.isError, false, out.result);
  const said = JSON.parse(out.result);
  assert.equal(said.new_sequences_start_as.campaign, "auto", "a new one of the class sends on its own");
  const by = Object.fromEntries(said.playbooks.map((p) => [p.name, p]));
  // Its state is the home's words (contracts lifecycleStateOf), never the stored "running" of one past its last day (R13 X5-7).
  const facts = (p) => [p.state, p.mode, p.next_batch_asks_first, p.next_run, p.runs_nothing, p.ended, p.ends];
  assert.deepEqual(
    facts(by["November offer"]),
    ["Ended Nov 30", "auto", false, null, "Ended Nov 30", "Nov 30", undefined],
    "REGRESSION: it said its next run was today at 10, a month after its last day",
  );
  assert.deepEqual(
    facts(by["Winter offer"]),
    ["On · every 30 days", "auto", true, "today 10:00 AM", undefined, undefined, "Dec 31"],
    "its words new: its next batch waits for an OK, whatever its mode",
  );
  assert.deepEqual(facts(by["Always on"]), [
    "On · every 30 days",
    "auto",
    false,
    "today 10:00 AM",
    undefined,
    undefined,
    undefined,
  ]);
  // The note says the run's breath in the contracts' words, and the appointment moments neither it nor the gap holds
  // (contracts playbookRunReach returns before both).
  assert.ok(
    said.note.includes(`, exempt from the gap and ${PLAYBOOK_CARD_WORDS.appointmentBreath}.`) &&
      !said.note.includes("per person per week"),
    said.note,
  );
});

test("campaigns.playbooks says what a new sequence starts as could not be read where the autonomy rows' read failed, never a guess; each sequence's own mode is its own row's, and still said (the wiring's second audit, R13 X5-8)", async () => {
  // A read that failed was taken for no rules at all: every class read as ask, and Ask said each campaign's runs wait for a
  // person, where some send on their own. Since decision 0064 a campaign's mode is its sequence's, read with it.
  const w = countsWorld(pagedPeople([]), {
    policies: [{ tenant_id: A, class: "campaign", mode: "auto", subject_type: null, subject_id: null }],
    playbooks: [
      pbRow(PB1, {
        name: "November offer",
        trigger: "everyone_monthly",
        policy_class: "campaign",
        words_ok_at: SEEN,
      }),
    ],
  });
  const down = { "policies.select": { message: "policies down" } };
  const { result: out, lines } = await logged("ask_tool_read_failed", () =>
    runTool(newToolContext(worldCtx(w, down), A, "owner", "America/New_York", LIFE_NOW), {
      name: "campaigns",
      input: { action: "moments" },
    }),
  );
  assert.equal(out.isError, false, out.result);
  const said = JSON.parse(out.result);
  assert.equal(said.new_sequences_start_as, null, "no class's start is said");
  assert.match(said.could_not_read, /could not be read just now, never what a new one's sends would do/);
  assert.deepEqual(
    said.playbooks.map((p) => [p.name, p.mode]),
    [["November offer", "auto"]],
    "its sequence's own mode, which no autonomy row's read decides",
  );
  assert.equal(lines.length, 1, "said once in the log");
  // Read, the start is said as before.
  const tc = newToolContext(worldCtx(w), A, "owner", "America/New_York", LIFE_NOW);
  const read = JSON.parse((await runTool(tc, { name: "campaigns", input: { action: "moments" } })).result);
  assert.deepEqual([read.new_sequences_start_as.campaign, read.could_not_read], ["auto", undefined]);
});

test("calendar.room says how full the book is over the next fourteen days, or the fewer a business offers: the open slots freeWindows gives at half an hour, after the feed's two hours tomorrow and the hour on record the day after, by day from tomorrow on the business's clock, and the slots those take out of the hours; with no calendar, none says so and nothing is read; a calendar that cannot be read says unavailable", async () => {
  const room = async (t) => {
    const tc = newToolContext(calCtx(t), A, "viewer", "America/New_York", ROOM_NOW);
    const out = await runTool(tc, { name: "calendar", input: { action: "room" } });
    assert.equal(out.isError, false, out.result);
    return JSON.parse(out.result);
  };
  await withFeed({ body: ROOM_ICS }, async (fetched) => {
    const said = await room(roomTables("https://cal.example/room.ics"));
    const free = {
      hours: ROOM_HOURS,
      closures: [],
      tz: "America/New_York",
      rules: { lead_hours: 2, max_days_ahead: 14, slot_min: 30 },
      now: ROOM_NOW,
    };
    const busy = [
      { start: Date.parse("2026-09-09T14:00:00.000Z"), end: Date.parse("2026-09-09T16:00:00.000Z") },
      { start: Date.parse("2026-09-10T18:00:00.000Z"), end: Date.parse("2026-09-10T19:00:00.000Z") },
    ];
    const open = slotsOf(freeWindows({ ...free, busy }));
    const hours = slotsOf(freeWindows({ ...free, busy: [] }));
    assert.equal(said.days, 14);
    assert.deepEqual(said.by_day, open, "each day with room, as freeWindows gives it");
    assert.equal(said.open, sumOpen(open));
    assert.equal(said.open, 138, "nine weekdays of sixteen half hours, less four tomorrow and two the day after");
    assert.deepEqual(
      said.by_day[0],
      { day: "2026-09-09", open: 12 },
      "tomorrow on the business's clock, where UTC says today",
    );
    assert.equal(said.taken, sumOpen(hours) - sumOpen(open));
    assert.equal(said.taken, 6, "the feed's two hours and the record's one, in half hours");
    assert.deepEqual(Object.keys(said), ["days", "open", "taken", "by_day"], "nothing is missing: no none");
    assert.equal(fetched.length, 1, "one read of the feed");
  });

  // The room is the first fourteen days on offer: a business that offers a month ahead is counted over fourteen, and one
  // that offers a week over its week -- Wednesday to Friday and the Monday, less the same six half hours.
  for (const [ahead, days, open, last] of [
    [30, 14, 138, "2026-09-21"],
    [7, 7, 58, "2026-09-14"],
  ])
    await withFeed({ body: ROOM_ICS }, async () => {
      const rules = { ...calProfile.booking_rules, max_days_ahead: ahead };
      const said = await room(roomTables("https://cal.example/room.ics", rules));
      assert.deepEqual(
        [said.days, said.open, said.taken, said.by_day.at(-1).day],
        [days, open, 6, last],
        `${ahead} days ahead`,
      );
    });

  await withFeed({ body: ROOM_ICS }, async (fetched) => {
    assert.deepEqual(await room(roomTables(null)), {
      days: 14,
      open: 0,
      taken: 0,
      by_day: [],
      none: "no_calendar",
    });
    assert.deepEqual(fetched, [], "no calendar, no read");
  });

  await logged("ask_feed_fetch_failed", () =>
    withFeed({ body: "nope", status: 503 }, async () => {
      assert.deepEqual(await room(roomTables("https://cal.example/down.ics")), {
        days: 14,
        open: 0,
        taken: 0,
        by_day: [],
        none: "unavailable",
      });
    }),
  );
});
