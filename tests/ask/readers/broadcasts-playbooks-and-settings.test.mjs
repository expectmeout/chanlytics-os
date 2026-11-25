/**
 * The broadcasts and one broadcast, the audience pool, Today's pins counted by People's rule, the playbooks and
 * everyone, the settings and the connections: each read for Ask as its page reads it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeNow } from "@chanlytics/contracts";
import * as contracts from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import {
  A,
  B,
  BC1,
  BC2,
  CAL_NOW,
  CONFIG_READER_COLUMNS,
  FEED,
  HOUR,
  MONTH_SENT,
  ONE_ICS,
  P1,
  P2,
  P3,
  PB1,
  PB2,
  PLAYBOOKS_ASKED_AT_MAIN,
  PLAYBOOKS_KEYS,
  SEG1,
  SETTINGS_ASKED,
  USER,
  ago,
  appointmentWord,
  asked,
  askedWith,
  audiencePoolOf,
  audiencePoolReader,
  bagOf,
  bcWorld,
  broadcastRoute,
  broadcastsReader,
  broadcastsRoute,
  calIn,
  channelsReadyReader,
  config,
  connections,
  contactsRoute,
  countsWorld,
  dayCtx,
  detailCtx,
  detailWorld,
  everyoneReader,
  facts,
  findChannelsReadyOrNull,
  forwardedWorld,
  getBroadcast,
  hasDeals,
  heldAt,
  idle,
  kernel,
  listCountsRoute,
  listEveryone,
  logged,
  memberIn,
  oneBroadcast,
  outboundWorld,
  pagedPeople,
  peopleWorld,
  playbooksReader,
  playbooksRoute,
  playbooksWorld,
  poolPerson,
  recordApart,
  req,
  selects,
  settingsReader,
  settingsRoute,
  settingsWorld,
  setupDtoFor,
  setupRoute,
  setupWorld,
  touchedWorld,
  touchesReader,
  touchesRoute,
  turnIn,
  withFeed,
  withoutClock,
  worldCtx,
} from "./_readers.mjs";

test("the broadcasts, for Ask and for the page: GET broadcasts answers its reader's payload over outbound-routes' two fixtures -- the recent fifty with what their messages earned and whether older ones exist -- and GET broadcasts/touches who a run reached within the week of the turn's clock; each broadcast a row a citation names, opened where its address spells it, a run", async () => {
  for (const [w, tenant] of [
    [bcWorld(), A],
    [bcWorld(), B],
    [touchedWorld(), A],
  ]) {
    const page = await broadcastsRoute.GET.run(req(`?workspace=${tenant}`), worldCtx(w));
    const r = await kernel.load(turnIn(worldCtx(w), tenant), broadcastsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    // 3 Oct 2026: and whether each channel can send now (`ready`, server/campaigns/channels-ready.ts), which the composer's
    // Send by row is drawn from; these workspaces keep no WhatsApp number, so it says so.
    // 18 Oct 2026: who a run reached this week is its own read (GET broadcasts/touches), which the composer alone asks:
    // Sent's runs are what the Inbox waits for before its first draw, and every touch of the week weighed on them.
    assert.deepEqual(Object.keys(r.data), [
      "broadcasts",
      "more",
      "ready",
      "month_sent",
      "month_sent_next",
      "open_to_customers",
    ]);
    // 13 Oct 2026: and whether the workspace is open to its customers (contracts openToCustomersOf), which the card that
    // gets a yes reads: these workspaces are active, with no plan on record, so open.
    assert.equal(r.data.open_to_customers, "open");
    assert.equal(r.data.ready.whatsapp.why, "Connect a WhatsApp number first.");
    assert.deepEqual(
      r.data.month_sent,
      MONTH_SENT,
      "the month's emails and texts, for the head and the composer to say",
    );
    // 4 Oct 2026: and the month after, with the instant it begins by the workspace's clock, which a send set to go past the
    // month's end counts against (contracts monthSentAt): the composer reads the month at the time it is set for.
    assert.deepEqual(r.data.month_sent_next.sent, MONTH_SENT);
    assert.ok(r.data.month_sent_next.from > Date.now(), "the next month begins ahead");
    assert.ok(
      r.data.month_sent_next.from - Date.now() < 32 * 24 * HOUR,
      "within thirty-one days: the very next month's first moment",
    );
    assert.deepEqual(r.data.ready.paused, undefined, "a workspace that is not paused says nothing of it");
    assert.deepEqual(
      r.rows,
      r.data.broadcasts.map((b) => ({
        kind: "broadcast",
        id: b.id,
        route: `campaigns/sequences/${b.id}/runs/${b.id}`,
        label: b.name,
      })),
    );
    const heard = await touchesRoute.GET.run(req(`?workspace=${tenant}`), worldCtx(w));
    const t = await kernel.load(turnIn(worldCtx(w), tenant), touchesReader, undefined);
    assert.equal(JSON.stringify(t.data), JSON.stringify(heard), "the touches route's payload, byte for byte");
    assert.deepEqual(Object.keys(t.data), ["touched_at"]);
    assert.deepEqual(t.rows, [], "a touch is no row a citation names");
  }
  // What outbound-routes asserts of the route, of the reader.
  const harbor = (await kernel.load(turnIn(worldCtx(bcWorld())), broadcastsReader, undefined)).data;
  assert.deepEqual(
    [harbor.broadcasts.map((b) => b.id), harbor.broadcasts[0].counts.sent, harbor.broadcasts[0].counts.delivered],
    [[BC2, BC1], 1, 1],
  );
  // 11 Oct 2026: who heard and when (`touched_at`, every message's time), so the composer judges a send by those within a
  // week of the time it is set for, either side (contracts heardFor).
  const touched = (await kernel.load(turnIn(worldCtx(touchedWorld())), touchesReader, undefined)).data.touched_at;
  assert.deepEqual(Object.keys(touched), ["k1"], "sent this week; not held back, not canceled, not last month");
  assert.equal(touched.k1.length, 1);
  const at = Date.parse(touched.k1[0]);
  assert.ok(at <= Date.now() && Date.now() - at < 2 * HOUR, `when it went, an hour ago: ${touched.k1}`);
  // The week is the turn's: at a clock eight days on, the run of an hour ago is last week's.
  const later = kernel.readerContext(
    worldCtx(touchedWorld()),
    { tenantId: A, role: "viewer" },
    new Date(Date.now() + 8 * 24 * HOUR),
  );
  assert.deepEqual((await kernel.load(later, touchesReader, undefined)).data.touched_at, {});
});

test("the month a page says is null where it could not be counted, said in the log, and never a month of nothing: both pages still answer", async () => {
  const down = {
    campaign_month_sent: () => {
      throw new Error("the database is down");
    },
  };
  const { result, lines } = await logged("campaign_month_failed", () =>
    broadcastsRoute.GET.run(req(`?workspace=${A}`), worldCtx({ ...bcWorld(), rpcs: { ...bcWorld().rpcs, ...down } })),
  );
  assert.equal(result.month_sent, null);
  assert.equal(result.month_sent_next.sent, null, "nor is the month after a month of nothing");
  assert.equal(typeof result.month_sent_next.from, "number", "where it begins is the clock's, counted or not");
  assert.equal(result.broadcasts.length > 0, true, "the page is read all the same");
  assert.equal(lines.length, 2, "one line for each of the two months' reads");
  assert.match(String(lines[0].error), /cannot count the month's email campaign messages: the database is down/);
});

test("a paused workspace is said by the readiness the composers and the Campaigns home read -- the broadcasts' and the playbooks' -- and by People's reads never: it changes what is sent, not who can hear the business", async () => {
  const paused = (w) => {
    w.tables.tenants = [{ id: A, name: "Harbor", timezone: "America/New_York", status: "paused" }];
    return w;
  };
  const read = async (w, reader) => (await kernel.load(turnIn(worldCtx(w)), reader, undefined)).data;
  const bc = await read(paused(bcWorld()), broadcastsReader);
  assert.equal(bc.ready.paused, true, "the composer says the pause where Send would be");
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => typeof bc.ready[c].ready),
    ["boolean", "boolean", "boolean"],
    "and the channels are as they were: what each can do",
  );
  const active = bcWorld();
  active.tables.tenants = [{ id: A, name: "Harbor", timezone: "America/New_York", status: "active" }];
  assert.equal(
    "paused" in (await read(active, broadcastsReader)).ready,
    false,
    "an active workspace says nothing of it",
  );
  const pb = await read(paused(playbooksWorld()), playbooksReader);
  assert.equal(pb.ready.paused, true, "the playbooks' page says it too: its cards and the home's rows promise no time");
  // People's reads ask for no such thing: the facts' channelsReady carries the channels alone.
  const people = await read(paused(bcWorld()), channelsReadyReader);
  assert.equal("paused" in people, false);
});

test("one broadcast, for Ask and for the page: GET broadcasts/:id answers its reader's payload, which is getBroadcast's, over run-report's shape -- who it reached and what came back from each; another workspace's broadcast is the route's 404 in its words, and an id that is not one never reaches the database", async () => {
  const w = detailWorld();
  const page = await broadcastRoute.GET.run(req(`?workspace=${A}`), detailCtx(w, BC1));
  const r = await kernel.load(turnIn(worldCtx(w)), oneBroadcast, { id: BC1 });
  assert.deepEqual(r.data, page, "the route's payload");
  assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
  assert.deepEqual(r.data, await getBroadcast(worldCtx(w), A, BC1), "getBroadcast's own answer");
  assert.deepEqual(r.rows, [
    { kind: "broadcast", id: BC1, route: `campaigns/sequences/${BC1}/runs/${BC1}`, label: r.data.broadcast.name },
  ]);
  const by = Object.fromEntries(r.data.recipients.map((x) => [x.contact_id, x]));
  assert.deepEqual(
    [by[P1].name, by[P1].replied, by[P1].reply_words, by[P1].answered_by],
    ["Ana Ruiz", true, "Yes please!", "receptionist"],
  );
  assert.deepEqual(
    [by[P2].name, by[P2].consent_after, by[P2].consent_purpose, by[P2].waiting_on_you],
    ["Lu", "opted_out", "marketing", true],
  );
  assert.deepEqual([by[P3].state, by[P3].reason, by[P3].replied], ["skipped", "no_consent", false]);
  const gone = (e) => {
    assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "Run not found."]);
    return true;
  };
  await assert.rejects(kernel.load(turnIn(worldCtx(w), B), oneBroadcast, { id: BC1 }), gone);
  await assert.rejects(broadcastRoute.GET.run(req(`?workspace=${B}`), detailCtx(w, BC1)), gone);
  const typo = detailCtx(w, "not-a-uuid");
  await assert.rejects(broadcastRoute.GET.run(req(`?workspace=${A}`), typo), (e) => {
    assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "That broadcast does not exist."]);
    return true;
  });
  assert.deepEqual(asked(typo), ["memberships.select"], "the workspace's door, and nothing of the send's");
});

/* --------------------------------------------------------------------------- the audience pool (PR 1.6) */

test("the audience pool, for Ask: everyone with their appointments for the member asking, exactly as server/campaigns/audience.ts reads it for the same zone and clock -- over a calendar that names one of them -- read once a turn; the zone, the settings and a deal on file are the turn's, so the pool's calendar lookup reads neither and the deals are not read again; settings that cannot be read cost the visits, never the pool; a workspace-wide read, with no row of its own", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const w = peopleWorld();
    // The rows say who can be sent what against what the workspace sends on (3 Oct 2026), read as the reader reads it.
    const ready = await findChannelsReadyOrNull(worldCtx(w), A);
    const want = await audiencePoolOf(worldCtx(w), A, "America/New_York", CAL_NOW, ready);
    const r = await kernel.load(calIn(worldCtx(w)), audiencePoolReader, undefined);
    assert.deepEqual(r.data, want, "the pool server/campaigns/audience.ts reads");
    assert.deepEqual(r.rows, []);
    // Ana's appointment is on the turn's own day, ahead of its clock; Luis's proposal is his, as in every workspace.
    const [ana, luis] = r.data.rows;
    assert.deepEqual([r.data.calendar.state, ana.nextVisitDate, luis.nextVisitDate], ["ok", "2026-09-08", null]);
    assert.deepEqual([r.data.has_deals, !!luis.deal], [true, true]);
    // A turn that holds the zone, the settings and a deal on file reads everyone and their reply modes, once.
    const turn = calIn(worldCtx(w));
    await Promise.all([facts, config, hasDeals].map((x) => kernel.load(turn, x, undefined)));
    const held = turn.ctx.supabase.seen.length;
    assert.equal(kernel.load(turn, audiencePoolReader, undefined), kernel.load(turn, audiencePoolReader, undefined));
    await kernel.load(turn, audiencePoolReader, undefined);
    assert.deepEqual(recordApart(asked(turn.ctx).slice(held)), [
      ["tenant_channels.select", "lines.select", "rpc:people_list", "policies.select"],
      // The record over the feed's season (0002's readers): a booking's rows, and the feed's rows by key.
      ["appointments.select", "appointments.select"],
    ]);
    // The settings are read only where the pool's calendar lookup would read them: one that fails costs the visits,
    // said once in the log, as server/campaigns/audience.ts's own lookup costs them -- never the pool.
    const down = { "tenant_config.select": { message: "config down" } };
    const { result: blind, lines } = await logged("people_visits_failed", () =>
      kernel.load(calIn(worldCtx(w, down)), audiencePoolReader, undefined),
    );
    const { result: blindWant } = await logged("people_visits_failed", () =>
      audiencePoolOf(worldCtx(w, down), A, "America/New_York", CAL_NOW, ready),
    );
    assert.deepEqual(blind.data, blindWant);
    assert.deepEqual(
      [blind.data.calendar.state, blind.data.people.map((p) => p.visits), lines.length],
      ["none", [null, null], 1],
    );
  });
});

test("Today's pins are counted on the server by the rule People's rail counts by, for the member asking (the wiring's second audit, R10): each token its list's count, a list kept by hand its members, and null for a list this workspace can't count or a token that names none", async () => {
  const LIST = "cccccccc-3333-4333-8333-cccccccccccc";
  const people = [
    poolPerson(1),
    poolPerson(2),
    // Heard an hour ago: on no quiet list.
    poolPerson(3, { last_inbound_at: ago(HOUR), latest_wa_inbound_at: ago(HOUR) }),
    poolPerson(4, { marketing_consent: "opted_out" }),
  ];
  const world = () =>
    countsWorld(pagedPeople(people), {
      segments: [{ id: LIST, tenant_id: A, name: "Regulars", rule: null, archived_at: null }],
      segment_members: [
        { tenant_id: A, segment_id: LIST, contact_id: "p1" },
        { tenant_id: A, segment_id: LIST, contact_id: "p4" },
      ],
    });
  const tokens = ["seg:quiet", "seg:opted_in", "seg:offers_ok", `list:${LIST}`, "seg:booked_week", "seg:nothing_here"];
  const { counts } = await listCountsRoute.GET.run(req(`?workspace=${A}&lists=${tokens.join(",")}`), worldCtx(world()));
  // People's own count of each, as its rail makes it: its rows read the member's way (contracts poolRowOf, personRowOf's),
  // each built-in list's rule over them.
  const page = await contactsRoute.GET.run(req(`?workspace=${A}`), worldCtx(world()));
  const tz = "America/New_York";
  const rows = page.people.map((r) =>
    contracts.poolRowOf(r, { tz, now: new Date(), viewer: USER, ready: page.channels_ready }),
  );
  const rail = (id) => rows.filter(contracts.PEOPLE_LISTS.find((l) => l.id === id).test).length;
  for (const id of ["quiet", "opted_in", "offers_ok"])
    assert.equal(counts[`seg:${id}`], rail(id), `seg:${id}: the rail's count, ${rail(id)}`);
  assert.deepEqual([rail("quiet"), rail("opted_in"), rail("offers_ok")], [3, 4, 3], "the fixture puts people on them");
  assert.equal(counts[`list:${LIST}`], 2, "a list kept by hand: its members");
  assert.equal(
    counts["seg:booked_week"],
    null,
    "a list that needs the calendar, where there is none: not counted here",
  );
  assert.equal(counts["seg:nothing_here"], null, "a token that names no list");
  // A token said twice is counted once, and no more than Today may pin are counted.
  const many = await listCountsRoute.GET.run(
    req(
      `?workspace=${A}&lists=${["seg:quiet", "seg:quiet", ...Array.from({ length: 12 }, (_, i) => `seg:l${i}`)].join(",")}`,
    ),
    worldCtx(world()),
  );
  assert.equal(Object.keys(many.counts).length, contracts.TODAY_PINS_MAX);
});

test("the playbooks, for Ask and for the page: GET playbooks answers its reader's payload, key for key and byte for byte -- over outbound-routes' fixture in both workspaces, whose People read fails and counts no moment; calendar-counts' thousand and three people with one reached this week, its People read refused, and its proposals out with a deal on file and with none; and a workspace with a calendar, deals and a list of its own -- and each playbook a row a citation names, opened on Playbooks at its card", async () => {
  const thousand = Array.from({ length: 1003 }, (_, i) => poolPerson(i + 1));
  thousand[0].marketing_consent = "unknown";
  thousand[1].dnc = true;
  const sent = ago(48 * HOUR);
  const touchedOnce = countsWorld(pagedPeople(thousand), {
    broadcasts: [{ id: "b1", tenant_id: A, state: "sent", playbook_id: null, scheduled_for: sent, created_at: sent }],
    broadcast_recipients: [{ tenant_id: A, broadcast_id: "b1", contact_id: "p3", state: "sent", sent_at: sent }],
  });
  const refused = countsWorld(() => {
    throw new Error("canceling statement due to statement timeout");
  });
  const out = (n, days, over = {}) =>
    poolPerson(n, {
      deal_id: `d${n}`,
      deal_stage: "proposed",
      deal_proposed_at: ago(days * 24 * HOUR),
      deal_proposal_url: `https://docs.example.com/proposal/${n}`,
      ...over,
    });
  const proposals = pagedPeople([out(1, 10), out(2, 20), out(3, 20, { deal_proposal_url: null }), poolPerson(4)]);
  const dealt = countsWorld(proposals, {
    tenants: [
      {
        id: A,
        slug: "harbor",
        name: "Harbor",
        status: "active",
        timezone: "America/New_York",
        appointment_word: "meeting",
      },
    ],
    deals: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddd01",
        tenant_id: A,
        contact_id: P1,
        stage: "proposed",
        proposed_at: ago(10 * 24 * HOUR),
      },
    ],
  });
  const undealt = countsWorld(proposals);
  const cases = [
    ["outbound, harbor", outboundWorld(), A],
    ["outbound, bayside", outboundWorld(), B],
    ["a thousand and three", touchedOnce, A],
    ["People refused", refused, A],
    ["a deal on file", dealt, A],
    ["no deal on file", undealt, A],
    ["calendar, deals and a list", playbooksWorld(), A],
  ];
  const pages = {};
  await withFeed({ body: ONE_ICS }, async () => {
    for (const [label, w, tenant] of cases) {
      const { result: page } = await logged("playbook_pools_people_failed", () =>
        playbooksRoute.GET.run(req(`?workspace=${tenant}`), worldCtx(w)),
      );
      const { result: r } = await logged("playbook_pools_people_failed", () =>
        kernel.load(turnIn(worldCtx(w), tenant), playbooksReader, undefined),
      );
      assert.deepEqual(r.data, page, `${label}: the route's payload`);
      assert.equal(JSON.stringify(r.data), JSON.stringify(page), `${label}: byte for byte`);
      assert.deepEqual(Object.keys(r.data), PLAYBOOKS_KEYS, `${label}: the keys in the order the route answered them`);
      assert.deepEqual(
        r.rows,
        r.data.playbooks.map((p) => ({
          kind: "playbook",
          id: p.id,
          route: `campaigns/sequences/${p.id}`,
          label: p.name,
        })),
      );
      pages[label] = r.data;
    }
  });
  // What outbound-routes and calendar-counts assert of the route, of the reader.
  assert.deepEqual(
    pages["outbound, bayside"].playbooks.map((p) => [p.id, p.totals.runs]),
    [[PB2, 1]],
  );
  assert.equal(pages["outbound, bayside"].timezone, "America/Chicago");
  assert.deepEqual(
    [pages["outbound, harbor"].playbooks.map((p) => p.id), pages["outbound, harbor"].pools.everyone_monthly],
    [[PB1], null],
    "a People read that fails counts no moment, and the playbooks stand",
  );
  const e = pages["a thousand and three"].pools.everyone_monthly;
  assert.deepEqual(
    [e.candidates, e.held, e.pool],
    [1003 - 2 - 1, 1, 1003],
    "past the first page, less the one reached",
  );
  assert.equal(pages["People refused"].pools.everyone_monthly, null);
  // Every workspace has the proposal follow-up (0008, amended 18 Oct 2026): its moment counts the proposals out with a
  // deal on file and with none.
  assert.deepEqual([pages["a deal on file"].has_deals, pages["a deal on file"].pools.proposal_waiting.pool], [true, 2]);
  assert.deepEqual(
    [pages["no deal on file"].has_deals, pages["no deal on file"].pools.proposal_waiting.pool],
    [false, 2],
  );
  const rich = pages["calendar, deals and a list"];
  assert.deepEqual(
    [rich.calendar, rich.has_deals, "touched" in rich, rich.lists.map((l) => l.id), rich.pools[`list:${SEG1}`].pool],
    ["ok", true, false, [SEG1], 1],
  );
  // 9 Oct 2026 (spec 2026-10-09 §4.8): the shape's word and booking tool. The matrix's modes by class left the page
  // with decision 0064: each playbook carries its sequence's own.
  assert.deepEqual(
    [rich.appointment_word, rich.bookings_by_email, pages["no deal on file"].appointment_word, "modes" in rich],
    ["meeting", false, "appointment", false],
    "a meeting where the retired answer said proposals and none was picked, else an appointment",
  );
});

test("GET playbooks through its reader asks what it asked at origin/main, in its order, less one read: the pools' calendar lookup no longer reads the zone the page's first read just read, and the settings come through the config reader's columns; a turn that holds the zone, the settings, the word and a deal on file reads none of them; settings that cannot be read cost the visit moments, said once in the log, never the page", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    // At origin/main the pools' calendar lookup read the zone a second time, just before the settings.
    const lookup = PLAYBOOKS_ASKED_AT_MAIN.findIndex(
      ([k, cols], i) => i > 1 && k === "tenants.select" && cols === "name, timezone",
    );
    const want = PLAYBOOKS_ASKED_AT_MAIN.filter((_, i) => i !== lookup).map(([k, cols]) => [
      k,
      k === "tenant_config.select" ? CONFIG_READER_COLUMNS : cols,
    ]);
    // 2 Oct 2026: a playbook on a moment under Bookings or the follow-ups is counted by its message's yes when that is
    // stricter than its moment's (server/campaigns/playbook-pools.ts strictMessagePools), so the templates are read once,
    // after the pools and before the lists.
    want.splice(
      want.findIndex(([k]) => k === "segments.select"),
      0,
      // 7 Oct 2026: over every channel, with each row's id and channel, so a message with no WhatsApp row is counted by its own
      // rows' category (campaignMessagesOf).
      ["templates.select", "id, channel, name, language, category, meta_status, body_preview, title, variables"],
    );
    // 3 Oct 2026: the playbooks' rows name the channels column, and the page asks whether each channel can send now
    // (server/campaigns/channels-ready.ts) with its first reads: the WhatsApp number's config and the texting line (no email
    // domain is set here, so no mailbox).
    for (const q of want) if (q[0] === "sequence_steps.select") q[1] += ", channels";
    // 11 Oct 2026 (00416): and each one's last day, which Campaigns' home says as its state. 19 Oct 2026 (00462, decision
    // 0064): its sequence and when its words were last let go, where the trial's end was, and its sequence's mode after.
    for (const q of want)
      if (q[0] === "sequence_steps.select")
        q[1] = q[1].replace("id, name,", "id, sequence_id, name,") + ", until, words_ok_at";
    // 4 Oct 2026: and whether the workspace is paused (tenants.status, db workspacePaused), which the composers and the
    // Campaigns home say instead of a time; read with the channels, for the pages that compose or promise a run.
    want.splice(
      want.findIndex(([k]) => k === "sequence_batches.select"),
      0,
      ["tenant_channels.select", "config, number_e164"],
      ["lines.select", "sms_state, reg_mock"],
      ["tenants.select", "status"],
    );
    // 9 Oct 2026 (00374): what the runs earned is the database's count, one call (playbook_totals), where every run of
    // every playbook and every person on one were read to sum it here.
    want.splice(
      want.findIndex(([k, cols]) => k === "sequence_batches.select" && cols.startsWith("id, name, template_id")),
      1,
      ["rpc:playbook_totals", null],
    );
    want.splice(
      want.findIndex(([k, cols]) => k === "sequence_sends.select" && cols.includes("messages(")),
      1,
    );
    // 9 Oct 2026 (spec 2026-10-09 §4.3, decision 7): the autonomy matrix's rows were read here so the page knew a class
    // under `auto`; since 19 Oct 2026 (decision 0064) each playbook's mode is its sequence's, read after the rows.
    want.splice(want.findIndex(([k]) => k === "sequence_steps.select") + 1, 0, ["sequences.select", "id, mode"]);
    // 25 Nov 2026 (00717): the month's two counts, emails and texts, are made on the member's own session, whose door asks
    // that they belong, where they were the service role's and left no read here.
    want.push(["rpc:campaign_month_sent", null], ["rpc:campaign_month_sent", null]);
    // 9 Oct 2026: the pools' reads leave with the page's first ones (server/campaigns/playbook-pools.ts poolReads), so the
    // reads no longer reach the database one behind another: the same reads, each as often, the door before them all.
    const w = playbooksWorld();
    const routed = worldCtx(w);
    const page = await playbooksRoute.GET.run(req(`?workspace=${A}`), routed);
    assert.deepEqual(askedWith(routed)[0], want[0], "the workspace's door, before any read");
    assert.deepEqual(bagOf(askedWith(routed)), bagOf(want), "no read added and none lost");
    const ctx = worldCtx(w);
    const r = await kernel.load(turnIn(ctx), playbooksReader, undefined);
    assert.deepEqual(r.data, page);
    assert.deepEqual(bagOf(askedWith(ctx)), bagOf(want.slice(1)));
    const turn = turnIn(worldCtx(w));
    await Promise.all([facts, config, appointmentWord, hasDeals].map((x) => kernel.load(turn, x, undefined)));
    const held = turn.ctx.supabase.seen.length;
    await kernel.load(turn, playbooksReader, undefined);
    assert.deepEqual(
      bagOf(askedWith(turn.ctx).slice(held)),
      bagOf(
        want
          .slice(1)
          .filter(
            ([k, cols]) =>
              k !== "tenant_config.select" &&
              !(k === "tenants.select" && /appointment_word|name/.test(cols)) &&
              !(k === "deals.select" && cols === "id"),
          ),
      ),
      "the zone, the settings, the word and a deal on file were the turn's",
    );
    const down = { "tenant_config.select": { message: "config down" } };
    const { result: blind, lines } = await logged("playbook_pools_visits_failed", () =>
      playbooksRoute.GET.run(req(`?workspace=${A}`), worldCtx(w, down)),
    );
    assert.deepEqual(
      [blind.calendar, blind.pools.visit_tomorrow, blind.pools.visited, blind.pools.lapsed],
      ["none", null, null, null],
      "no calendar read: the moments it names are not counted",
    );
    assert.ok(blind.pools.everyone_monthly && blind.playbooks.length === 2, "and everything else stands");
    assert.deepEqual(lines, [{ tenant_id: A, error: "DbFailure: getTenantConfig: config down" }]);
    const { result: r2 } = await logged("playbook_pools_visits_failed", () =>
      kernel.load(turnIn(worldCtx(w, down)), playbooksReader, undefined),
    );
    assert.deepEqual(r2.data, blind);
  });
});

test("GET playbooks asks for the pools' reads with its first ones, not behind them: with the playbooks' own rows still out, everyone, the reply modes, the settings, the proposals out and their follow-ups and the lists have all been asked for, and only the templates wait, which are read for the playbooks; the page is the one it was; and with no deal on file, only whether there is one is read", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const w = playbooksWorld();
    const page = await playbooksRoute.GET.run(req(`?workspace=${A}`), worldCtx(w));
    const ctx = worldCtx(w);
    const open = heldAt(ctx, "sequence_steps");
    let answered = false;
    const waiting = playbooksRoute.GET.run(req(`?workspace=${A}`), ctx).then((p) => ((answered = true), p));
    await idle();
    assert.equal(answered, false, "the page waits for its campaigns");
    const before = askedWith(ctx).map(([k, cols]) => `${k} ${cols ?? ""}`.trim());
    for (const read of [
      "rpc:people_list",
      "policies.select subject_type, subject_id, mode",
      `tenant_config.select ${CONFIG_READER_COLUMNS}`,
      "deals.select id, contact_id, proposed_at",
      "segments.select id, name, rule, archived_at",
      "segment_members.select segment_id, contact_id",
    ])
      assert.ok(
        before.includes(read),
        `REGRESSION: the pools' ${read} waited for the page's first reads to answer (asked: ${before.join(" | ")})`,
      );
    // The follow-ups' touches are two reads deep, behind the proposals out: both of theirs and the week's own.
    assert.equal(before.filter((k) => k.startsWith("sequence_sends.select") && /proposal_link/.test(k)).length, 2);
    assert.ok(
      !before.some((k) => /^(sequence_steps|templates)\.select/.test(k)),
      "the templates are read for the playbooks",
    );
    open();
    assert.deepEqual(await waiting, page, "the page it always answered");
    assert.equal(selects(ctx, "templates").length, 1, "and the templates once, when the playbooks are in");

    // No deal on file: the pace has no yes to measure and no proposal's follow-up went out, so neither is read.
    const off = worldCtx(countsWorld(pagedPeople([poolPerson(1), poolPerson(2)])));
    const quiet = await playbooksRoute.GET.run(req(`?workspace=${A}`), off);
    assert.deepEqual([quiet.has_deals, quiet.pools.everyone_monthly.pool], [false, 2]);
    assert.deepEqual(
      selects(off, "deals").map((q) => q.columns),
      ["id"],
      "REGRESSION: a workspace with no deal on file read its deals for a pace: only whether there is one",
    );
  });
});

/* ------------------------------------------------------------------ everyone, once a turn (PR 1.6) */

test("everyone, for Ask: every page of People with the reply mode in force for each, exactly as server/people/people.ts reads it, and no row of its own; the audience pool and the Playbooks page's pools count from the one read, so a turn that reads both reads every page once and the reply modes once", async () => {
  const all = Array.from({ length: 1003 }, (_, i) => poolPerson(i + 1));
  const w = countsWorld(pagedPeople(all));
  const r = await kernel.load(turnIn(worldCtx(w)), everyoneReader, undefined);
  assert.deepEqual(r.data, await listEveryone(worldCtx(w), A), "server/people/people.ts everyone()");
  assert.deepEqual([r.data.length, r.rows], [1003, []]);
  const ctx = worldCtx(w);
  const turn = turnIn(ctx);
  await Promise.all([kernel.load(turn, audiencePoolReader, undefined), kernel.load(turn, playbooksReader, undefined)]);
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "people_list").map((q) => q.args.p_offset ?? 0),
    [0, 1000],
    "every page once, for the pool and the Playbooks page's pools alike",
  );
  assert.equal(
    selects(ctx, "policies").filter((q) => q.columns === "subject_type, subject_id, mode").length,
    1,
    "and the reply modes once",
  );
});

test("the settings read, for Ask and for the page: GET settings answers its reader's payload, key for key, over settings-routes' fixtures -- a viewer's feed masked and an owner's whole, who last changed the row, a config the parser refuses as its own state, the platform's facts with the number the business forwards, whether the listing keeps a review link -- asking in its order: the row once, the platform's facts, the review link and whether Ads is drawn at once, then the Autonomy rows inside the preview; no configuration row is the route's 404; the preview's clock is the turn's, and a turn that holds the row reads it once", async () => {
  for (const [tenant, role, version] of [
    [A, "viewer", 3],
    [B, "owner", 1],
  ]) {
    const page = await settingsRoute.GET.run(req(`?workspace=${tenant}`), dayCtx(settingsWorld()));
    const ctx = dayCtx(settingsWorld());
    const r = await kernel.load(memberIn(ctx, tenant, role), settingsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.equal(
      Object.keys(r.data).join(),
      "config,version,role,configBroken,facts,conflicts,prompt,updatedBy,updatedAt,review_link,previews,ads",
    );
    assert.equal(r.data.review_link, false, "no listing, no review link");
    assert.deepEqual(
      [r.data.version, r.data.role, r.data.configBroken, r.data.prompt, r.data.updatedBy, r.data.updatedAt],
      [version, role, false, null, null, "2026-09-01T00:00:00Z"],
      "no receptionist, no prompt; a row written before its author was kept says so with null",
    );
    assert.deepEqual(r.rows, []);
    assert.deepEqual(asked(ctx), SETTINGS_ASKED.slice(0, -1), "no receptionist: no Autonomy rows to read");
  }
  const viewer = await kernel.load(memberIn(dayCtx(settingsWorld()), A, "viewer"), settingsReader, undefined);
  assert.ok(
    viewer.data.config.calendar.ical_url.includes("…") &&
      !viewer.data.config.calendar.ical_url.includes("abcdef123456"),
    "a viewer learns that a feed is set, not its address",
  );
  const owner = await kernel.load(memberIn(dayCtx(settingsWorld()), B, "owner"), settingsReader, undefined);
  assert.equal(owner.data.config.calendar.ical_url, FEED, "an owner sees it whole");
  const authored = settingsWorld({
    tenant_config: [{ tenant_id: B, config: {}, version: 1, updated_at: "2026-09-02T00:00:00Z", updated_by: "u7" }],
  });
  const byU7 = await kernel.load(memberIn(dayCtx(authored), B, "owner"), settingsReader, undefined);
  assert.deepEqual(byU7.data, await settingsRoute.GET.run(req(`?workspace=${B}`), dayCtx(authored)));
  assert.deepEqual([byU7.data.updatedBy, byU7.data.updatedAt], ["u7", "2026-09-02T00:00:00Z"]);
  // A config the parser refuses: its own state, and nothing past the row is read.
  const broken = settingsWorld({
    tenant_config: [{ tenant_id: A, config: "nonsense", version: 7, updated_at: "2026-09-01T00:00:00Z" }],
  });
  const brokenCtx = dayCtx(broken);
  const refused = await kernel.load(memberIn(brokenCtx, A, "viewer"), settingsReader, undefined);
  assert.deepEqual(refused.data, await settingsRoute.GET.run(req(`?workspace=${A}`), dayCtx(broken)));
  assert.deepEqual(Object.keys(refused.data), ["config", "version", "role", "configBroken", "issues", "ads"]);
  assert.deepEqual(
    [refused.data.config, refused.data.version, refused.data.configBroken],
    [null, 7, true],
    "REGRESSION: a broken config collapsed to {} and read as 'no receptionist yet'",
  );
  assert.ok(Array.isArray(refused.data.issues) && refused.data.issues.length > 0);
  assert.deepEqual(asked(brokenCtx), ["tenant_config.select", "ad_accounts.select"]);
  // No row at all: the route's 404, in its sentence, from the reader.
  const noRow = (e) => {
    assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "Workspace has no configuration row."]);
    return true;
  };
  const none = dayCtx(settingsWorld({ tenant_config: [] }));
  await assert.rejects(kernel.load(memberIn(none, A, "viewer"), settingsReader, undefined), noRow);
  // The table, then the door: from 00366 a viewer reads the row only through tenant_config_read, and neither has it.
  assert.deepEqual(asked(none), ["tenant_config.select", "rpc:tenant_config_read"]);
  await assert.rejects(
    settingsRoute.GET.run(req(`?workspace=${A}`), dayCtx(settingsWorld({ tenant_config: [] }))),
    noRow,
  );
  // F1: the platform's facts -- the number the business keeps, forwarded to its line -- and the receptionist's prompt.
  const NOW = new Date("2026-09-21T14:00:00Z");
  const routed = dayCtx(forwardedWorld());
  const page = await settingsRoute.GET.run(req(`?workspace=${A}`), routed);
  const ctx = dayCtx(forwardedWorld());
  const r = await kernel.load(memberIn(ctx, A, "owner", NOW), settingsReader, undefined);
  assert.deepEqual(withoutClock(r.data), withoutClock(page), "the route's payload, the preview's clock apart");
  assert.deepEqual(r.data.facts.kept_line, { value: "+17185550142", source: "provisioned" });
  assert.deepEqual(r.data.conflicts, [], "customers call the number they know and reach the receptionist");
  assert.equal(
    r.data.prompt.now,
    describeNow("America/New_York", NOW, undefined),
    "the preview says the turn's clock: one clock for the turn",
  );
  assert.deepEqual(asked(routed), ["memberships.select", ...SETTINGS_ASKED], "the workspace's door, then the reads");
  assert.deepEqual(asked(ctx), SETTINGS_ASKED);
  // The listing keeps a review link (00415): the composers offer it to a review-link slot, and the review ask with it.
  const reviewed = () => ({
    ...forwardedWorld(),
    google_listings: [rows.googleListing({ tenant_id: A, new_review_uri: "https://example.com/review/harbor" })],
  });
  const linked = await kernel.load(memberIn(dayCtx(reviewed()), A, "owner", NOW), settingsReader, undefined);
  assert.equal(linked.data.review_link, true, "the listing's link is said as there being one, never the link");
  assert.equal((await settingsRoute.GET.run(req(`?workspace=${A}`), dayCtx(reviewed()))).review_link, true);
  // A turn that holds the row reads it once: the settings read is the turn's one read of the config.
  const turn = memberIn(dayCtx(forwardedWorld()), A, "owner", NOW);
  await kernel.load(turn, config, undefined);
  const held = turn.ctx.supabase.seen.length;
  const again = await kernel.load(turn, settingsReader, undefined);
  assert.deepEqual(asked(turn.ctx).slice(held), SETTINGS_ASKED.slice(1), "the row was the turn's");
  assert.deepEqual(again.data, r.data);
});

test("connections, for the page: GET setup answers its reader's payload over setup.test.mjs's shape -- setupDtoFor's own answer for a member reading their own workspace on their session, on the turn's clock, and their role beside it -- asking what setupDtoFor asks, in its order: the roster through its door, never the back office's counts; each domain it sends cold email from a row a citation names, on Connections", async () => {
  const NOW = new Date("2026-09-07T15:00:00Z");
  const w = setupWorld();
  const routed = worldCtx(w);
  const page = await setupRoute.GET.run(req(`?workspace=${A}`), routed);
  const ctx = worldCtx(w);
  const r = await kernel.load(memberIn(ctx, A, "owner", NOW), connections, undefined);
  assert.deepEqual(r.data, page, "the route's payload");
  assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
  assert.deepEqual(Object.keys(r.data), ["setup", "role"]);
  assert.deepEqual(r.rows, [], "email is off here: no domain, no row");
  const direct = worldCtx(w);
  assert.deepEqual(
    r.data,
    { setup: await setupDtoFor(direct.supabase, A, { kind: "member" }, NOW), role: "owner" },
    "setupDtoFor's own answer for a member, and the role riding along so the page knows who may act",
  );
  assert.deepEqual(askedWith(ctx), askedWith(direct), "setupDtoFor's own reads, in its order, on the member's session");
  assert.ok(asked(ctx).includes("rpc:setup_rows"), "Setup's rows in one call, the roster among them: a member's");
  assert.ok(!asked(ctx).includes("memberships.select"), "never the back office's plain counts");
  assert.deepEqual(asked(routed), ["memberships.select", ...asked(ctx)], "the workspace's door, then the same reads");
  const viewer = await kernel.load(memberIn(worldCtx(w), B, "viewer", NOW), connections, undefined);
  assert.deepEqual(viewer.data, await setupRoute.GET.run(req(`?workspace=${B}`), worldCtx(w)));
  assert.equal(viewer.data.role, "viewer");
  // A workspace that sends cold email from a domain of its own: each domain is a row a citation names, on Connections.
  const D1 = "5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e";
  const sending = setupWorld();
  sending.tables.mailboxes = [
    {
      id: "mb1",
      tenant_id: A,
      local_part: "harbor",
      reply_token: "a".repeat(24),
      reply_token_prev: null,
      from_name: "Harbor",
      reply_mode: "draft",
      last_received_at: null,
      last_error: null,
    },
  ];
  sending.tables.mailbox_connections = [
    rows.mailboxConnection({
      id: D1,
      tenant_id: A,
      address: "sam@send.example.com",
      host: "send.example.com",
      from_name: "Sam",
    }),
  ];
  const was = process.env.EMAIL_DOMAIN;
  process.env.EMAIL_DOMAIN = "mail.example.com";
  try {
    const d = await kernel.load(memberIn(worldCtx(sending), A, "owner", NOW), connections, undefined);
    assert.deepEqual(
      d.data.setup.email.sending.mailboxes.map((x) => x.id),
      [D1],
    );
    assert.deepEqual(d.rows, [{ kind: "mailbox", id: D1, route: "admin/integrations", label: "sam@send.example.com" }]);
  } finally {
    if (was === undefined) delete process.env.EMAIL_DOMAIN;
    else process.env.EMAIL_DOMAIN = was;
  }
});
