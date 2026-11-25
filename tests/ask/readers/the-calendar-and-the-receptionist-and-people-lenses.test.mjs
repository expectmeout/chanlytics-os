/**
 * The calendar for Ask exactly as the board assembles it, never writing; the Receptionist and People lenses for Ask
 * and for the page, on a database without their function yet, never failing for a part they could not read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { peopleNowOf, toPeopleReportVM, toReceptionistReportVM, toReviewsReportVM } from "@chanlytics/contracts";
import {
  A,
  ANA,
  BUSY,
  CALENDAR_ASKED_AT_MAIN,
  CAL_NOW,
  LENS,
  LINKED_ICS,
  LINKS,
  LINKS_URL,
  ONE_ICS,
  WEEK,
  asked,
  calCtx,
  calIn,
  calProfile,
  calTables,
  calendarReader,
  calendarRoute,
  calendarSources,
  config,
  everyoneReader,
  facts,
  findChannelsReadyOrNull,
  forgetFeeds,
  getCalendarWeek,
  googleRoute,
  kernel,
  logged,
  noReport,
  peopleLensWorld,
  peopleListDown,
  peopleReport,
  peopleRoute,
  peopleSeriesAnswer,
  peopleSeriesGone,
  receptionistReport,
  receptionistRoute,
  receptionistWorld,
  recordTogether,
  reportReader,
  req,
  reviewsReport,
  reviewsRoute,
  reviewsWorld,
  series,
  tuesday,
  turnIn,
  withFeed,
  worldCtx,
} from "./_readers.mjs";

test("the reviews' report on a database that does not have the ledger's function yet (00350 not applied) draws the listing alone: GET reports/reviews answers 200 with `ledger: null` and Google's read, said once in the log with the workspace; the fold's head is the listing's sentence, and any other refusal is still the route's failure", async () => {
  const gone = Object.assign(
    new Error("Could not find the function public.reviews_ledger(p_days, p_tenant_id) in the schema cache"),
    { code: "PGRST202" },
  );
  const absent = {
    ...reviewsWorld(),
    rpcs: {
      reviews_ledger: () => {
        throw gone;
      },
    },
  };
  const { ready: _ready, ...google } = (await googleRoute.GET.run(req(`?workspace=${A}`), worldCtx(reviewsWorld())))
    .google;
  const { result: page, lines } = await logged("reviews_ledger_missing", () =>
    reviewsRoute.GET.run(req(`?workspace=${A}`), worldCtx(absent)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "days", "google", "readable", "ledger"]);
  assert.equal(page.ledger, null);
  assert.equal(
    JSON.stringify(page.google),
    JSON.stringify(google),
    "Google as GET google reads it, listing and reviews",
  );
  assert.deepEqual([page.timezone, page.days, page.readable], ["Pacific/Auckland", 30, true]);
  assert.deepEqual(
    lines,
    [{ tenant_id: A }],
    "the window is visible in the logs, once for the read, naming the workspace",
  );

  const { result: r } = await logged("reviews_ledger_missing", () =>
    kernel.load(turnIn(worldCtx(absent)), reviewsReport, { days: 30, end: null }),
  );
  assert.deepEqual(r.data, page, "Ask's reader answers what the route does");

  const vm = toReviewsReportVM(page, { nowMs: Date.parse("2026-10-06T14:00:00Z") });
  assert.deepEqual([vm.state, vm.source, vm.waiting.total], ["linked", "places", 0]);
  assert.match(vm.lines.head, /^4\.8 on Google from 213 reviews; /, "the head says the listing's sentence");

  // A different code is not this window: the route fails as it does for any ledger that cannot be read.
  const denied = {
    ...reviewsWorld(),
    rpcs: {
      reviews_ledger: () => {
        throw Object.assign(new Error("permission denied for function reviews_ledger"), { code: "42501" });
      },
    },
  };
  const unsaid = await logged("reviews_ledger_missing", async () => {
    await assert.rejects(reviewsRoute.GET.run(req(`?workspace=${A}`), worldCtx(denied)), /permission denied/);
  });
  assert.deepEqual(unsaid.lines, [], "and the log does not call it the missing function");
});

test("the calendar, for Ask: the board's week exactly as getCalendarWeek assembles it (a read puts nobody in People) -- over calendar-feed's fixture with no calendar, a calendar that cannot be read, and its one appointment -- and each person its days name is a row, once, by the board's name for them", async () => {
  const none = calTables(null);
  const quiet = await getCalendarWeek(calCtx(none), A, WEEK, CAL_NOW);
  const noFeed = await kernel.load(calIn(calCtx(none)), calendarReader, WEEK);
  assert.deepEqual(noFeed.data, { calendar: quiet });
  assert.equal(quiet.feed.state, "none");
  assert.deepEqual(noFeed.rows, []);

  await logged("ask_feed_fetch_failed", () =>
    withFeed({ body: "nope", status: 503 }, async () => {
      const t = calTables("https://cal.example/down.ics");
      const want = await getCalendarWeek(calCtx(t), A, WEEK, CAL_NOW);
      const r = await kernel.load(calIn(calCtx(t)), calendarReader, WEEK);
      assert.deepEqual(r.data, { calendar: want });
      assert.deepEqual([want.feed.state, want.feed.reason, want.feed.status], ["unavailable", "http", 503]);
    }),
  );

  await withFeed({ body: ONE_ICS }, async (fetched) => {
    const t = calTables("https://cal.example/ok.ics");
    const want = await getCalendarWeek(
      calCtx(t, () => [ANA]),
      A,
      WEEK,
      CAL_NOW,
    );
    const r = await kernel.load(calIn(calCtx(t, () => [ANA])), calendarReader, WEEK);
    assert.deepEqual(r.data, { calendar: want }, "the week getCalendarWeek answers");
    assert.equal(JSON.stringify(r.data.calendar), JSON.stringify(want), "byte for byte");
    assert.equal(fetched.length, 1, "the calendar asked once: the second read took the loader's cache");
    assert.deepEqual(
      tuesday(want).items.map((i) => i.person?.id),
      [ANA.id],
      "the appointment names Ana by her number",
    );
    assert.ok(tuesday(want).windows.length > 0, "and the receptionist's windows beside it");
    assert.deepEqual(r.rows, [{ kind: "person", id: ANA.id, route: `clients/${ANA.id}`, label: "Ana Ruiz" }]);
    // Two appointments of hers are one row.
    const twice = ONE_ICS.replace(
      "END:VCALENDAR",
      [
        "BEGIN:VEVENT",
        "UID:a2",
        "SUMMARY:Ana Ruiz · Toner",
        "DESCRIPTION:Ana Ruiz +1 (917) 555-0100",
        "DTSTART;TZID=America/New_York:20260910T100000",
        "DTEND;TZID=America/New_York:20260910T110000",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );
    forgetFeeds();
    globalThis.fetch = async () => new Response(twice, { status: 200, headers: { "content-type": "text/calendar" } });
    const again = await kernel.load(calIn(calCtx(t, () => [ANA])), calendarReader, WEEK);
    assert.equal(again.data.calendar.days.flatMap((d) => d.items).length, 2);
    assert.deepEqual(
      again.rows.map((x) => x.id),
      [ANA.id],
    );
  });
});

test("the calendar's reader never writes (D7): an owner's Ask reads the board of a feed naming someone People does not hold and puts nobody in People -- no door called, nothing inserted -- and its zone and settings are the turn's: a turn that holds them reads neither again", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const made = [];
    const ctx = calCtx(calTables("https://cal.example/ok.ics"), () => [], made);
    const rc = calIn(ctx, "owner");
    await Promise.all([kernel.load(rc, facts, undefined), kernel.load(rc, config, undefined)]);
    const before = ctx.supabase.seen.length;
    const r = await kernel.load(rc, calendarReader, WEEK);
    assert.deepEqual(made, [], "nobody put in People");
    assert.deepEqual(
      recordTogether(
        ctx.supabase.seen.slice(before).map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`)),
        0,
      ),
      // The record's rows over the span and the notices' health line (00345) are read beside the feed, then everyone.
      // Last, once the feed has read, the record's taken time over the days on offer (record-busy.ts): this week does
      // not cover a fortnight's offer, so the board's open times ask for it rather than reuse the span's rows.
      // The span's record is two reads since a member's word on a visit (00397, findVisitsOver): the bookings, and the feed's
      // rows by key. The season's record beside everyone is two more (3 Nov 2026: each person's last visit).
      recordTogether(
        [
          "appointments.select",
          "appointments.select",
          "appointment_notices.select",
          "appointment_notices.select",
          "mailboxes.select",
          "rpc:people_list",
          "policies.select",
          "appointments.select",
          "appointments.select",
          "appointments.select",
        ],
        0,
      ),
      "the record, everyone, and nothing the turn already read: no door, no write",
    );
    assert.deepEqual(
      tuesday(r.data.calendar).items.map((i) => i.person),
      [null],
      "the appointment names nobody People holds",
    );
    assert.deepEqual(r.rows, []);
    // Read once a turn: the board again is the same read, and its sources are one read for any reader of them.
    assert.equal(kernel.load(rc, calendarReader, WEEK), kernel.load(rc, calendarReader, WEEK));
    const s = await kernel.load(rc, calendarSources, { ...WEEK, fresh: false });
    assert.notEqual(s.data.parsed, null, "the feed was read");
    assert.deepEqual(s.data.rows, [], "no booking has arrived by email");
    assert.deepEqual(s.rows, []);
    // What the board needs of the address and the settings, and not them: nothing a projection of the read could leak.
    assert.ok(!("url" in s.data) && !("cfg" in s.data), "no address, no raw settings");
    assert.equal(typeof s.data.source, "string");
    const json = JSON.stringify(s.data);
    assert.ok(
      !json.includes("cal.example") && !json.includes("front desk of Harbor"),
      "neither is anywhere in the read",
    );
    // The record (two reads since 00397: the bookings, and the feed's rows by key), the notices' two, the mailbox,
    // everyone, the policies, the season's record (two, since 3 Nov 2026) and the taken time: ten, and nothing asked
    // again.
    assert.equal(ctx.supabase.seen.length, before + 10, "nothing asked again");
  });
});

test("the board's open times leave out a booking that arrived by email, over the days the receptionist may offer, whichever span the page shows (00345)", async () => {
  // Tuesday noon in New York, two hours' notice, and ONE_ICS takes Tuesday two to half past three: the receptionist's
  // next open time is Tuesday half past three. Booksy emailed two bookings: the rest of Tuesday, and Wednesday one to two.
  const emailed = (id, from, to) => ({
    id,
    tenant_id: A,
    source: "booking_email",
    tool: "booksy",
    external_id: `booksy:${id}`,
    status: "booked",
    starts_at: from,
    ends_at: to,
    all_day: false,
    timezone: "America/New_York",
  });
  const withRecord = (rows) => ({ ...calTables("https://cal.example/ok.ics"), appointments: rows });
  const board = async (t, span) => (await kernel.load(calIn(calCtx(t)), calendarReader, span)).data.calendar;
  await withFeed({ body: ONE_ICS }, async () => {
    const alone = await board(withRecord([]), WEEK);
    assert.equal(alone.next_opening.start, "2026-09-08T19:30:00.000Z", "the feed alone: Tuesday, half past three");
    const t = withRecord([
      emailed("appt-1", "2026-09-08T19:30:00.000Z", "2026-09-08T22:00:00.000Z"),
      emailed("appt-2", "2026-09-09T17:00:00.000Z", "2026-09-09T18:00:00.000Z"),
    ]);
    // The week they fall in: both are drawn, Tuesday has nothing left to offer, and Wednesday's hour is left out.
    const week = await board(t, WEEK);
    const day = (key) => week.days.find((d) => d.key === key);
    assert.equal(day("2026-09-08").items.length, 2, "the feed's appointment and the emailed one");
    assert.deepEqual(day("2026-09-08").windows, []);
    assert.deepEqual(day("2026-09-09").windows, [
      { start: "2026-09-09T13:00:00.000Z", end: "2026-09-09T17:00:00.000Z" },
      { start: "2026-09-09T18:00:00.000Z", end: "2026-09-09T22:00:00.000Z" },
    ]);
    assert.equal(week.next_opening.start, "2026-09-09T13:00:00.000Z", "Wednesday at nine, as the receptionist offers");
    // A board turned to December draws none of those rows, and its next open time is still the receptionist's own: the
    // record is read over the days on offer, not the days on screen.
    const december = await board(t, { from: "2026-12-07", days: 7 });
    assert.equal(december.days.flatMap((d) => d.items).length, 0);
    assert.equal(december.next_opening.start, "2026-09-09T13:00:00.000Z");
  });
});

test("GET calendar through its reader asks what it asked at origin/main, in the same order -- the settings now through the config reader's columns -- less the write it made between the read and the board: no role's read puts the person the feed names in People (decision 0047, lane 6), and the board links nobody People does not hold", async (t) => {
  // The route reads the real clock, and People takes whom a feed names within a month of it (contracts
  // peopleFromItems). The feed's one appointment is on 8 September 2026, so with no clock this went red for good on
  // 8 October, thirty days on: nobody was added, and the last read asked for was missing. It runs on the clock the
  // file's other calendar tests name.
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  await withFeed({ body: ONE_ICS }, async () => {
    for (const role of ["owner", "operator", "viewer"]) {
      // One instance, three requests: a route keeps nothing across requests, so each asks for the zone again.
      const made = [];
      const ctx = calCtx(calTables("https://cal.example/route.ics", role), () => [], made);
      const page = await calendarRoute.GET.run(req(`?workspace=${A}&from=2026-09-07&days=7`), ctx);
      const want = CALENDAR_ASKED_AT_MAIN.map(([k, cols]) => [
        k,
        k === "tenant_config.select" ? "tenant_id, config, version, updated_at, updated_by" : cols,
      ]);
      // The record's five begin after the door, the zone and the settings.
      assert.deepEqual(
        recordTogether(
          ctx.supabase.seen.map((q) => (q.rpc ? [`rpc:${q.rpc}`, null] : [`${q.table}.${q.op}`, q.columns])),
          3,
        ),
        recordTogether(want, 3),
        role,
      );
      assert.deepEqual(
        made.map((a) => [a.p_tenant_id, a.p_phone_e164, a.p_display_name, a.p_source]),
        [],
        `${role}: nobody is put in People by a read`,
      );
      assert.deepEqual(
        tuesday(page.calendar).items.map((i) => i.person),
        [null],
        `${role}: the board links nobody People does not hold`,
      );
      assert.equal(page.calendar.days.length, 7);
      assert.ok(!JSON.stringify(page).includes("cal.example"), "the address never reaches the browser");
    }
  });
});

test("a route's turn takes the workspace's name and zone from its membership: GET calendar no longer asks for them, and says the membership row's zone; a turn handed none reads them as it did", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    // The membership's row as the real select embeds it (with-route.ts getMemberContext): its slug, name and zone. The
    // tenants table says another zone, so an answer in it would show the zone was read again.
    const t = calTables("https://cal.example/route.ics");
    t.memberships[0].tenants = { slug: "harbor", name: "Harbor", timezone: "Asia/Tokyo" };
    t.tenants[0].timezone = "UTC";
    const ctx = calCtx(t);
    const page = await calendarRoute.GET.run(req(`?workspace=${A}&from=2026-09-07&days=7`), ctx);
    const seen = ctx.supabase.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}:${q.columns}`));
    assert.ok(
      !seen.includes("tenants.select:name, timezone"),
      `the zone came with the membership: ${seen.join(" | ")}`,
    );
    assert.equal(seen[0], "memberships.select:tenant_id, role, tenants (slug, name, timezone)");
    assert.equal(page.calendar.timezone, "Asia/Tokyo", "the board's days are the membership row's");
    // Handed the facts, the turn answers them without asking; handed none, it asks as it always did.
    const held = kernel.readerContext(worldCtx({ tables: {} }), {
      tenantId: A,
      role: "owner",
      facts: { name: "Harbor", timezone: "Asia/Tokyo" },
    });
    assert.deepEqual((await kernel.load(held, facts, undefined)).data, { name: "Harbor", timezone: "Asia/Tokyo" });
    assert.deepEqual(held.ctx.supabase.seen, [], "nothing asked");
    const bare = turnIn(worldCtx({ tables: { tenants: [{ id: A, name: "Harbor", timezone: "UTC" }] } }));
    assert.equal((await kernel.load(bare, facts, undefined)).data.timezone, "UTC");
    assert.equal(bare.ctx.supabase.seen.length, 1);
  });
});

test("the Receptionist lens, for Ask and for the page: GET reports/receptionist answers its reader's payload, key for key and byte for byte, for each preset -- the database's series with the booking link counted against the calendar, and the hours beside it, no row of its own", async (t) => {
  // The route reads the real clock: the file's calendar tests name theirs.
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  await withFeed({ body: LINKED_ICS }, async () => {
    const w = receptionistWorld(LINKS_URL, { links: LINKS });
    for (const [period, days] of [
      ["7d", 7],
      ["30d", 30],
      ["90d", 90],
    ]) {
      const page = await receptionistRoute.GET.run(req(`?period=${period}&workspace=${A}`), worldCtx(w));
      const r = await kernel.load(calIn(worldCtx(w)), receptionistReport, { days, end: null });
      assert.equal(JSON.stringify(r.data), JSON.stringify(page), `${period}: the route's payload, byte for byte`);
      assert.deepEqual(Object.keys(page), ["timezone", "today", "end", "days", "series", "profile", "screened"]);
      assert.deepEqual(
        page.screened,
        { total: 0, by_reason: {} },
        "no call was kept off the list: a zero that was read",
      );
      assert.deepEqual([page.timezone, page.today, page.days], ["America/New_York", "2026-09-08", days]);
      assert.deepEqual(page.series.links, { sent: 3, booked: 1, calendar: "ok" });
      assert.deepEqual(r.rows, [], "drawn on the Reports page, whose row the report names");
    }
    await assert.rejects(
      receptionistRoute.GET.run(req(`?period=14d&workspace=${A}`), worldCtx(w)),
      (e) => e.status === 400,
      "a period that is none of the four is refused at the door",
    );
  });
});

test("the Receptionist lens counts the people sent the booking link against the calendar by asked-then-booked's own rule: of three, one has a visit after the link -- People once, the calendar once, and the zone and the settings once, whoever asks", async () => {
  await withFeed({ body: LINKED_ICS }, async (fetched) => {
    const ctx = worldCtx(receptionistWorld(LINKS_URL, { links: LINKS }));
    const r = await kernel.load(calIn(ctx), receptionistReport, LENS);
    assert.deepEqual(r.data.series.links, { sent: 3, booked: 1, calendar: "ok" });
    assert.equal("people" in r.data.series.links, false, "the people are counted, not carried");
    assert.equal(fetched.length, 1, "the calendar asked once");
    const seen = asked(ctx);
    for (const q of ["rpc:receptionist_series", "rpc:people_list", "tenants.select", "tenant_config.select"])
      assert.equal(seen.filter((x) => x === q).length, 1, `${q}: once`);
  });
});

test("the Receptionist lens on a database that does not have its function yet (00380 not applied) answers 200 with `series: null` and the window it was asked, said once in the log with the workspace; any other refusal is still the route's failure", async () => {
  const gone = Object.assign(
    new Error("Could not find the function public.receptionist_series(p_days, p_tenant_id) in the schema cache"),
    { code: "PGRST202" },
  );
  const absent = receptionistWorld(
    null,
    {},
    {
      receptionist_series: () => {
        throw gone;
      },
    },
  );
  const { result: page, lines } = await logged("receptionist_series_missing", () =>
    receptionistRoute.GET.run(req(`?workspace=${A}`), worldCtx(absent)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "days", "series", "profile", "screened"]);
  assert.equal(page.series, null);
  assert.deepEqual(page.screened, { total: 0, by_reason: {} }, "counted from the ledger, which needs no function");
  assert.deepEqual([page.timezone, page.days], ["America/New_York", 30]);
  assert.match(page.today, /^\d{4}-\d{2}-\d{2}$/, "the workspace's day, from the turn's clock and zone");
  assert.deepEqual(
    page.profile,
    { hours: calProfile.hours, closures: calProfile.closures },
    "the hours are still said",
  );
  assert.deepEqual(lines, [{ tenant_id: A }], "said once for the read, naming the workspace");

  const ctx = worldCtx(absent);
  const { result: r } = await logged("receptionist_series_missing", () =>
    kernel.load(turnIn(ctx), receptionistReport, LENS),
  );
  assert.deepEqual(r.data, page, "Ask's reader answers what the route does");
  assert.equal(asked(ctx).filter((q) => q === "rpc:people_list").length, 0, "nobody is read for a link nobody listed");

  // Days that ended before today name their last day in the answer, as the window was asked.
  const { result: ended } = await logged("receptionist_series_missing", () =>
    kernel.load(calIn(worldCtx(absent)), receptionistReport, { days: 20, end: "2026-08-31" }),
  );
  assert.deepEqual(
    [ended.data.timezone, ended.data.today, ended.data.end, ended.data.days, ended.data.series],
    ["America/New_York", "2026-09-08", "2026-08-31", 20, null],
  );

  // A different code is not this window: the route fails as it does for any read that cannot be made.
  const denied = receptionistWorld(
    null,
    {},
    {
      receptionist_series: () => {
        throw Object.assign(new Error("permission denied for function receptionist_series"), { code: "42501" });
      },
    },
  );
  const unsaid = await logged("receptionist_series_missing", async () => {
    await assert.rejects(receptionistRoute.GET.run(req(`?workspace=${A}`), worldCtx(denied)), /permission denied/);
  });
  assert.deepEqual(unsaid.lines, [], "and the log does not call it the missing function");
});

test("the Receptionist lens carries the calls kept off the owner's list as the ledger counts them (decision 0138; the count itself is reports/receptionist/screened-calls.test.mjs), and a ledger that cannot be read is null, said in the log, never the route's failure", async () => {
  const row = (id, data) => ({ id, tenant_id: A, kind: "call.screened", data, created_at: "2026-09-08T15:00:00Z" });
  const events = [row("e1", { reason: "refused", call_id: "call_a" }), row("e2", { reason: "selling", call_id: null })];
  const r = await kernel.load(calIn(worldCtx(receptionistWorld(null, { events }))), receptionistReport, LENS);
  assert.deepEqual(r.data.screened, { total: 2, by_reason: { refused: 1, selling: 1 } });
  const down = worldCtx(receptionistWorld(null), { "events.select": { message: "connection refused" } });
  const { result, lines } = await logged("screened_calls_failed", () =>
    kernel.load(calIn(down), receptionistReport, LENS),
  );
  assert.deepEqual([result.data.screened, !!result.data.series, lines.map((l) => l.tenant_id)], [null, true, [A]]);
});

test("the Receptionist lens: a function with no workspace is the route's 404 in its words, and a read that fails is its failure -- not found and could not read are two answers", async () => {
  const unknown = receptionistWorld(null, {}, { receptionist_series: () => ({ error: "unknown_tenant" }) });
  await assert.rejects(kernel.load(turnIn(worldCtx(unknown)), receptionistReport, LENS), noReport);
  await assert.rejects(receptionistRoute.GET.run(req(`?workspace=${A}`), worldCtx(unknown)), noReport);
  const down = receptionistWorld(
    null,
    {},
    {
      receptionist_series: () => {
        throw new Error("connection refused");
      },
    },
  );
  const failed = /receptionist_series: connection refused/;
  await assert.rejects(kernel.load(turnIn(worldCtx(down)), receptionistReport, LENS), failed);
  await assert.rejects(receptionistRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)), failed);
});

test("the Receptionist lens reads nobody it has no one to find: days that ended before today are 'ended', and a window in which no link was sent is none booked of none -- neither reads People or the calendar", async () => {
  await withFeed({ body: LINKED_ICS }, async (fetched) => {
    const ended = worldCtx(receptionistWorld(LINKS_URL, { today: "2026-10-06", links: LINKS }));
    const clock = new Date("2026-10-06T16:00:00Z");
    const r = await kernel.load(
      kernel.readerContext(ended, { tenantId: A, role: "viewer" }, clock),
      receptionistReport,
      {
        days: 20,
        end: "2026-09-20",
      },
    );
    assert.deepEqual(
      r.data.series.links,
      { sent: 3, booked: null, calendar: "ended" },
      "three were sent it; the page says why no more",
    );
    assert.equal(r.data.end, "2026-09-20");
    assert.deepEqual(
      ended.supabase.seen.filter((q) => q.rpc),
      [{ rpc: "receptionist_series", args: { p_tenant_id: A, p_days: 20, p_end: "2026-09-20" } }],
      "the series, and not People: the fake people_list is never called",
    );

    const quiet = worldCtx(receptionistWorld(LINKS_URL));
    const q = await kernel.load(calIn(quiet), receptionistReport, LENS);
    assert.deepEqual(q.data.series.links, { sent: 0, booked: 0, calendar: "ok" });
    assert.equal(asked(quiet).filter((x) => x === "rpc:people_list").length, 0, "no link sent: nobody to find");
    assert.equal(fetched.length, 0, "and the calendar was asked of neither");
  });
});

test("the Receptionist lens does not count who booked of a list the database cut short: with more people sent the link than it lists, `booked` is null with the calendar ok -- People and the calendar are not read, and the line says how many were sent and no more", async () => {
  await withFeed({ body: LINKED_ICS }, async (fetched) => {
    // receptionist_series lists at most 500 people and counts them all: a count of the listed would understate.
    const listed = Array.from({ length: 500 }, (_, i) => ({ c: `k-${i}`, at: "2026-09-07T15:00:00.000Z" }));
    const cut = worldCtx(receptionistWorld(LINKS_URL, { links: { total: 501, people: listed } }));
    const r = await kernel.load(calIn(cut), receptionistReport, LENS);
    assert.deepEqual(r.data.series.links, { sent: 501, booked: null, calendar: "ok" });
    assert.equal(asked(cut).filter((x) => x === "rpc:people_list").length, 0, "nobody is read for a count that is cut");
    assert.equal(fetched.length, 0, "nor the calendar");
    assert.equal(
      toReceptionistReportVM(r.data, { nowMs: CAL_NOW.getTime() }).link.line,
      "501 people were sent the booking link.",
      "the fold says how many were sent, and nothing of a calendar that could not be asked",
    );

    // The whole list listed is counted as ever: 500 sent, 500 listed.
    const whole = worldCtx(receptionistWorld(LINKS_URL, { links: { total: 500, people: listed } }));
    const w = await kernel.load(calIn(whole), receptionistReport, LENS);
    assert.deepEqual(w.data.series.links, { sent: 500, booked: 0, calendar: "ok" });
    assert.equal(asked(whole).filter((x) => x === "rpc:people_list").length, 1);
  });
});

test("the Receptionist lens never fails for the booking link: a workspace with no calendar, a calendar that cannot be read and People that cannot be read are each said as what they are, with `booked` null and never 0", async () => {
  const none = await kernel.load(calIn(worldCtx(receptionistWorld(null, { links: LINKS }))), receptionistReport, LENS);
  assert.deepEqual(none.data.series.links, { sent: 3, booked: null, calendar: "none" });

  const { result: down } = await logged("ask_feed_fetch_failed", () =>
    withFeed({ body: "nope", status: 503 }, () =>
      kernel.load(calIn(worldCtx(receptionistWorld(LINKS_URL, { links: LINKS }))), receptionistReport, LENS),
    ),
  );
  assert.deepEqual(down.data.series.links, { sent: 3, booked: null, calendar: "unavailable" });

  const unreadable = receptionistWorld(
    LINKS_URL,
    { links: LINKS },
    {
      people_list: () => {
        throw new Error("people down");
      },
    },
  );
  const { result: broken, lines } = await logged("booking_report_failed", () =>
    kernel.load(calIn(worldCtx(unreadable)), receptionistReport, LENS),
  );
  assert.deepEqual(broken.data.series.links, { sent: 3, booked: null, calendar: "unavailable" });
  assert.equal(lines.length, 1, "logged once, never fatal");
  assert.equal(lines[0].tenant_id, A);
  assert.match(lines[0].error, /people down/);
  assert.notEqual(broken.data.series.hold, undefined, "and the rest of the lens is answered");
});

test("the Receptionist lens counts who waits on you by the one rule: a flagged thread nobody has, a call-back among them -- not one a teammate has, not one put aside", async () => {
  const escalation = (reason, created_at, state, over = {}) => ({
    reason,
    created_at,
    state,
    paused_until: null,
    assignee_user_id: null,
    ...over,
  });
  const open = [
    escalation("human_token", "2026-09-21T08:00:00Z", "needs_human"),
    escalation("callback", "2026-09-21T09:00:00Z", "open"),
    escalation("manual", "2026-09-21T07:00:00Z", "open", { assignee_user_id: "u2" }), // a teammate has it
    escalation("human_token", "2026-09-20T09:00:00Z", "snoozed"), // put aside
  ];
  const ctx = worldCtx(receptionistWorld(null, { today: "2026-09-21", stuck: { open } }));
  const clock = new Date("2026-09-21T12:00:00Z");
  const r = await kernel.load(
    kernel.readerContext(ctx, { tenantId: A, role: "viewer" }, clock),
    receptionistReport,
    LENS,
  );
  assert.deepEqual(r.data.series.stuck, {
    waiting: 2,
    oldest_at: "2026-09-21T08:00:00Z",
    callbacks: 1,
    capped: false,
  });
});

test("the Receptionist lens carries the hours and closures the report carries -- one read of the same config in the turn -- and none where the config cannot be read", async () => {
  const w = receptionistWorld(null, {}, { report_series: series });
  const ctx = worldCtx(w);
  const rc = calIn(ctx);
  const [page, lens] = await Promise.all([
    kernel.load(rc, reportReader, LENS),
    kernel.load(rc, receptionistReport, LENS),
  ]);
  assert.deepEqual(lens.data.profile, page.data.profile, "one derivation of the profile");
  assert.deepEqual(lens.data.profile, { hours: calProfile.hours, closures: calProfile.closures });
  assert.equal(asked(ctx).filter((q) => q === "tenant_config.select").length, 1, "the config is read once for both");

  // No row, and a config the parser refuses (a brain without its name, prompt and fallbacks): no profile, and the series is answered.
  const noRow = receptionistWorld(null);
  noRow.tables.tenant_config = [];
  const refused = receptionistWorld(null);
  refused.tables.tenant_config = [
    { tenant_id: A, config: { brain: { profile: { hours: calProfile.hours } } }, version: 1 },
  ];
  for (const world of [noRow, refused]) {
    const r = await kernel.load(calIn(worldCtx(world)), receptionistReport, LENS);
    assert.equal(r.data.profile, null);
    assert.notEqual(r.data.series, null);
  }
});

test("the People lens, for Ask and for the page: GET reports/people answers its reader's payload, key for key and byte for byte, for each preset -- the database's series and the book as it stands now, no row of its own", async (t) => {
  // The route reads the real clock: the book's days are counted from the turn's.
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  const w = peopleLensWorld(BUSY);
  for (const [period, days] of [
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ]) {
    const page = await peopleRoute.GET.run(req(`?period=${period}&workspace=${A}`), worldCtx(w));
    const r = await kernel.load(calIn(worldCtx(w)), peopleReport, { days, end: null });
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), `${period}: the route's payload, byte for byte`);
    assert.deepEqual(Object.keys(page), ["timezone", "today", "end", "days", "series", "now"]);
    assert.deepEqual([page.timezone, page.today, page.days], ["America/New_York", "2026-09-08", days]);
    assert.deepEqual(r.rows, [], "drawn on the Reports page, whose row the report names");
  }
  await assert.rejects(
    peopleRoute.GET.run(req(`?period=14d&workspace=${A}`), worldCtx(w)),
    (e) => e.status === 400,
    "a period that is none of the four is refused at the door",
  );
});

test("the People lens carries the series as the database gave it and the book as People counts it: peopleNowOf over the rows People holds, in the workspace's zone at the turn's clock, judged against what the workspace can send on", async () => {
  const w = peopleLensWorld(BUSY);
  const r = await kernel.load(calIn(worldCtx(w)), peopleReport, LENS);
  assert.deepEqual(r.data.series, peopleSeriesAnswer({ p_days: 30 }, BUSY), "the series, as the database gave it");

  const held = (await kernel.load(calIn(worldCtx(w)), everyoneReader, undefined)).data;
  const ready = await findChannelsReadyOrNull(worldCtx(w), A, { withPause: false });
  assert.notEqual(ready, null, "the channels are read, WhatsApp among them");
  const nowMs = CAL_NOW.getTime();
  assert.deepEqual(r.data.now, peopleNowOf(held, { tz: "America/New_York", nowMs, ready }));
  assert.equal(r.data.now.people, 5);
  assert.deepEqual(
    r.data.now.fresh,
    { under_7: 1, d7_30: 2, d31_60: 1, d61_90: 0, d91_up: 1, never: 0 },
    "the fifth, 22:00 on the 1st in New York, was heard 7 days ago by the workspace's days",
  );
  const inUtc = peopleNowOf(held, { tz: "UTC", nowMs, ready });
  assert.deepEqual(
    inUtc.fresh,
    { under_7: 2, d7_30: 1, d31_60: 1, d61_90: 0, d91_up: 1, never: 0 },
    "and 6 by UTC's: the zone is what tells the two apart",
  );
  assert.notDeepEqual(r.data.now.fresh, inUtc.fresh);
  assert.deepEqual(r.data.now.steps, { overdue: 1, due_today: 1 }, "the days of the steps are the workspace's");
  assert.deepEqual(r.data.now.wires, {
    whatsapp_only: 4,
    sms_only: 0,
    phone_only: 0,
    email_only: 0,
    instagram_only: 0,
    several: 1,
    none: 0,
  });

  // The channels count: with no WhatsApp number nobody can be sent offers, which counting by WhatsApp alone (the channels not read) would not say.
  const dark = await kernel.load(calIn(worldCtx(peopleLensWorld(BUSY, {}, []))), peopleReport, LENS);
  assert.equal(r.data.now.lists.offers_ok, 4);
  assert.equal(dark.data.now.lists.offers_ok, 0);
  assert.equal(peopleNowOf(held, { tz: "America/New_York", nowMs, ready: null }).lists.offers_ok, 4);
  assert.equal(
    dark.data.now.lists.opted_in,
    r.data.now.lists.opted_in,
    "the yes is theirs, whether or not you can send",
  );
});

test("the People lens on a database that does not have its function yet (00395 not applied) answers 200 with `series: null`, the book and the window it was asked, said once in the log with the workspace; any other refusal is still the route's failure", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  const absent = peopleLensWorld(BUSY, { people_series: peopleSeriesGone });
  const { result: page, lines } = await logged("people_series_missing", () =>
    peopleRoute.GET.run(req(`?workspace=${A}`), worldCtx(absent)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "days", "series", "now"]);
  assert.equal(page.series, null);
  assert.deepEqual([page.timezone, page.today, page.days], ["America/New_York", "2026-09-08", 30]);
  assert.equal(page.now.people, 5, "the book does not need the function");
  assert.deepEqual(lines, [{ tenant_id: A }], "said once for the read, naming the workspace");

  const ctx = worldCtx(absent);
  const { result: r } = await logged("people_series_missing", () => kernel.load(calIn(ctx), peopleReport, LENS));
  assert.deepEqual(r.data, page, "Ask's reader answers what the route does");
  const seen = asked(ctx);
  for (const q of ["rpc:people_list", "tenants.select"])
    assert.equal(seen.filter((x) => x === q).length, 1, `${q}: once, whichever half asks`);

  // Days that ended before today name their last day in the answer, as the window was asked.
  const { result: ended } = await logged("people_series_missing", () =>
    kernel.load(calIn(worldCtx(absent)), peopleReport, { days: 20, end: "2026-08-31" }),
  );
  assert.deepEqual(
    [ended.data.timezone, ended.data.today, ended.data.end, ended.data.days, ended.data.series],
    ["America/New_York", "2026-09-08", "2026-08-31", 20, null],
  );
  assert.equal(ended.data.now.people, 5);

  // A different code is not this window: the route fails as it does for any read that cannot be made.
  const denied = peopleLensWorld(BUSY, {
    people_series: () => {
      throw Object.assign(new Error("permission denied for function people_series"), { code: "42501" });
    },
  });
  const unsaid = await logged("people_series_missing", async () => {
    await assert.rejects(peopleRoute.GET.run(req(`?workspace=${A}`), worldCtx(denied)), /permission denied/);
  });
  assert.deepEqual(unsaid.lines, [], "and the log does not call it the missing function");
});

test("the People lens: a function with no workspace is the route's 404 in its words, and a read that fails is its failure -- not found and could not read are two answers", async () => {
  const unknown = peopleLensWorld(BUSY, { people_series: () => ({ error: "unknown_tenant" }) });
  await assert.rejects(kernel.load(turnIn(worldCtx(unknown)), peopleReport, LENS), noReport);
  await assert.rejects(peopleRoute.GET.run(req(`?workspace=${A}`), worldCtx(unknown)), noReport);
  const down = peopleLensWorld(BUSY, {
    people_series: () => {
      throw new Error("connection refused");
    },
  });
  const failed = /people_series: connection refused/;
  await assert.rejects(kernel.load(turnIn(worldCtx(down)), peopleReport, LENS), failed);
  await assert.rejects(peopleRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)), failed);
});

test("the People lens never fails for its book: People that cannot be read leave `now: null`, said once in the log with the workspace, and the series is answered -- each half fails alone, and both gone still answer the window as it was asked", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  const down = peopleLensWorld(BUSY, { people_list: peopleListDown });
  const { result: page, lines } = await logged("people_pool_failed", () =>
    peopleRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "end", "days", "series", "now"]);
  assert.equal(page.now, null);
  assert.deepEqual(page.series, peopleSeriesAnswer({ p_days: 30 }, BUSY), "and the rest of the lens is answered");
  assert.equal(lines.length, 1, "logged once, never fatal");
  assert.equal(lines[0].tenant_id, A);
  assert.match(lines[0].error, /people down/);

  const { result: r } = await logged("people_pool_failed", () =>
    kernel.load(calIn(worldCtx(down)), peopleReport, LENS),
  );
  assert.deepEqual(r.data, page, "Ask's reader answers what the route does");

  const both = peopleLensWorld(BUSY, { people_series: peopleSeriesGone, people_list: peopleListDown });
  const { result: neither, lines: poolLines } = await logged("people_pool_failed", () =>
    kernel.load(calIn(worldCtx(both)), peopleReport, LENS),
  );
  const none = neither.data;
  assert.deepEqual([none.series, none.now, none.days, none.today], [null, null, 30, "2026-09-08"]);
  assert.equal(poolLines.length, 1, "the book's failure is said once beside the missing function's");
});

test("the People lens never fails the route for a zone it cannot read: a database without its function whose workspace row cannot be read answers `series: null, now: null` -- the book's failure said once in the log -- and Ask's tool reads that as `available: false`", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  const absent = peopleLensWorld(BUSY, { people_series: peopleSeriesGone });
  const zoneDown = { "tenants.select": { message: "tenants down" } };
  const { result: r, lines } = await logged("people_pool_failed", () =>
    kernel.load(calIn(worldCtx(absent, zoneDown)), peopleReport, LENS),
  );
  const none = r.data;
  assert.deepEqual([none.series, none.now, none.days], [null, null, 30], "neither half, and the days as asked");
  assert.deepEqual(Object.keys(none), ["timezone", "today", "days", "series", "now"]);
  assert.equal(
    typeof none.timezone,
    "string",
    "a zone and a day the type holds, though nothing reads them of this answer",
  );
  assert.match(none.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(r.rows, []);
  assert.equal(lines.length, 1, "the book's failure is said once");
  assert.match(lines[0].error, /tenants down/);
  const lens = toPeopleReportVM(none);
  assert.deepEqual([lens.windowAvailable, lens.nowAvailable], [false, false], "Ask's tool: `{ available: false }`");

  // Days that ended before today name their last day, as the window was asked.
  const { result: ended } = await logged("people_pool_failed", () =>
    kernel.load(calIn(worldCtx(absent, zoneDown)), peopleReport, { days: 20, end: "2026-08-31" }),
  );
  assert.deepEqual(
    [ended.data.end, ended.data.days, ended.data.series, ended.data.now],
    ["2026-08-31", 20, null, null],
  );

  // The zone is only the missing function's trouble when both fail: with the function there, a zone that cannot be read is the series' answer to give.
  const { result: there } = await logged("people_pool_failed", () =>
    kernel.load(calIn(worldCtx(peopleLensWorld(BUSY), zoneDown)), peopleReport, LENS),
  );
  assert.deepEqual(there.data.series, peopleSeriesAnswer({ p_days: 30 }, BUSY), "the window is answered");
  assert.equal(there.data.now, null, "and the book, which needs the zone, is not");
});

test("the People lens reads its book for days that ended before today as well: the book is as of now and the window is the database's -- people_series is asked with the last day named, and People once", async () => {
  const ctx = worldCtx(peopleLensWorld(BUSY));
  const ended = await kernel.load(calIn(ctx), peopleReport, { days: 20, end: "2026-08-31" });
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "people_series"),
    [{ rpc: "people_series", args: { p_tenant_id: A, p_days: 20, p_end: "2026-08-31" } }],
    "the database counts the 20 days to the 31st",
  );
  assert.equal(asked(ctx).filter((x) => x === "rpc:people_list").length, 1, "and People is read");
  assert.equal(ended.data.end, "2026-08-31");
  assert.equal(ended.data.days, 20);
  const live = await kernel.load(calIn(worldCtx(peopleLensWorld(BUSY))), peopleReport, LENS);
  assert.deepEqual(ended.data.now, live.data.now, "the book is the same as of now, whichever days are asked");
});

test("the People lens reads each of its things once in a turn: the series, People, the zone and the channels -- and a turn that already loaded People for the report reads People once", async () => {
  const ctx = worldCtx(peopleLensWorld(BUSY));
  await kernel.load(calIn(ctx), peopleReport, LENS);
  for (const q of ["rpc:people_series", "rpc:people_list", "tenants.select", "tenant_channels.select", "lines.select"])
    assert.equal(asked(ctx).filter((x) => x === q).length, 1, `${q}: once`);

  const both = worldCtx(peopleLensWorld(BUSY, { report_series: series }));
  const rc = calIn(both);
  await Promise.all([kernel.load(rc, reportReader, LENS), kernel.load(rc, peopleReport, LENS)]);
  await kernel.load(rc, peopleReport, LENS);
  assert.equal(
    asked(both).filter((x) => x === "rpc:people_list").length,
    1,
    "the report counted People for its booking line; the lens counts the same read",
  );
  assert.equal(asked(both).filter((x) => x === "rpc:people_series").length, 1);
});
