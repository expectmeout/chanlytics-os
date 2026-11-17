/**
 * GET today/people on the server (readers/today.ts todayPeople): what Today draws from People, made over People's first
 * page as GET contacts reads it (contracts todayPeopleOf), read with less waiting and saying nothing else (16 Nov 2026).
 * Today's first draw waits for it on every load and every press to Today, and it was the slowest read left between a
 * press and a whole Today (1.1 to 1.7 s on production): the calendar's appointments were read only once People's rows
 * were in, and a workspace of more than a page waited for a thousand rows, their appointments and what the member had
 * seen of them, to say only how many there are.
 *
 * And a Today load (GET open, one request) asked for People's first page three times at once, 350 KB a time on
 * production's demo workspace: for this read, for everyone in People, and for the calendar's board, each of which
 * begins with that page. Under the load's other reads each took 0.7 to 1.2 s where one alone takes 0.15.
 *
 * Here a workspace with someone for each of Today's checks and steps, the read beside GET contacts in one turn (as GET
 * open answers both), compared field for field with what main made of that page; the page asked for once in a request
 * that reads it for Today, for everyone and for the board; the calendar read while People's rows are still on their
 * way; and a workspace of a thousand and one, answered while its page is held. People are made up: 555-01xx numbers,
 * example.com addresses.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { todayPeopleOf } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { personDto } from "../../consent/_person-row.mjs";
import { until } from "../../shared/_until.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { shareTurn, readerContext, load } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { everyone } = await import(at("apps/dashboard/src/server/readers/everyone.ts"));
const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
const contacts = await import(at("apps/dashboard/app/api/v1/contacts/route.ts"));
const todayPeople = await import(at("apps/dashboard/app/api/v1/today/people/route.ts"));
const calendar = await import(at("apps/dashboard/app/api/v1/calendar/route.ts"));

beforeEach(() => {
  setRateStore(memoryStore());
  forgetFeeds();
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "u-owner";
const TEAMMATE = "u-sam";
const TZ = "America/New_York";
/** A Wednesday at eleven in New York: the turn's clock, frozen so the read and the expected answer say one day. */
const NOW_MS = Date.parse("2026-09-16T15:00:00.000Z");
const DAY = 86_400_000;
const ago = (days) => new Date(NOW_MS - days * DAY).toISOString();
/** The business's day `days` from today, as a step's due day is written. */
const dueOn = (days) => new Date(NOW_MS + days * DAY).toLocaleDateString("en-CA", { timeZone: TZ });
/** A person's id, by their number: 1 to 9999. */
const pid = (n) => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, "0")}`;

/** Someone in People as people_list answers them: wrote three days ago on WhatsApp, first two months ago, then `over`. */
const row = (n, over = {}) =>
  personDto({
    id: pid(n),
    display_name: `Person ${n}`,
    phone_e164: `+1305555${String(100 + (n % 100)).padStart(4, "0")}`,
    last_message_at: ago(3),
    last_inbound_at: ago(3),
    first_contact_at: ago(60),
    earliest_row_at: ago(60),
    in_touch_at: ago(3),
    added_at: ago(60),
    step_id: null,
    step_body: null,
    step_due_on: null,
    step_for_user_id: null,
    step_deal_id: null,
    deal_id: null,
    deal_stage: null,
    ...over,
  });

/** A next step on a person, due `days` from today, for `who`. */
const step = (n, days, who) => ({
  step_id: `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, "0")}`,
  step_body: "Call back about the quote",
  step_due_on: dueOn(days),
  step_for_user_id: who,
});

/** The deal a row shows, as people_list carries it. */
const dealOn = (n, stage, proposedDaysAgo) => ({
  deal_id: `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`,
  deal_stage: stage,
  deal_service: "Kitchen remodel",
  deal_proposed_at: ago(proposedDaysAgo),
  deal_decided_at: stage === "proposed" ? null : ago(proposedDaysAgo - 2),
  deal_ended_at: null,
  deal_amount_cents: null,
  deal_per: null,
});

/** A yes to offers on a paper form. */
const offersYes = {
  marketing_consent: "opted_in",
  marketing_consent_source: "form",
  marketing_consent_updated_at: ago(5),
};

/**
 * A workspace with someone for each of Today's checks and steps: steps overdue, due today and later, one of them for a
 * teammate (the team is read for their name), a proposal out three weeks, a won deal, two yeses to offers (one only by
 * email, where the workspace has no email), and quiet people none of them names; then `more` people beyond them.
 */
function rowsOf(more = 0) {
  return [
    row(1, { display_name: "Rosa Diaz", ...step(1, -1, OWNER) }),
    row(2, { display_name: "Mia Chen", ...step(2, 0, TEAMMATE) }),
    row(3, { display_name: "Ivy Park", ...step(3, 3, OWNER) }),
    row(4, {
      display_name: "Cleo Park",
      last_message_at: ago(25),
      last_inbound_at: ago(25),
      ...dealOn(4, "proposed", 20),
    }),
    row(5, { display_name: "Dee Wolf", ...dealOn(5, "won", 30) }),
    row(6, { display_name: "Bo Lee", ...offersYes }),
    row(7, { display_name: "Eve Kim", phone_e164: null, email: "eve@example.com", channels: ["email"], ...offersYes }),
    ...Array.from({ length: 5 }, (_, i) =>
      row(10 + i, {
        display_name: `Quiet ${i}`,
        last_message_at: ago(40),
        last_inbound_at: ago(40),
        in_touch_at: ago(40),
      }),
    ),
    ...Array.from({ length: more }, (_, i) => row(100 + i, { display_name: `Later ${i}`, in_touch_at: ago(50) })),
  ];
}

/** The deals behind those rows, as `deals` holds them: the proposal out, and the won one. */
const dealRows = () => [
  {
    id: dealOn(4, "proposed", 20).deal_id,
    tenant_id: A,
    contact_id: pid(4),
    stage: "proposed",
    service: "Kitchen remodel",
    proposed_at: ago(20),
    decided_at: null,
    ended_at: null,
    created_at: ago(21),
  },
  {
    id: dealOn(5, "won", 30).deal_id,
    tenant_id: A,
    contact_id: pid(5),
    stage: "won",
    service: "Kitchen remodel",
    proposed_at: ago(30),
    decided_at: ago(28),
    ended_at: null,
    created_at: ago(31),
  },
];

/**
 * The workspace's world: the owner's membership, its zone, its calendar (the filler's, made in memory, never fetched),
 * a texting line, the deals, everyone in `contacts` (what the count counts), and what the owner has seen (Rosa put back
 * as unread). `people_list` answers a page of a thousand at most, after the offset, as the database does.
 */
function world(rows) {
  const tables = {
    memberships: [
      {
        user_id: OWNER,
        tenant_id: A,
        role: "owner",
        created_at: ago(400),
        tenants: { slug: "harbor", name: "Harbor Remodeling", timezone: TZ },
      },
    ],
    tenants: [
      { id: A, slug: "harbor", name: "Harbor Remodeling", timezone: TZ, status: "active", appointment_word: null },
    ],
    tenant_config: [
      {
        tenant_id: A,
        config: { calendar: { ical_url: `https://app.example.com/api/v1/calendar/filler.ics?tz=${TZ}` } },
        version: 1,
        updated_at: ago(10),
        updated_by: OWNER,
      },
    ],
    lines: [{ tenant_id: A, sms_state: "active", reg_mock: false }],
    deals: dealRows(),
    appointments: [],
    contacts: rows.map((r) => ({
      id: r.id,
      tenant_id: A,
      erased_at: null,
      merged_into_contact_id: null,
      erasing_since: null,
      created_at: r.added_at,
    })),
    contact_reads: [{ tenant_id: A, user_id: OWNER, seen_at: ago(10) }],
    contact_marks: [
      { tenant_id: A, user_id: OWNER, contact_id: pid(1), seen_at: ago(2), unread_at: ago(1), marked_at: ago(1) },
    ],
  };
  const rpcs = {
    people_list: (a) => rows.slice(a.p_offset ?? 0, (a.p_offset ?? 0) + Math.min(a.p_limit ?? 1000, 1000)),
    team_roster: () => [
      {
        membership_id: "m1",
        member_user_id: OWNER,
        email: "owner@example.com",
        role: "owner",
        joined_at: ago(400),
        display_name: "Owner",
      },
      {
        membership_id: "m2",
        member_user_id: TEAMMATE,
        email: "sam@example.com",
        role: "member",
        joined_at: ago(100),
        display_name: "Sam",
      },
    ],
  };
  return { tables, rpcs };
}

/**
 * A request's context over the world, as the owner. `held`: people_list's answer waits for the gate this returns, so a
 * test can see what is read, and what is answered, while People's rows are still on their way.
 */
function ctxOf({ tables, rpcs }, { held = false } = {}) {
  const supabase = fakeDb(tables, {}, rpcs);
  let open = () => {};
  const gate = new Promise((resolve) => (open = resolve));
  if (held) {
    const rpc = supabase.rpc.bind(supabase);
    supabase.rpc = (name, args) => {
      if (name !== "people_list") return rpc(name, args);
      const call = {
        then: (resolve, reject) => gate.then(() => rpc(name, args)).then(resolve, reject),
        single: () => call,
        maybeSingle: () => call,
      };
      return call;
    };
  }
  return { ctx: { supabase, userId: OWNER, email: "owner@example.com", params: {} }, open };
}

const get = (route, query = "") => new Request(`http://localhost/api/v1/${route}?workspace=${A}${query}`);
/** The functions and tables a request asked of the database, in order: `rpc:<name>` or `<table>`. */
const asked = (ctx) =>
  ctx.supabase.seen.filter((s) => s.op === "select" || s.rpc).map((s) => (s.rpc ? `rpc:${s.rpc}` : s.table));

/** What main made of People's first page: contracts todayPeopleOf over GET contacts' answer, at the turn's moment. */
const mainOf = (page) =>
  todayPeopleOf(
    page,
    { whole: !page.page.has_more, total: page.page.total },
    { tz: TZ, now: new Date(NOW_MS), viewer: OWNER },
  );

test("Today's read says, field for field, what main made of People's first page, and GET open still reads People once", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW_MS });
  const { ctx } = ctxOf(world(rowsOf()));
  // One turn for both reads, as GET open answers them (server/workspace/page-open.ts).
  shareTurn(ctx);
  const [today, page] = await Promise.all([
    todayPeople.GET.run(get("today/people"), ctx),
    contacts.GET.run(get("contacts"), ctx),
  ]);
  const people = today.people;
  assert.equal(people.whole, true);
  // Something for every part, so the comparison below compares something: the lists, the people the checks and the
  // steps name (an overdue step, today's for a teammate, the proposal out, the first yes to offers; not a step due
  // later, nor a second yes for the same reason), the reach.
  assert.equal(people.total, 12);
  assert.ok(people.lists.length > 0 && people.lists.some((l) => l.count > 0), "lists counted");
  assert.deepEqual(people.people.map((p) => p.display_name).sort(), ["Bo Lee", "Cleo Park", "Mia Chen", "Rosa Diaz"]);
  assert.equal(people.people.find((p) => p.id === pid(2)).step_for_name, "Sam", "the team was read for a step's name");
  assert.equal(
    people.people.find((p) => p.id === pid(1)).marked_unread,
    true,
    "what the owner has seen rides on the row",
  );
  assert.ok(people.channels_ready, "the channels were read");
  assert.equal(page.calendar.state, "ok", "the calendar was read");
  assert.deepStrictEqual(people, mainOf(page));
  // Both answers from one read of People's page and one count.
  const reads = asked(ctx);
  assert.equal(reads.filter((r) => r === "rpc:people_list").length, 1);
  assert.equal(reads.filter((r) => r === "contacts").length, 1, "one count of People");
});

test("Today's read alone answers what it answers beside GET contacts, with the reads it made before", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW_MS });
  const w = world(rowsOf());
  const { ctx: together } = ctxOf(w);
  shareTurn(together);
  const [, page] = await Promise.all([
    todayPeople.GET.run(get("today/people"), together),
    contacts.GET.run(get("contacts"), together),
  ]);
  const { ctx } = ctxOf(w);
  const alone = (await todayPeople.GET.run(get("today/people"), ctx)).people;
  assert.deepStrictEqual(alone, mainOf(page));
  // The same reads as main made, one each, in a different order: People's page and its count, the reply modes, the
  // calendar's settings and its record, the deals (on file, the pace, the proposals out), the channels, the follow-up,
  // what the owner has seen and the team.
  const reads = asked(ctx);
  for (const once of ["rpc:people_list", "rpc:people_reply_modes", "rpc:contact_seen", "rpc:team_roster", "contacts"])
    assert.equal(reads.filter((r) => r === once).length, 1, `${once} read once`);
});

test("a request that reads People for Today, everyone in People and the calendar's board asks for People's first page once", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW_MS });
  const { ctx } = ctxOf(world(rowsOf()));
  // One turn, as GET open's reads share one: Today's read of People, the board around today, and everyone (the pools).
  shareTurn(ctx);
  const [today, board, all] = await Promise.all([
    todayPeople.GET.run(get("today/people"), ctx),
    calendar.GET.run(get("calendar", "&around=today"), ctx),
    load(readerContext(ctx, { tenantId: A, role: "owner" }), everyone, undefined).then((r) => r.data),
  ]);
  assert.equal(today.people.whole, true);
  assert.equal(all.length, 12, "everyone, from the one page");
  assert.ok(board.calendar, "the board drawn");
  assert.equal(asked(ctx).filter((r) => r === "rpc:people_list").length, 1);
});

// The two below wait with until(), which keeps its own time by the clock: theirs runs, and nothing they say hangs on a day.
test("what stands beside People's rows is read while they are on their way, not after them", async () => {
  const { ctx, open } = ctxOf(world(rowsOf()), { held: true });
  let answered = null;
  const answer = todayPeople.GET.run(get("today/people"), ctx).then((a) => (answered = a));
  try {
    // With People's page still held: the calendar's record, and what the owner has seen of the page's people (named by
    // the page's reply modes, which came first). Not the team a step can be for: it is read only once a row says a step
    // is for someone (00166).
    for (const read of ["appointments", "rpc:contact_seen"])
      await until(() => asked(ctx).includes(read), `${read} read beside People's rows`);
    assert.equal(answered, null, "nothing answered before People's rows");
  } finally {
    open();
    await answer;
  }
  assert.equal(answered.people.whole, true);
  assert.equal(asked(ctx).filter((r) => r === "rpc:contact_seen").length, 1, "and not read again for the rows");
  assert.equal(asked(ctx).filter((r) => r === "rpc:team_roster").length, 1, "the team, once a row named a teammate");
});

test("someone on the page the early list did not name is read for what the owner has seen, as the rows always were", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW_MS });
  // Rosa wrote between the two statements: the page's reply modes, read first, do not name her; its rows do.
  const w = world(rowsOf());
  const modes = (a) =>
    w.rpcs
      .people_list(a)
      .filter((r) => r.id !== pid(1))
      .map((r) => ({ id: r.id, mode: null }));
  const { ctx } = ctxOf({ tables: w.tables, rpcs: { ...w.rpcs, people_reply_modes: modes } });
  const people = (await todayPeople.GET.run(get("today/people"), ctx)).people;
  assert.equal(people.people.find((p) => p.id === pid(1)).marked_unread, true, "her mark read with the rows");
  assert.equal(asked(ctx).filter((r) => r === "rpc:contact_seen").length, 2);
});

test("a workspace of more than a page is answered how many there are, without waiting for the page", async () => {
  const w = world(rowsOf(989));
  const { ctx, open } = ctxOf(w, { held: true });
  let answered = null;
  const answer = todayPeople.GET.run(get("today/people"), ctx).then((a) => (answered = a));
  try {
    await until(() => answered !== null, "Today's read answered with People's page held");
  } finally {
    open();
    await answer;
  }
  assert.deepStrictEqual(answered.people, { whole: false, total: 1001 });
  // What main said of the same world: People's first page holds a thousand, more are counted, so only how many.
  const { ctx: theirs } = ctxOf(w);
  const page = await contacts.GET.run(get("contacts"), theirs);
  assert.equal(page.page.has_more, true);
  assert.deepStrictEqual(answered.people, mainOf(page));
});

test("a workspace of exactly a page is still all of People, read whole", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW_MS });
  const w = world(rowsOf(988));
  const { ctx } = ctxOf(w);
  shareTurn(ctx);
  const [today, page] = await Promise.all([
    todayPeople.GET.run(get("today/people"), ctx),
    contacts.GET.run(get("contacts"), ctx),
  ]);
  assert.equal(page.people.length, 1000);
  assert.equal(today.people.whole, true);
  assert.equal(today.people.total, 1000);
  assert.deepStrictEqual(today.people, mainOf(page));
});
