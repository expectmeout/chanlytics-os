/**
 * One call, the person and the reports, for Ask and for the page: each GET answers its reader's payload key for key,
 * asks what it asked, and is the page's 404 in its sentence where the workspace holds nothing; the Campaigns and
 * Reviews reports and their ledgers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { personName, toCallVM, toPersonVM, toReportVM } from "@chanlytics/contracts";
import { reportFacts } from "../../../apps/dashboard/src/surfaces/reports/model/facts.ts";
import {
  A,
  B,
  C1,
  C2,
  L1,
  L2,
  L3,
  P1,
  P2,
  PERSON_KEYS,
  PERSON_READS,
  REVIEW_B,
  USER,
  askReport,
  asked,
  call,
  calls,
  campaignReport,
  campaignsRoute,
  config,
  dayCtx,
  dealsWorld,
  facts,
  googleRoute,
  kernel,
  logged,
  message,
  noReport,
  notHere,
  oneCall,
  onePerson,
  personCtx,
  personRoute,
  personTables,
  presetsWorld,
  readTogether,
  readsOf,
  replyReport,
  replyTileOf,
  reportReader,
  reportsRoute,
  req,
  reviewsLedgerOf,
  reviewsReport,
  reviewsRoute,
  reviewsWorld,
  selects,
  series,
  sixtyHeld,
  turnIn,
  worldCtx,
} from "./_readers.mjs";

test("one call for Ask: the Calls page's own columns and mapping for one call, read under the workspace's own filter -- another workspace's call, or one not there, is the call routes' 404 -- and the call and its person are the rows", async () => {
  const stored = {
    storage_path: "a/b.mp3",
    fetch_state: "stored",
    provider_url: "https://provider.example/x",
    mime: "audio/mpeg",
    bytes: 10,
  };
  const tbls = {
    calls: [
      call(L1, A, {
        contact_id: "k1",
        contacts: { display_name: "Dana", wa_profile_name: null, phone_e164: "+15550000003" },
        recording: stored,
      }),
      call(L2, A, { contact_id: null }),
      call(L3, B, { contact_id: "k3" }),
    ],
  };
  const ctx = dayCtx(tbls);
  const r = await kernel.load(turnIn(ctx), oneCall, { id: L1 });
  const listed = await kernel.load(turnIn(dayCtx(tbls)), calls, {});
  assert.deepEqual(
    r.data,
    { call: listed.data.calls.find((c) => c.id === L1) },
    "the Calls page's mapping of the same row",
  );
  const json = JSON.stringify(r.data);
  assert.ok(!json.includes("storage_path") && !json.includes("provider.example"), "audio only through its own route");
  assert.deepEqual(
    selects(ctx, "calls").map((q) => q.filters),
    [
      [
        ["eq", "tenant_id", A],
        ["eq", "id", L1],
      ],
    ],
    "one read, filtered to the workspace as well as the id",
  );
  assert.deepEqual(r.rows, [
    { kind: "call", id: L1, route: `conversations/cv-${L1}`, label: "Dana" },
    { kind: "person", id: "k1", route: "clients/k1", label: "Dana" },
  ]);
  const alone = await kernel.load(turnIn(dayCtx(tbls)), oneCall, { id: L2 });
  assert.deepEqual(
    alone.rows,
    [{ kind: "call", id: L2, route: `conversations/cv-${L2}`, label: "+1 (555) 000-0001" }],
    "a caller who is nobody's yet is the call alone, by the number the phone showed",
  );

  const notFound = (message) => (e) => {
    assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, message]);
    return true;
  };
  // Bayside's call in a harbor turn: RLS would show it to a member of both; the workspace's filter does not.
  await assert.rejects(kernel.load(turnIn(dayCtx(tbls)), oneCall, { id: L3 }), notFound("Call not found."));
  await assert.rejects(
    kernel.load(turnIn(dayCtx(tbls)), oneCall, { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9" }),
    notFound("Call not found."),
  );
  const typo = dayCtx(tbls);
  await assert.rejects(kernel.load(turnIn(typo), oneCall, { id: "not-a-uuid" }), notFound("That call does not exist."));
  assert.equal(selects(typo, "calls").length, 0, "a malformed id never reaches the database");
});

test("the person, for Ask and for the page: GET contacts/:id answers its reader's payload, key for key and byte for byte, over people-routes' fixture alone and with two threads and a call; the rows are the person, then each thread by the person's name, then each call by its caller as the Calls page names them", async () => {
  for (const threads of [false, true]) {
    const tbls = personTables({ threads });
    const page = await personRoute.GET.run(req(`?workspace=${A}`), personCtx(tbls, P1));
    const r = await kernel.load(turnIn(personCtx(tbls, P1)), onePerson, { id: P1 });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(Object.keys(r.data), ["person"]);
    assert.deepEqual(Object.keys(r.data.person), PERSON_KEYS, "the keys in the order the route answered them");
  }
  const r = await kernel.load(turnIn(personCtx(personTables({ threads: true }), P1)), onePerson, { id: P1 });
  const p = r.data.person;
  // What people-routes asserts of the route, of the reader.
  assert.deepEqual(
    [p.row.effective_reply_mode, p.receptionist_mode, p.workspace_reply_mode, p.notes, p.booking_link],
    ["ask", "ask", "auto", "Sees Sofia", "https://book.example/marisa"],
  );
  assert.deepEqual(p.added, { at: "2026-08-01T00:00:00Z", source: "calendar", title: "Colour" });
  assert.deepEqual(
    p.consent_history.map((c) => c.id),
    ["ev-2", "ev-1"],
    "this person's changes, newest first",
  );
  assert.deepEqual(
    p.conversations.map((c) => [c.id, c.messages.map((m) => m.id)]),
    [
      [C1, ["m1"]],
      [C2, []],
    ],
    "their threads newest first, each with its own messages",
  );
  assert.deepEqual(
    p.calls.map((c) => c.id),
    [L1],
  );
  assert.deepEqual(r.rows, [
    { kind: "person", id: P1, route: `clients/${P1}`, label: "Ada" },
    { kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Ada" },
    { kind: "thread", id: C2, route: `inbox/th-${C2}`, label: "Ada" },
    { kind: "call", id: L1, route: `conversations/cv-${L1}`, label: "Ada" },
  ]);
  assert.deepEqual(
    r.rows.map((x) => x.label),
    [
      personName(p.row),
      ...p.conversations.map(() => personName(p.row)),
      ...p.calls.map((c) => toCallVM(c, "America/New_York", new Date()).who),
    ],
    "People's name for the person and for each of their threads, the Calls page's for each call",
  );
});

test("GET contacts/:id through its reader reads what it read at origin/main, in one round: every table as many times, only the threads' messages, escalations and decisions waiting for their ids; the config now through getTenantConfig's columns and the word through its reader, once each", async () => {
  const tbls = personTables({ threads: true });
  const routed = personCtx(tbls, P1);
  await personRoute.GET.run(req(`?workspace=${A}`), routed);
  assert.deepEqual(
    readsOf(routed),
    { "memberships.select": 1, ...PERSON_READS },
    "the workspace's door, then the reads",
  );
  const ctx = personCtx(tbls, P1);
  await kernel.load(turnIn(ctx), onePerson, { id: P1 });
  assert.deepEqual(readsOf(ctx), PERSON_READS);
  const order = ctx.supabase.seen.map((q) => q.rpc ?? q.table);
  assert.deepEqual(
    order.slice(order.indexOf("messages")).sort(),
    ["decisions", "escalations", "messages"],
    "every other read was asked for before the threads' own: the decisions on them and on the person ride in the same read, one, and the order they start in is the database's business",
  );
  const columns = (table) =>
    selects(ctx, table)
      .map((q) => q.columns)
      .sort();
  assert.deepEqual(
    columns("tenant_config"),
    ["tenant_id, config, version, updated_at, updated_by", "tenant_id, config, version, updated_at, updated_by"],
    "the calendar's own lookup, and the config through its reader: each the row as the server reads it for a member (workspace/config-row.ts)",
  );
  assert.deepEqual(
    columns("tenants"),
    ["appointment_word", "name, timezone"],
    "the calendar's zone, and the word through its reader (with the retired answer, which says it where none was picked)",
  );
});

test("a person this workspace does not hold is GET contacts/:id's 404, in its sentence, and no payload: an id nobody has, and another workspace's person", async () => {
  const tbls = personTables({ threads: true });
  await assert.rejects(kernel.load(turnIn(personCtx(tbls, P2)), onePerson, { id: P2 }), notHere);
  // Harbor's person in a bayside turn: people_list answers for the workspace it is asked about, and bayside has nobody.
  await assert.rejects(kernel.load(turnIn(personCtx(tbls, P1), B), onePerson, { id: P1 }), notHere);
  await assert.rejects(personRoute.GET.run(req(`?workspace=${B}`), personCtx(tbls, P1)), notHere);
});

test("REGRESSION (the wiring's second audit, S5-3): a person combined into another since is the 404 that names the record kept, through a later combine, and never one erased or another workspace's", async () => {
  const OLD = "44444444-4444-4444-8444-444444444444";
  const tbls = personTables({ threads: true });
  const combined = (id, into, over = {}) => ({
    id,
    tenant_id: A,
    phone_e164: null,
    display_name: "Ada",
    erased_at: null,
    marketing_consent: null,
    notes: null,
    merged_into_contact_id: into,
    ...over,
  });
  // OLD was combined into P2, and P2 into P1 since: OLD's address opens P1, the person both became.
  tbls.contacts.push(combined(P2, P1), combined(OLD, P2));
  const keptIs = (to) => (e) => {
    notHere(e);
    assert.deepEqual(e.details, to === null ? undefined : { moved_to: to }, `the record kept: ${to}`);
    return true;
  };
  await assert.rejects(kernel.load(turnIn(personCtx(tbls, P2)), onePerson, { id: P2 }), keptIs(P1));
  await assert.rejects(kernel.load(turnIn(personCtx(tbls, OLD)), onePerson, { id: OLD }), keptIs(P1));
  await assert.rejects(personRoute.GET.run(req(`?workspace=${A}`), personCtx(tbls, OLD)), keptIs(P1));
  // Another workspace asking for them is told nothing of where they went.
  await assert.rejects(kernel.load(turnIn(personCtx(tbls, P2), B), onePerson, { id: P2 }), keptIs(null));
  // The record kept was erased since: nobody to open.
  const erased = personTables({ threads: true });
  erased.contacts[0].erased_at = "2026-08-10T00:00:00Z";
  erased.contacts.push(combined(P2, P1));
  await assert.rejects(kernel.load(turnIn(personCtx(erased, P2)), onePerson, { id: P2 }), keptIs(null));
  // A combine that comes back on itself is followed no further than five records.
  const loop = personTables({ threads: true });
  loop.contacts.push(combined(P2, OLD), combined(OLD, P2));
  await assert.rejects(kernel.load(turnIn(personCtx(loop, P2)), onePerson, { id: P2 }), keptIs(null));
});

test("a config read that fails keeps the route's place in the error order: a person this workspace does not hold is still the 404, one it holds is the config's own failure, and a failure the route checks first is still said first", async () => {
  const tbls = personTables({ threads: true });
  const configDown = { "tenant_config.select": { message: "config down" } };
  const configFails = (e) => {
    assert.equal(e.message, "getTenantConfig: config down");
    return true;
  };
  // The calendar's own lookup reads the config too, and says its failure as the visits' line: kept out of the output.
  await logged("person_visits_failed", async () => {
    await assert.rejects(kernel.load(turnIn(personCtx(tbls, P2, configDown)), onePerson, { id: P2 }), notHere);
    await assert.rejects(personRoute.GET.run(req(`?workspace=${A}`), personCtx(tbls, P2, configDown)), notHere);
    await assert.rejects(kernel.load(turnIn(personCtx(tbls, P1, configDown)), onePerson, { id: P1 }), configFails);
    await assert.rejects(personRoute.GET.run(req(`?workspace=${A}`), personCtx(tbls, P1, configDown)), configFails);
    // Their consent changes are checked before the config, as the route checked them.
    await assert.rejects(
      kernel.load(
        turnIn(personCtx(tbls, P1, { ...configDown, "events.select": { message: "events down" } })),
        onePerson,
        { id: P1 },
      ),
      (e) => {
        assert.equal(e.message, "events down");
        return true;
      },
    );
  });
});

test("a person's page holds their newest 2,000 messages, as it asks: PostgREST answers a thousand rows to a select, so the reader pages them newest first, the id breaking a moment's ties, and one that arrives between the pages is held once; past 2,000 the oldest drop, and the read says it stopped", async () => {
  // `n` messages across their two threads, two a minute, m0000 the oldest: a moment is shared, so only the id orders it.
  const heavy = (n) => {
    const tbls = personTables({ threads: true });
    const first = Date.parse("2026-08-01T00:00:00Z");
    tbls.messages = Array.from({ length: n }, (_, i) => {
      const at = new Date(first + Math.floor(i / 2) * 60_000).toISOString();
      return message(`m${String(i).padStart(4, "0")}`, i % 2 ? C2 : C1, A, { created_at: at, channel_ts: at });
    });
    return tbls;
  };
  const held = (p) => p.conversations.flatMap((c) => c.messages.map((m) => m.id)).sort();
  const pages = (ctx) =>
    selects(ctx, "messages").map((q) => [q.range, q.orders.map((o) => `${o.col}${o.desc ? " desc" : ""}`)]);
  const NEWEST_FIRST = ["created_at desc", "id desc"];

  // 1,500: every one, in two pages, where `.limit(2000)` was answered with the newest 1,000.
  const some = heavy(1500);
  const ctx = personCtx(some, P1, {}, { maxRows: 1000 });
  const r = await kernel.load(turnIn(ctx), onePerson, { id: P1 });
  assert.deepEqual(held(r.data.person), some.messages.map((m) => m.id).sort(), "all 1,500");
  assert.deepEqual(pages(ctx), [
    [[0, 999], NEWEST_FIRST],
    [[1000, 1999], NEWEST_FIRST],
  ]);
  for (const c of r.data.person.conversations) {
    const ids = c.messages.map((m) => m.id);
    assert.deepEqual(ids, [...ids].sort(), "each thread's oldest first, as the page draws it");
  }
  const timeline = toPersonVM(r.data.person, "America/New_York", new Date(), USER).timeline.map((i) => i.id);
  assert.ok(timeline.includes("m-m0000"), "the page's timeline reaches their first message");
  const page = await personRoute.GET.run(req(`?workspace=${A}`), personCtx(some, P1, {}, { maxRows: 1000 }));
  assert.deepEqual(held(page.person), held(r.data.person), "and GET contacts/:id answers the same");

  // A message that arrives between the two pages moves the rest down a place, so the second opens with the first's
  // last: the page holds it once, and the new one waits for the next read.
  const moving = heavy(1500);
  const before = moving.messages.map((m) => m.id).sort();
  const live = personCtx(moving, P1, {}, { maxRows: 1000 });
  const from = live.supabase.from;
  let asked = 0;
  live.supabase.from = (table) => {
    if (table === "messages" && ++asked === 2) {
      moving.messages.push(message("m-new", C1, A, { created_at: "2026-08-02T00:00:00Z" }));
    }
    return from(table);
  };
  const r2 = await kernel.load(turnIn(live), onePerson, { id: P1 });
  assert.equal(selects(live, "messages").length, 2);
  assert.deepEqual(held(r2.data.person), before, "each of the 1,500 once");

  // 2,500: the newest 2,000, the oldest 500 left out, and one line that says the read stopped at its cap: a part, which
  // the page is content with. One row past the 2,000 is asked for, which is how the read knows there were more.
  const many = heavy(2500);
  const capped = personCtx(many, P1, {}, { maxRows: 1000 });
  const { result, lines } = await logged("paged_read_capped", () => kernel.load(turnIn(capped), onePerson, { id: P1 }));
  const newest = many.messages.slice(500).map((m) => m.id);
  assert.deepEqual(held(result.data.person), newest.sort(), "the newest 2,000");
  assert.deepEqual(pages(capped), [
    [[0, 999], NEWEST_FIRST],
    [[1000, 1999], NEWEST_FIRST],
    [[2000, 2000], NEWEST_FIRST],
  ]);
  assert.deepEqual(lines, [{ what: "person messages", cap: 2000, needs: "part" }]);

  // A person with a thread's worth: one page, as before.
  const few = personCtx(heavy(40), P1, {}, { maxRows: 1000 });
  await kernel.load(turnIn(few), onePerson, { id: P1 });
  assert.deepEqual(pages(few), [[[0, 999], NEWEST_FIRST]]);
});

test("the reports, for Ask and for the page: GET reports answers its reader's payload, key for key and byte for byte -- the series, the booking line and the deals, in that order -- over ask-routes' two fixtures and each preset; the Reports page is the row", async () => {
  for (const [w, days] of [
    [presetsWorld(), 7],
    [presetsWorld(), 30],
    [dealsWorld(), 30],
    [dealsWorld(), 90],
    [dealsWorld(), 7],
  ]) {
    const page = await reportsRoute.GET.run(req(`?period=${days}d&workspace=${A}`), worldCtx(w));
    const r = await kernel.load(turnIn(worldCtx(w)), reportReader, { days, end: null });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(
      Object.keys(r.data),
      ["report", "booking", "deals", "profile"],
      "the keys in the order the route answered them",
    );
    assert.deepEqual(r.rows, [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${days} days` }]);
  }
  // What ask-routes asserts of the route, of the reader.
  const week = await kernel.load(turnIn(worldCtx(presetsWorld())), reportReader, { days: 7, end: null });
  assert.deepEqual(week.data.report, { days: 7, tenant: A });
  assert.deepEqual(week.data.booking, { calendar: "none", days: 7, asked: 0, booked: 0 }, "no calendar, said as none");
  // Every workspace has deals (0008, amended 18 Oct 2026): its deal is reported.
  const on = await kernel.load(turnIn(worldCtx(dealsWorld())), reportReader, { days: 30, end: null });
  assert.deepEqual([on.data.deals.any, on.data.deals.clients, on.data.deals.monthly_cents], [true, 1, 250_000]);
  assert.deepEqual(on.data.deals.sources, [{ came_from: "lead", count: 1 }], "the new client's source, from People");
});

test("the Reports row Ask cites names its period as the page does: one day is '1 day', never '1 days' (Month on the 1st)", async () => {
  for (const [days, label] of [
    [1, "Reports, 1 day"],
    [5, "Reports, 5 days"],
  ]) {
    const r = await kernel.load(turnIn(worldCtx(presetsWorld())), reportReader, { days, end: null });
    assert.deepEqual(r.rows, [{ kind: "page", id: "reports", route: "reports", label }], `${days}: ${label}`);
  }
});

test("the report reader hands the workspace's hours and closures beside the report, from the config the booking line read; none said, null", async () => {
  const hours = { mon: { open: "09:30", close: "18:00" } };
  const closures = [{ date: "2026-09-18" }];
  const kept = presetsWorld();
  // A brain the parser reads whole: business_name, system_prompt and fallbacks are required of it, and a config it
  // refuses says no profile at all.
  const brain = {
    business_name: "Harbor",
    system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: { hours, closures },
  };
  kept.tables.tenant_config = [{ tenant_id: A, config: { brain }, version: 1 }];
  const ctx = worldCtx(kept);
  const r = await kernel.load(turnIn(ctx), reportReader, { days: 30, end: null });
  assert.deepEqual(r.data.profile, { hours, closures });
  assert.equal(
    asked(ctx).filter((q) => q === "tenant_config.select").length,
    1,
    "the config is read once in the turn: the booking line's read, not a second",
  );
  const none = await kernel.load(turnIn(worldCtx(presetsWorld())), reportReader, { days: 30, end: null });
  assert.equal(
    none.data.profile,
    null,
    "no row: the profile could not be read, and the page says nothing about closed",
  );
  // A config the parser refuses could not be read either. One it reads whole that keeps no hours is an empty profile:
  // that is how the page knows the workspace has not set them.
  const refused = presetsWorld();
  refused.tables.tenant_config = [{ tenant_id: A, config: { brain: { profile: { hours, closures } } }, version: 1 }];
  assert.equal(
    (await kernel.load(turnIn(worldCtx(refused)), reportReader, { days: 30, end: null })).data.profile,
    null,
  );
  for (const [profile, kept] of [
    [{}, {}],
    [{ closures }, { closures }],
  ]) {
    const w = presetsWorld();
    w.tables.tenant_config = [{ tenant_id: A, config: { brain: { ...brain, profile } }, version: 1 }];
    const said = await kernel.load(turnIn(worldCtx(w)), reportReader, { days: 30, end: null });
    assert.deepEqual(said.data.profile, kept);
  }
});

test("Ask's report says the hold the owner set, as the page does: the reply time includes it, and reply_time.hold splits the replies against it", async () => {
  const said = await askReport(replyReport(sixtyHeld));
  assert.deepEqual(said.reply_time, {
    median: "1m 3s",
    p90: "1m 3s",
    count: 14,
    hold: { seconds: 60, label: "1-minute", atEnd: 14, unheld: 0, later: 0, laterMost: null },
  });
  assert.equal(replyTileOf(said).meta, "slowest tenth 1m 3s · 14 replies · includes your 1-minute hold");
});

test("Ask's report with no hold in the payload says what it said before: hold null, and the tile's old line", async () => {
  const unheld = sixtyHeld.map(({ day, s }) => ({ day, s }));
  const said = await askReport(replyReport(unheld));
  assert.equal(said.reply_time.hold, null);
  assert.equal(replyTileOf(said).meta, "slowest tenth 1m 3s · 14 replies");
  // A report from before the replies were listed at all.
  const v2 = await askReport(replyReport([], { replies: undefined, reply_seconds: [63, 63] }));
  assert.equal(v2.reply_time.hold, null);
  assert.equal(replyTileOf(v2).meta, "slowest tenth 1m 3s · 2 replies");
});

test("the report reader's profile reaches the view model: the closed count with hours said, the door with none, nothing with a profile that could not be read", async () => {
  const hours = { mon: { open: "09:30", close: "18:00" } };
  const brain = {
    business_name: "Harbor",
    system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  // Monday 14 Sep 2026: 9:15 is before opening, 9:30 is open, 21:00 is after closing.
  const arrivals = [
    { d: "2026-09-14", q: 37, n: 1 },
    { d: "2026-09-14", q: 38, n: 2 },
    { d: "2026-09-14", q: 84, n: 4 },
  ];
  const read = async (config) => {
    const w = presetsWorld();
    w.rpcs.report_series = replyReport([], { arrivals, hours: Array.from({ length: 7 }, () => Array(24).fill(0)) });
    if (config) w.tables.tenant_config = [{ tenant_id: A, config, version: 1 }];
    const r = (await kernel.load(turnIn(worldCtx(w)), reportReader, { days: 30, end: null })).data;
    return toReportVM(r.report, { profile: r.profile });
  };
  const said = await read({ brain: { ...brain, profile: { hours } } });
  assert.deepEqual([said.hours?.closed, said.hoursUnset], [5, false]);
  const unset = await read({ brain });
  assert.deepEqual([unset.hours?.closed ?? null, unset.hoursUnset], [null, true]);
  assert.deepEqual(
    reportFacts(unset, null).map((f) => f.id),
    ["hours"],
    "the door to set them, and nothing else to say of a quiet period",
  );
  const unread = await read(undefined);
  assert.deepEqual([unread.hours?.closed ?? null, unread.hoursUnset], [null, false]);
});

test("GET reports through its reader asks what it asked at origin/main, each read once, the series first: People once, with their reply modes, for the booking line and the deals alike; the booking line's calendar zone and settings, now through their readers; the deals, in every workspace -- and a turn that holds the zone and the settings reads neither again", async () => {
  const REPORT_READS = [
    "rpc:report_series",
    // Everyone, read once for the whole report: the booking line's read, which the deals take their sources from.
    "rpc:people_list",
    "policies.select",
    // The booking line's calendar: its zone and its settings, through the facts and config readers, where its own
    // lookup read them at origin/main.
    "tenants.select",
    "tenant_config.select",
    // This workspace has no settings row, so the door is asked after the table: from 00366 a member who is not the
    // owner reads the row only there (workspace/config-row.ts).
    "rpc:tenant_config_read",
    // The deals, after the booking line: every workspace's (0008, amended 18 Oct 2026).
    "deals.select",
  ];
  const routed = worldCtx(dealsWorld("proposal"));
  await reportsRoute.GET.run(req(`?workspace=${A}`), routed);
  assert.deepEqual(asked(routed).slice(0, 2), ["memberships.select", "rpc:report_series"], "the door, then the series");
  assert.deepEqual(readTogether(asked(routed).slice(1)), readTogether(REPORT_READS), "and each of the reads, once");
  const ctx = worldCtx(dealsWorld("proposal"));
  await kernel.load(turnIn(ctx), reportReader, { days: 30, end: null });
  assert.equal(asked(ctx)[0], "rpc:report_series", "the series is asked first");
  assert.deepEqual(readTogether(asked(ctx)), readTogether(REPORT_READS));
  assert.deepEqual(
    readTogether(selects(ctx, "tenants").map((q) => q.columns)),
    ["name, timezone"],
    "the calendar's zone, once",
  );
  assert.deepEqual(
    selects(ctx, "tenant_config").map((q) => q.columns),
    // At origin/main (c39ce689) the booking line's lookup asked for the one column, config.
    ["tenant_id, config, version, updated_at, updated_by"],
    "the settings once, through the config reader",
  );
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "report_series").map((q) => q.args),
    [{ p_tenant_id: A, p_days: 30 }],
  );
  // A turn that already holds the zone and the settings is asked for neither again.
  const turn = turnIn(worldCtx(dealsWorld("proposal")));
  await Promise.all([facts, config].map((r) => kernel.load(turn, r, undefined)));
  const held = turn.ctx.supabase.seen.length;
  await kernel.load(turn, reportReader, { days: 30, end: null });
  assert.deepEqual(
    readTogether(asked(turn.ctx).slice(held)),
    readTogether(["rpc:report_series", "rpc:people_list", "policies.select", "deals.select"]),
    "the series, everyone and the deals: the tenant and its settings were the turn's",
  );
  // Where the retired answer said its customers book, the deals are read all the same.
  const booked = worldCtx(dealsWorld("booking"));
  await kernel.load(turnIn(booked), reportReader, { days: 30, end: null });
  assert.deepEqual(readTogether(asked(booked)), readTogether(REPORT_READS));
});

test("the report over days that ended before today: the series is asked to their last day, the deals are those proposed in those days, and the booking line is not counted; on a database that cannot read such days yet it is refused in words, where days that end today read as they always did", async () => {
  const day = (k) => new Date(Date.now() - k * 86_400_000).toISOString().slice(0, 10);
  const seriesAsked = (ctx) => ctx.supabase.seen.filter((q) => q.rpc === "report_series").map((q) => q.args);
  // Seven days that hold the proposal of five days ago (8 to 2 days ago).
  const ctx = worldCtx(dealsWorld("proposal"));
  const holding = (await kernel.load(turnIn(ctx), reportReader, { days: 7, end: day(2) })).data;
  assert.deepEqual(seriesAsked(ctx), [{ p_tenant_id: A, p_days: 7, p_end: day(2) }]);
  assert.deepEqual(
    holding.booking,
    { calendar: "ended", days: 7, asked: 0, booked: 0 },
    "the booking line follows people as they stand today: for days that ended it is not counted at all",
  );
  assert.deepEqual([holding.deals.sent, holding.deals.won, holding.deals.clients], [1, 1, 1]);
  // Seven days that ended before it went out (20 to 14 days ago): the proposal is not theirs, the client it made is
  // still among the clients now, which are counted whenever they began.
  const before = (await kernel.load(turnIn(worldCtx(dealsWorld("proposal"))), reportReader, { days: 7, end: day(14) }))
    .data;
  assert.deepEqual(
    [before.deals.sent, before.deals.won, before.deals.clients],
    [0, 0, 1],
    "REGRESSION: a window that ended two weeks ago counted every proposal sent since its first day",
  );
  // The route answers its reader's payload for a first and a last day, as it does for a period.
  const routed = worldCtx(dealsWorld("proposal"));
  const page = await reportsRoute.GET.run(req(`?from=${day(8)}&to=${day(2)}&workspace=${A}`), routed);
  assert.deepEqual(seriesAsked(routed), [{ p_tenant_id: A, p_days: 7, p_end: day(2) }]);
  assert.deepEqual(page, holding, "the route's payload is the reader's");

  // A database without 00359 has no function that takes a last day: PostgREST refuses the call by its arguments.
  const gone = (a) => {
    if (a.p_end === undefined) return series(a);
    throw Object.assign(new Error("Could not find the function public.report_series(p_days, p_end, p_tenant_id)"), {
      code: "PGRST202",
    });
  };
  const old = () => worldCtx({ ...presetsWorld(), rpcs: { ...presetsWorld().rpcs, report_series: gone } });
  await assert.rejects(
    kernel.load(turnIn(old()), reportReader, { days: 7, end: day(2) }),
    (e) =>
      e.code === "validation" &&
      e.status === 400 &&
      e.message === "Picked days cannot be read yet. Pick a period that ends today.",
    "said in words, never as some other days and never as a failure of the workspace",
  );
  assert.equal(
    (await kernel.load(turnIn(old()), reportReader, { days: 7, end: null })).data.report.days,
    7,
    "either deploy order works: a period names no day, and reads as it always did",
  );
});

test("a report the function will not answer is GET reports' 404, in its sentence, whatever was asked beside the series; the booking line is never fatal: a calendar lookup that fails is null, said once in the log, and the series and the deals stand", async () => {
  const refused = { ...presetsWorld(), rpcs: { ...presetsWorld().rpcs, report_series: () => ({ error: "no" }) } };
  const ctx = worldCtx(refused);
  await assert.rejects(kernel.load(turnIn(ctx), reportReader, { days: 30, end: null }), noReport);
  // The series is asked first and its answer alone decides there is a report: the booking line and the deals are asked
  // for beside it (as the headline's are), and what they found is answered to nobody.
  assert.equal(asked(ctx)[0], "rpc:report_series", "the series first");
  await assert.rejects(reportsRoute.GET.run(req(`?workspace=${A}`), worldCtx(refused)), noReport);
  const empty = { ...presetsWorld(), rpcs: { ...presetsWorld().rpcs, report_series: () => null } };
  await assert.rejects(kernel.load(turnIn(worldCtx(empty)), reportReader, { days: 30, end: null }), noReport);

  const down = { "tenant_config.select": { message: "config down" } };
  const { result: page, lines } = await logged("booking_report_failed", () =>
    reportsRoute.GET.run(req(`?workspace=${A}`), worldCtx(dealsWorld("proposal"), down)),
  );
  assert.deepEqual(Object.keys(page), ["report", "booking", "deals", "profile"]);
  assert.equal(page.booking, null, "the line, and only the line, is lost");
  assert.deepEqual([page.report.days, page.deals.any, page.deals.clients], [30, true, 1]);
  assert.deepEqual(
    lines,
    // The settings come through the config reader now (getTenantConfig), which names itself in its failure.
    [{ tenant_id: A, error: "getTenantConfig: config down" }],
  );
  const { result: r } = await logged("booking_report_failed", () =>
    kernel.load(turnIn(worldCtx(dealsWorld("proposal"), down)), reportReader, { days: 30, end: null }),
  );
  assert.deepEqual(r.data, page, "the reader's payload is the route's");
});

test("the campaigns' report, for Ask and for the page: GET reports/campaigns answers its reader's payload over ask-routes' fixture, for each preset -- the function's series alone, and no row a citation names; a report it will not answer is the route's 404", async () => {
  const w = presetsWorld();
  for (const days of [7, 30, 90]) {
    const page = await campaignsRoute.GET.run(req(`?period=${days}d&workspace=${A}`), worldCtx(w));
    const ctx = worldCtx(w);
    const r = await kernel.load(turnIn(ctx), campaignReport, { days, end: null });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.deepEqual(r.data, { report: { days } });
    assert.deepEqual(r.rows, []);
    assert.deepEqual(ctx.supabase.seen, [{ rpc: "campaign_series", args: { p_tenant_id: A, p_days: days } }]);
  }
  // Kept a minute across turns that keep (every Ask turn on Campaigns reads it for the page's rows; the moment spec, A6);
  // a route, which keeps nothing, reads it on each request.
  const calls = (rc) => rc.ctx.supabase.seen.filter((q) => q.rpc === "campaign_series").length;
  const keeps = () => kernel.readerContext(worldCtx(w), { tenantId: A, role: "viewer" }, undefined, { keep: true });
  const [first, next, route] = [keeps(), keeps(), turnIn(worldCtx(w))];
  for (const rc of [first, next, route]) await kernel.load(rc, campaignReport, { days: 30, end: null });
  assert.deepEqual(
    [first, next, route].map(calls),
    [1, 0, 1],
    "the next turn's came from the kept read; the route read it",
  );
  await assert.rejects(kernel.load(turnIn(worldCtx(w), B), campaignReport, { days: 30, end: null }), noReport);
  await assert.rejects(campaignsRoute.GET.run(req(`?workspace=${B}`), worldCtx(w)), noReport);
});

test("the reviews' report, for Ask and for the page: GET reports/reviews answers its reader's payload, key for key and byte for byte, for each preset -- Google as GET google reads it and the ledger the database counted beside it, no row of its own", async () => {
  const w = reviewsWorld();
  const { ready: _ready, ...google } = (await googleRoute.GET.run(req(`?workspace=${A}`), worldCtx(w))).google;
  for (const [period, days] of [
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ]) {
    const page = await reviewsRoute.GET.run(req(`?period=${period}&workspace=${A}`), worldCtx(w));
    const r = await kernel.load(turnIn(worldCtx(w)), reviewsReport, { days, end: null });
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "the route's payload, byte for byte");
    assert.deepEqual(Object.keys(page), ["timezone", "today", "days", "google", "readable", "ledger"]);
    assert.deepEqual([page.timezone, page.days], ["Pacific/Auckland", days]);
    assert.equal(
      JSON.stringify(page.google),
      JSON.stringify(google),
      "the one Google read: GET google's bytes, less what this deployment can do",
    );
    assert.equal(page.readable, true, "a listing is kept");
    assert.deepEqual(r.rows, [], "drawn on the Reports page, whose row the report names");
  }
  const month = await reviewsRoute.GET.run(req(`?period=month&workspace=${A}`), worldCtx(w));
  assert.ok(month.days >= 1 && month.days <= 31, "Month is the days since the 1st in the workspace's own zone");
  await assert.rejects(
    reviewsRoute.GET.run(req(`?period=14d&workspace=${A}`), worldCtx(w)),
    (e) => e.status === 400,
    "a period that is none of the four is refused at the door",
  );
});

test("the reviews' ledger is the database's, asked once for the days and beside Google, whose one read serves every period of a turn: the window is the database's day, and the dashboard reads no review of the period itself", async () => {
  const w = reviewsWorld();
  const ctx = worldCtx(w);
  // 14:00 UTC on 6 October is 03:00 on the 7th in Auckland, which the database says.
  const clock = new Date("2026-10-06T14:00:00Z");
  const turn = kernel.readerContext(ctx, { tenantId: A, role: "viewer" }, clock);
  const r = await kernel.load(turn, reviewsReport, { days: 30, end: null });
  assert.deepEqual([r.data.timezone, r.data.today, r.data.days], ["Pacific/Auckland", "2026-10-07", 30]);
  assert.deepEqual(r.data.ledger, reviewsLedgerOf({ p_days: 30 }), "the database's answer, as it answered");
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc),
    [{ rpc: "reviews_ledger", args: { p_tenant_id: A, p_days: 30 } }],
  );
  assert.deepEqual(
    [r.data.google.listing.name, r.data.google.reply_mode, r.data.google.reviews.length],
    ["Harbor Studio", "auto", 3],
    "Google as GET google reads it: the Autonomy row for reviews rides along",
  );
  assert.equal(r.data.ledger.waiting[0].id, REVIEW_B);
  assert.deepEqual(
    asked(ctx).sort(),
    [
      "google_connections.select",
      "google_listing_days.select",
      "google_listings.select",
      "google_reviews.select",
      "policies.select",
      "rpc:reviews_ledger",
    ],
    "the lens is six requests, made at once: the four of Google, the Autonomy row and the ledger",
  );
  assert.equal(
    selects(ctx, "google_reviews").length,
    1,
    "the newest twenty, once; the period's reviews are the database's",
  );
  assert.deepEqual(
    asked(ctx).filter((q) => q.startsWith("events") || q === "tenants.select"),
    [],
    "no event and no zone is read by the dashboard: the function says both",
  );
  // The report at three periods in one turn (Ask's report tool) reads Google once.
  for (const days of [7, 90]) await kernel.load(turn, reviewsReport, { days, end: null });
  for (const table of ["google_listings", "google_connections", "google_reviews", "google_listing_days", "policies"])
    assert.equal(selects(ctx, table).length, 1, `${table}: read once for the turn`);
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc).map((q) => q.args.p_days),
    [30, 7, 90],
    "the ledger is of the days asked",
  );
});

test("the reviews' report keeps no ledger where no profile has synced: the five public reviews are no record, and the day is the turn's", async () => {
  const w = reviewsWorld({ synced: false });
  const ctx = worldCtx(w);
  const clock = new Date("2026-10-06T14:00:00Z");
  const r = await kernel.load(kernel.readerContext(ctx, { tenantId: A, role: "viewer" }, clock), reviewsReport, {
    days: 30,
    end: null,
  });
  assert.equal(r.data.ledger, null);
  assert.deepEqual([r.data.timezone, r.data.today, r.data.days], ["Pacific/Auckland", "2026-10-07", 30]);
  assert.equal(r.data.readable, true);
  assert.equal(asked(ctx).filter((q) => q === "tenants.select").length, 1, "the zone is the turn's, read once");
});

test("the reviews' report of a workspace with no listing answers `ledger: null`; a ledger that cannot be read is the route's failure and a function with no workspace is its 404 -- no listing, could not read and not found are three answers", async () => {
  const none = reviewsWorld({ listing: false });
  const ctx = worldCtx(none);
  const r = await kernel.load(turnIn(ctx), reviewsReport, { days: 30, end: null });
  assert.equal(r.data.ledger, null);
  assert.deepEqual([r.data.google.listing, r.data.google.reviews, r.data.google.days], [null, [], []]);
  assert.equal(r.data.readable, false, "none is kept and this deployment can look none up");
  assert.deepEqual(
    asked(ctx).filter((q) => q.startsWith("events")),
    [],
    "no event is read",
  );
  assert.deepEqual(await reviewsRoute.GET.run(req(`?workspace=${A}`), worldCtx(none)), r.data);

  const down = {
    ...reviewsWorld(),
    rpcs: {
      reviews_ledger: () => {
        throw new Error("connection refused");
      },
    },
  };
  const failed = /reviews_ledger: connection refused/;
  await assert.rejects(kernel.load(turnIn(worldCtx(down)), reviewsReport, { days: 30, end: null }), failed);
  await assert.rejects(reviewsRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)), failed);
  const unknown = { ...reviewsWorld(), rpcs: { reviews_ledger: () => ({ error: "unknown_tenant" }) } };
  await assert.rejects(kernel.load(turnIn(worldCtx(unknown)), reviewsReport, { days: 30, end: null }), noReport);
  await assert.rejects(reviewsRoute.GET.run(req(`?workspace=${A}`), worldCtx(unknown)), noReport);
});
