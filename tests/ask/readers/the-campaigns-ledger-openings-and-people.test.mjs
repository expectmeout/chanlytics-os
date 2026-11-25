/**
 * The Campaigns lens' ledger as the page reads it, the workspace's and not the member's; the openings; the
 * cross-turn cache, opt-in; the business's shape; the people list and the lists, for Ask and for the page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TIMEZONE, numberHealthOfConfig, personName } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { NOW as LEDGER_NOW, STUCK_NOW } from "../../reports/campaigns/_campaign-world.mjs";
import {
  A,
  B,
  BUSY,
  CAL_NOW,
  CONFIG_READER_COLUMNS,
  LEDGER_CLOCK,
  LENS,
  NOTHING_STUCK,
  ONE_ICS,
  P1,
  P2,
  PEOPLE_ASKED_AT_MAIN,
  PEOPLE_ASKED_NOW,
  PEOPLE_KEYS,
  RED_CONFIG,
  SEG1,
  SEG2,
  WEDNESDAY_TAKEN,
  appointmentWord,
  asked,
  askedWith,
  bagOf,
  businessShape,
  calCtx,
  calIn,
  calTables,
  calendarRoute,
  campaignLedgerReport,
  config,
  contactsRoute,
  counting,
  ctxFor,
  dayCtx,
  facts,
  getOpenings,
  hasDeals,
  kernel,
  ledgerAnswer,
  ledgerGone,
  ledgerIn,
  ledgerRoute,
  ledgerWorld,
  listEveryone,
  listWorld,
  listsReader,
  logged,
  noReport,
  numberOf,
  openingsReader,
  openingsRoute,
  pagingWorld,
  peopleLensWorld,
  peopleReader,
  peopleReport,
  peopleWorld,
  recordApart,
  refusedFunction,
  reportMembers,
  req,
  segmentsRoute,
  segmentsWorld,
  selects,
  stuckGone,
  tables,
  turnIn,
  withFeed,
  worldCtx,
} from "./_readers.mjs";

test("the People lens is the workspace's, not the member's: the same answer for an owner and a viewer, whoever a step in the book is for", async () => {
  const w = peopleLensWorld(BUSY);
  const viewer = await kernel.load(calIn(worldCtx(w), "viewer"), peopleReport, LENS);
  const owner = await kernel.load(
    kernel.readerContext({ ...worldCtx(w), userId: "u2" }, { tenantId: A, role: "owner" }, CAL_NOW),
    peopleReport,
    LENS,
  );
  assert.equal(JSON.stringify(owner.data), JSON.stringify(viewer.data));
  assert.notEqual(owner.data.now, null);
});

test("the Campaigns lens' ledger, for Ask and for the page: GET reports/campaigns/ledger answers its reader's payload, key for key and byte for byte, for each preset -- the database's series and what is stuck, judged; no row of its own", async (t) => {
  // The route reads the real clock: what is stuck is judged at the turn's.
  t.mock.timers.enable({ apis: ["Date"], now: LEDGER_NOW });
  const w = ledgerWorld();
  for (const [period, days] of [
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ]) {
    const page = await ledgerRoute.GET.run(req(`?period=${period}&workspace=${A}`), worldCtx(w));
    const r = await kernel.load(ledgerIn(worldCtx(w)), campaignLedgerReport, { days, end: null });
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), `${period}: the route's payload, byte for byte`);
    assert.deepEqual(Object.keys(page), ["timezone", "today", "end", "days", "series", "stuck"]);
    assert.deepEqual([page.timezone, page.today, page.days], ["America/New_York", "2026-09-04", days]);
    assert.deepEqual(r.rows, [], "drawn on the Reports page, whose row the report names");
  }
  await assert.rejects(
    ledgerRoute.GET.run(req(`?period=14d&workspace=${A}`), worldCtx(w)),
    (e) => e.status === 400,
    "a period that is none of the four is refused at the door",
  );
});

test("the Campaigns lens' ledger carries the series as the database gave it, judges what is stuck by the product's own rules at the turn's clock, and says the number's health from the channel's stored config", async () => {
  const w = ledgerWorld();
  const r = await kernel.load(ledgerIn(worldCtx(w)), campaignLedgerReport, LENS);
  assert.deepEqual(r.data.series, ledgerAnswer({ p_days: 30 }), "the series, as the database gave it");

  const health = numberHealthOfConfig(RED_CONFIG);
  assert.deepEqual(
    r.data.stuck,
    {
      ...STUCK_NOW,
      number: {
        state: "read",
        tone: "danger",
        can_send: false,
        label: health.label,
        standing: null,
        checked_at: "2026-09-04T12:30:00.000Z",
      },
    },
    "the world's stuck half, judged at its clock, with a red number beside it",
  );
  assert.equal(r.data.stuck.waiting.late, 1, "of the three runs waiting, only the one made for yesterday is refused");
  assert.equal(r.data.stuck.number.tone, "danger");
  assert.equal(r.data.stuck.number.can_send, false);

  // The clock is the turn's: one minute past Harbor's midnight, the run made for Sep 4 is late as well.
  const pastMidnight = new Date("2026-09-05T04:01:00Z");
  const later = await kernel.load(ledgerIn(worldCtx(w), "viewer", pastMidnight), campaignLedgerReport, LENS);
  assert.equal(later.data.stuck.waiting.late, 2, "judged at the turn's clock, in the workspace's zone");
  assert.deepEqual(later.data.series, r.data.series, "the series is the database's, whatever the clock");

  // A rating that is good, and a number Meta keeps standing against, are the gate's own words.
  const green = { quality_rating: "GREEN", quality_at: "2026-09-03T08:00:00.000Z" };
  const ok = await kernel.load(ledgerIn(worldCtx(ledgerWorld({}, numberOf(green)))), campaignLedgerReport, LENS);
  assert.deepEqual(ok.data.stuck.number, {
    state: "read",
    tone: "ok",
    can_send: true,
    label: numberHealthOfConfig(green).label,
    standing: null,
    checked_at: "2026-09-03T08:00:00.000Z",
  });

  // The same good rating with Meta's standing against the number (BLOCKED, kept under the config's `standing`, 00338): the
  // whole stored config reaches the rule, so the lens says the number cannot send, as the composer's gate refuses it.
  const blocked = { ...green, standing: { can_send: "BLOCKED", problems: [], notes: [] } };
  const stopped = await kernel.load(ledgerIn(worldCtx(ledgerWorld({}, numberOf(blocked)))), campaignLedgerReport, LENS);
  assert.deepEqual(stopped.data.stuck.number, {
    state: "read",
    tone: "danger",
    can_send: false,
    label: numberHealthOfConfig(green).label,
    standing: { word: numberHealthOfConfig(blocked).word, sentence: numberHealthOfConfig(blocked).refusal },
    checked_at: "2026-09-03T08:00:00.000Z",
  });
  assert.deepEqual(
    [numberHealthOfConfig(blocked).tone, numberHealthOfConfig(blocked).canSend],
    ["danger", false],
    "and it is the rule's own answer for that config, not the rating's",
  );
});

test("the Campaigns lens' ledger on a database that does not have its functions yet (00405, 00406 not applied) answers 200 -- without campaign_ledger `series: null`, the window it was asked and what is stuck; without campaign_stuck `stuck: null` -- each said once in the log; any other refusal is still the route's failure", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: LEDGER_NOW });
  const noLedger = ledgerWorld({ campaign_ledger: ledgerGone });
  const { result: page, lines } = await logged("campaign_ledger_missing", () =>
    ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(noLedger)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "days", "series", "stuck"]);
  assert.equal(page.series, null);
  assert.deepEqual([page.timezone, page.today, page.days], ["America/New_York", "2026-09-04", 30]);
  assert.deepEqual(page.stuck.waiting, STUCK_NOW.waiting, "what is stuck does not need the function");
  assert.deepEqual(lines, [{ tenant_id: A }], "said once for the read, naming the workspace");

  const { result: r } = await logged("campaign_ledger_missing", () =>
    kernel.load(ledgerIn(worldCtx(noLedger)), campaignLedgerReport, LENS),
  );
  assert.deepEqual(r.data, page, "Ask's reader answers what the route does");

  // Days that ended before today name their last day in the answer, as the window was asked.
  const { result: ended } = await logged("campaign_ledger_missing", () =>
    kernel.load(ledgerIn(worldCtx(noLedger)), campaignLedgerReport, { days: 20, end: "2026-08-31" }),
  );
  assert.deepEqual(
    [ended.data.timezone, ended.data.today, ended.data.end, ended.data.days, ended.data.series],
    ["America/New_York", "2026-09-04", "2026-08-31", 20, null],
  );
  assert.deepEqual(ended.data.stuck, r.data.stuck, "what is stuck is as of now, whichever days are asked");

  // The zone is the workspace's (the turn's); one that cannot be read is the product's default, never the route's failure.
  const auckland = {
    ...noLedger,
    tables: { ...noLedger.tables, tenants: [{ ...noLedger.tables.tenants[0], timezone: "Pacific/Auckland" }] },
  };
  const { result: nz } = await logged("campaign_ledger_missing", () =>
    kernel.load(ledgerIn(worldCtx(auckland)), campaignLedgerReport, LENS),
  );
  assert.deepEqual(
    [nz.data.timezone, nz.data.today],
    ["Pacific/Auckland", "2026-09-05"],
    "Harbor's own day, ahead of UTC",
  );
  const unzoned = worldCtx(auckland, { "tenants.select": { message: "tenants down" } });
  const { result: lost } = await logged("campaign_ledger_missing", () =>
    kernel.load(ledgerIn(unzoned), campaignLedgerReport, LENS),
  );
  assert.deepEqual([lost.data.timezone, lost.data.series], [DEFAULT_TIMEZONE, null]);
  assert.notEqual(DEFAULT_TIMEZONE, "Pacific/Auckland");

  // Without campaign_stuck as well: nothing stuck is said, once.
  const neither = ledgerWorld({ campaign_ledger: ledgerGone, campaign_stuck: stuckGone });
  const { result: bare, lines: bareLines } = await logged("campaign_stuck_missing", () =>
    ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(neither)),
  );
  assert.deepEqual(Object.keys(bare), ["timezone", "today", "days", "series", "stuck"]);
  assert.deepEqual([bare.series, bare.stuck], [null, null]);
  assert.deepEqual(bareLines, [{ tenant_id: A }], "the missing function is said once, and it is not a failure");
  const { lines: bareLedger } = await logged("campaign_ledger_missing", () =>
    ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(neither)),
  );
  assert.deepEqual(bareLedger, [{ tenant_id: A }], "and the ledger's, once beside it");
  // And with the ledger there: the window is the database's, and the stuck half is the one missing.
  const noStuck = ledgerWorld({ campaign_stuck: stuckGone });
  const { result: half } = await logged("campaign_stuck_missing", () =>
    ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(noStuck)),
  );
  assert.deepEqual(half.series, ledgerAnswer({ p_days: 30 }));
  assert.equal(half.stuck, null);
  assert.equal("stuck_failed" in half, false, "a function the database lacks is no failure");

  // A different code is not this window: the route fails as it does for any read that cannot be made.
  const denied = ledgerWorld({ campaign_ledger: refusedFunction("campaign_ledger") });
  const unsaid = await logged("campaign_ledger_missing", async () => {
    await assert.rejects(ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(denied)), /permission denied/);
  });
  assert.deepEqual(unsaid.lines, [], "and the log does not call it the missing function");
});

test("the Campaigns lens' ledger: a function with no workspace is the route's 404 in its words, and a read that fails is its failure -- not found and could not read are two answers", async () => {
  const unknown = ledgerWorld({ campaign_ledger: () => ({ error: "unknown_tenant" }) });
  await assert.rejects(kernel.load(turnIn(worldCtx(unknown)), campaignLedgerReport, LENS), noReport);
  await assert.rejects(ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(unknown)), noReport);
  // An answer short of a part the lens is made of is no answer either.
  const short = ledgerWorld({ campaign_ledger: (a) => ({ ...ledgerAnswer(a), runs: null }) });
  await assert.rejects(kernel.load(turnIn(worldCtx(short)), campaignLedgerReport, LENS), noReport);
  const down = ledgerWorld({
    campaign_ledger: () => {
      throw new Error("connection refused");
    },
  });
  const failed = /campaign_ledger: connection refused/;
  await assert.rejects(kernel.load(turnIn(worldCtx(down)), campaignLedgerReport, LENS), failed);
  await assert.rejects(ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)), failed);
});

test("the Campaigns lens' ledger never fails for what is stuck: campaign_stuck failing, or answering what is no list of runs, replies and templates, leaves `stuck: null` and `stuck_failed: true` -- said once in the log with the workspace -- and the series is answered", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: LEDGER_NOW });
  const down = ledgerWorld({
    campaign_stuck: () => {
      throw new Error("connection refused");
    },
  });
  const { result: page, lines } = await logged("campaign_stuck_failed", () =>
    ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "end", "days", "series", "stuck", "stuck_failed"]);
  assert.equal(page.stuck, null);
  assert.equal(page.stuck_failed, true);
  assert.deepEqual(page.series, ledgerAnswer({ p_days: 30 }), "and the rest of the lens is answered");
  assert.equal(lines.length, 1, "logged once, never fatal");
  assert.equal(lines[0].tenant_id, A);
  assert.match(lines[0].error, /campaign_stuck: connection refused/);

  const { result: r } = await logged("campaign_stuck_failed", () =>
    kernel.load(ledgerIn(worldCtx(down)), campaignLedgerReport, LENS),
  );
  assert.equal(JSON.stringify(r.data), JSON.stringify(page), "Ask's reader answers what the route does");

  // An answer that is not the four lists (the database's own `{ error }`) is a failed read as well, and so is a refusal.
  for (const stuck of [
    () => ({ error: "unknown_tenant" }),
    () => ({ ...NOTHING_STUCK, replies: [null] }),
    refusedFunction("campaign_stuck"),
  ]) {
    const said = await logged("campaign_stuck_failed", () =>
      kernel.load(ledgerIn(worldCtx(ledgerWorld({ campaign_stuck: stuck }))), campaignLedgerReport, LENS),
    );
    assert.deepEqual([said.result.data.stuck, said.result.data.stuck_failed], [null, true]);
    assert.equal(said.lines.length, 1);
    assert.deepEqual(said.result.data.series, ledgerAnswer({ p_days: 30 }));
  }
  const refused = await logged("campaign_stuck_missing", () =>
    kernel.load(
      ledgerIn(worldCtx(ledgerWorld({ campaign_stuck: refusedFunction("campaign_stuck") }))),
      campaignLedgerReport,
      LENS,
    ),
  );
  assert.deepEqual(refused.lines, [], "a refusal is a failure, not the missing function");

  // Nothing stuck is an answer: every list empty, which is a zero, and not a failure.
  const quiet = await kernel.load(
    ledgerIn(worldCtx(ledgerWorld({ campaign_stuck: () => NOTHING_STUCK }))),
    campaignLedgerReport,
    LENS,
  );
  assert.equal("stuck_failed" in quiet.data, false);
  assert.equal(quiet.data.stuck.waiting.n, 0);
});

test("the Campaigns lens' ledger says the number apart from the rest: none with no active WhatsApp number, unread when the channels cannot be read -- said once in the log -- and when it was checked is the newest of the dates its config keeps", async () => {
  const numberAt = async (channels) =>
    (await kernel.load(ledgerIn(worldCtx(ledgerWorld({}, channels))), campaignLedgerReport, LENS)).data.stuck.number;
  assert.deepEqual(await numberAt([]), { state: "none" });
  assert.deepEqual(await numberAt(numberOf(RED_CONFIG, { status: "disabled" })), { state: "none" }, "a stopped number");
  assert.deepEqual(await numberAt(numberOf(RED_CONFIG, { kind: "sms" })), { state: "none" }, "another wire");

  const down = worldCtx(ledgerWorld(), { "tenant_channels.select": { message: "channels down" } });
  const { result: r, lines } = await logged("campaign_number_failed", () =>
    kernel.load(ledgerIn(down), campaignLedgerReport, LENS),
  );
  assert.deepEqual(r.data.stuck.number, { state: "unread" });
  assert.deepEqual(
    r.data.stuck.waiting,
    STUCK_NOW.waiting,
    "each half fails alone: the rest of what is stuck is answered",
  );
  assert.deepEqual(r.data.series, ledgerAnswer({ p_days: 30 }));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].tenant_id, A);
  assert.match(lines[0].error, /channels down/);

  // When it was checked: the newest of the three dates that parse; a value that is no date is nothing.
  const green = { quality_rating: "GREEN" };
  for (const [config, checked] of [
    [green, null],
    [{ ...green, quality_at: "2026-09-03T08:00:00.000Z" }, "2026-09-03T08:00:00.000Z"],
    [RED_CONFIG, "2026-09-04T12:30:00.000Z"],
    [{ ...RED_CONFIG, quality_read_at: "2026-09-04T15:00:00.000Z" }, "2026-09-04T15:00:00.000Z"],
    [{ ...RED_CONFIG, standing_read_at: "yesterday", quality_read_at: 5 }, "2026-09-03T08:00:00.000Z"],
    [{ ...green, quality_read_at: "never", standing_read_at: null, quality_at: 0 }, null],
  ]) {
    const number = await numberAt(numberOf(config));
    assert.equal(number.checked_at, checked, JSON.stringify(config));
    assert.equal(number.tone, numberHealthOfConfig(config).tone);
  }
});

test("the Campaigns lens' ledger asks the database what it was asked: campaign_ledger over the window, with its last day named only where it is not today, and campaign_stuck for the workspace alone, as of now", async () => {
  const ctx = worldCtx(ledgerWorld());
  const ended = await kernel.load(ledgerIn(ctx), campaignLedgerReport, { days: 20, end: "2026-08-31" });
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc),
    [
      { rpc: "campaign_ledger", args: { p_tenant_id: A, p_days: 20, p_end: "2026-08-31" } },
      { rpc: "campaign_stuck", args: { p_tenant_id: A } },
    ],
    "the database counts the 20 days to the 31st, and what is stuck is asked of no window",
  );
  assert.deepEqual([ended.data.end, ended.data.days], ["2026-08-31", 20]);
  const live = await kernel.load(ledgerIn(worldCtx(ledgerWorld())), campaignLedgerReport, LENS);
  assert.deepEqual(ended.data.stuck, live.data.stuck, "what is stuck is the same as of now, whichever days are asked");

  const today = worldCtx(ledgerWorld());
  await kernel.load(ledgerIn(today), campaignLedgerReport, LENS);
  assert.deepEqual(
    today.supabase.seen.filter((q) => q.rpc),
    [
      { rpc: "campaign_ledger", args: { p_tenant_id: A, p_days: 30 } },
      { rpc: "campaign_stuck", args: { p_tenant_id: A } },
    ],
    "a period names no last day",
  );
});

test("the Campaigns lens' ledger reads each of its things once in a turn: the series, what is stuck and the channels; a turn that keeps (Ask) reads them again, for what is stuck is judged at its own clock", async () => {
  const ctx = worldCtx(ledgerWorld());
  const rc = ledgerIn(ctx);
  await kernel.load(rc, campaignLedgerReport, LENS);
  await kernel.load(rc, campaignLedgerReport, LENS);
  for (const q of ["rpc:campaign_ledger", "rpc:campaign_stuck", "tenant_channels.select"])
    assert.equal(asked(ctx).filter((x) => x === q).length, 1, `${q}: once`);

  assert.equal(campaignLedgerReport.ttlMs, undefined, "a route reads it fresh, and a turn keeps its own");
  const keeps = () =>
    kernel.readerContext(worldCtx(ledgerWorld()), { tenantId: A, role: "viewer" }, LEDGER_CLOCK, { keep: true });
  const [first, next] = [keeps(), keeps()];
  for (const turn of [first, next]) await kernel.load(turn, campaignLedgerReport, LENS);
  assert.deepEqual(
    [first, next].map((turn) => turn.ctx.supabase.seen.filter((q) => q.rpc === "campaign_stuck").length),
    [1, 1],
    "the next turn read it too",
  );
});

test("the Campaigns lens' ledger is the workspace's, not the member's: the same answer for a viewer, an owner and the teammate whose thread is among the replies", async () => {
  const w = ledgerWorld();
  const viewer = await kernel.load(ledgerIn(worldCtx(w)), campaignLedgerReport, LENS);
  const owner = await kernel.load(
    kernel.readerContext({ ...worldCtx(w), userId: "u2" }, { tenantId: A, role: "owner" }, LEDGER_CLOCK),
    campaignLedgerReport,
    LENS,
  );
  const teammate = await kernel.load(
    kernel.readerContext({ ...worldCtx(w), userId: "user-teammate" }, { tenantId: A, role: "operator" }, LEDGER_CLOCK),
    campaignLedgerReport,
    LENS,
  );
  assert.equal(JSON.stringify(owner.data), JSON.stringify(viewer.data));
  assert.equal(JSON.stringify(teammate.data), JSON.stringify(viewer.data));
  assert.equal(
    viewer.data.stuck.replies.n,
    2,
    "the teammate's own thread is no one's but the teammate's; two wait on a person",
  );
});

test("the openings, for Ask and for the palette: GET ask/openings answers its reader's payload over ask-routes' fixture, with no calendar connected, and over a calendar that cannot be read; over calendar-counts' feed the reader answers what findOpenings answers on the same clock -- the morning taken, the afternoon open; no row a citation names", async () => {
  const bare = { memberships: reportMembers(), tenants: [], tenant_config: [] };
  const page = await openingsRoute.GET.run(req(`?day=saturday&workspace=${A}`), dayCtx(bare));
  const r = await kernel.load(turnIn(dayCtx(bare)), openingsReader, { day: "saturday", service: null });
  assert.deepEqual(r.data, page, "the route's payload");
  assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
  assert.equal(r.data.openings.state, "no_calendar");
  assert.deepEqual(r.rows, []);

  await logged("ask_feed_fetch_failed", () =>
    withFeed({ body: "nope", status: 404 }, async () => {
      const t = calTables("https://cal.example/open.ics");
      const down = await openingsRoute.GET.run(req(`?workspace=${A}`), calCtx(t));
      const read = await kernel.load(calIn(calCtx(t)), openingsReader, { day: null, service: null });
      assert.deepEqual(read.data, down, "the route's payload");
      assert.deepEqual(
        [down.openings.state, down.openings.text],
        ["unavailable", "The calendar could not be read right now."],
      );
    }),
  );

  await withFeed({ body: WEDNESDAY_TAKEN }, async () => {
    const t = calTables("https://cal.example/open.ics");
    // findOpenings handed the fixture's own zone and settings, as the reader hands it the turn's.
    const want = await getOpenings(A, { day: "2026-09-09", service: "Balayage" }, CAL_NOW, {
      timezone: t.tenants[0].timezone,
      config: t.tenant_config[0].config,
      // The record holds nothing for this workspace: the feed's taken time alone.
      taken: async () => [],
    });
    const read = await kernel.load(calIn(calCtx(t)), openingsReader, { day: "2026-09-09", service: "Balayage" });
    assert.deepEqual(read.data, { openings: want });
    assert.deepEqual(
      want.days.map((d) => d.windows),
      [["12:00 PM–6:00 PM"]],
      "the morning is taken; the afternoon is open",
    );
    assert.match(want.text, /^For Balayage \(about 90 minutes\): /);
  });

  // A booking that arrived by email (00345) is the reader's to read, under the caller's RLS, and is left out beside
  // the feed's, as the receptionist leaves it out: one to two that Wednesday afternoon, New York. A cancelled one is
  // not taken time.
  await withFeed({ body: WEDNESDAY_TAKEN }, async () => {
    const emailed = (id, from, to, status) => ({
      id,
      tenant_id: A,
      source: "booking_email",
      tool: "booksy",
      external_id: `booksy:${id}`,
      status,
      starts_at: from,
      ends_at: to,
      all_day: false,
      timezone: "America/New_York",
    });
    const t = {
      ...calTables("https://cal.example/open.ics"),
      appointments: [
        emailed("appt-1", "2026-09-09T17:00:00.000Z", "2026-09-09T18:00:00.000Z", "booked"),
        emailed("appt-2", "2026-09-09T19:00:00.000Z", "2026-09-09T20:00:00.000Z", "cancelled"),
      ],
    };
    const read = await kernel.load(calIn(calCtx(t)), openingsReader, { day: "2026-09-09", service: null });
    assert.deepEqual(
      read.data.openings.days.map((d) => d.windows),
      [["12:00 PM–1:00 PM", "2:00 PM–6:00 PM"]],
      "the emailed hour is left out; the cancelled one is open",
    );
  });
});

test("GET ask/openings through its reader asks what it asked at origin/main, in the same order -- the workspace's door, the zone, then the settings, now through the config reader's columns -- and a turn that holds the zone and the settings reads neither again", async () => {
  const bare = { memberships: reportMembers(), tenants: [], tenant_config: [] };
  const ctx = dayCtx(bare);
  await openingsRoute.GET.run(req(`?workspace=${A}`), ctx);
  assert.deepEqual(
    ctx.supabase.seen.map((q) => (q.rpc ? [`rpc:${q.rpc}`, null] : [`${q.table}.${q.op}`, q.columns])),
    [
      ["memberships.select", "tenant_id, role, tenants (slug, name, timezone)"],
      ["tenants.select", "name, timezone"],
      // At origin/main (c39ce689), the one column: config.
      ["tenant_config.select", "tenant_id, config, version, updated_at, updated_by"],
      // No settings row in this world, so the door after the table (00366, workspace/config-row.ts).
      ["rpc:tenant_config_read", null],
    ],
  );
  const turn = turnIn(dayCtx(bare));
  await Promise.all([kernel.load(turn, facts, undefined), kernel.load(turn, config, undefined)]);
  const before = turn.ctx.supabase.seen.length;
  const r = await kernel.load(turn, openingsReader, { day: null, service: null });
  assert.equal(r.data.openings.state, "no_calendar");
  assert.equal(turn.ctx.supabase.seen.length, before, "nothing read: the zone and the settings were the turn's");
});

/* ---------------------------------------------------- the cross-turn cache is opt-in (PR 1.5) */

test("the cross-turn cache is opt-in: a context that does not keep reads a ttl reader again in the next context, and what a turn kept is never served to it; a route keeps nothing -- GET calendar and GET ask/openings read the zone on every request, so a zone changed between two requests is the second request's", async () => {
  const r = counting("opt-in", { ttlMs: 60_000 });
  const plain = () => kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" });
  const keeps = () => kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }, undefined, { keep: true });
  assert.equal(plain().keep, false, "a context keeps nothing unless it says so");
  await kernel.load(plain(), r, undefined);
  await kernel.load(plain(), r, undefined);
  assert.equal(r.reads, 2, "no keep: the next context read again");
  await kernel.load(keeps(), r, undefined);
  await kernel.load(keeps(), r, undefined);
  assert.equal(r.reads, 3, "a turn that keeps: the next turn took the kept value");
  await kernel.load(plain(), r, undefined);
  assert.equal(r.reads, 4, "what a turn kept is not served to a context that does not keep");

  await withFeed({ body: ONE_ICS }, async () => {
    const t = calTables("https://cal.example/zone.ics", "viewer");
    for (const timezone of ["America/New_York", "Europe/Madrid", "America/New_York"]) {
      t.tenants[0].timezone = timezone;
      const board = calCtx(t);
      const week = await calendarRoute.GET.run(req(`?workspace=${A}&from=2026-09-07&days=7`), board);
      const palette = calCtx(t);
      const open = await openingsRoute.GET.run(req(`?workspace=${A}`), palette);
      assert.deepEqual(
        [week.calendar.timezone, open.openings.tz],
        [timezone, timezone],
        "each request answers its own read of the zone",
      );
      assert.deepEqual(
        [selects(board, "tenants").length, selects(palette, "tenants").length],
        [1, 1],
        "the zone read for this request, by each route",
      );
    }
  });
});

test("the business's shape (readers/facts.ts businessShape): whether a deal was ever recorded, its word, and whether bookings arrive by a tool's emails", async () => {
  const t = calTables(null);
  t.tenants[0].appointment_word = "session";
  t.deals = [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddd09", tenant_id: A, contact_id: P1, stage: "proposed" }];
  t.tenant_config[0].config.bookings = { tool: "booksy" };
  const r = await kernel.load(turnIn(ctxFor(t)), businessShape, undefined);
  assert.deepEqual(r.data, { hasDeals: true, word: "session", bookingsByEmail: true });
  assert.deepEqual(r.rows, [], "no row of its own");
  const bare = await kernel.load(turnIn(ctxFor(calTables(null))), businessShape, undefined);
  assert.deepEqual(bare.data, { hasDeals: false, word: "appointment", bookingsByEmail: false });
  const quoted = calTables(null);
  quoted.tenants[0].appointment_word = "meeting";
  assert.equal(
    (await kernel.load(turnIn(ctxFor(quoted)), businessShape, undefined)).data.word,
    "meeting",
    "the word picked",
  );
  const unreadable = calTables(null);
  unreadable.tenant_config = [];
  const none = await kernel.load(turnIn(ctxFor(unreadable)), businessShape, undefined);
  assert.equal(none.data.bookingsByEmail, false, "no settings row: no booking tool, and the shape still answers");
  const down = await kernel.load(
    turnIn({ ...ctxFor(t), supabase: fakeDb(t, { "tenant_config.select": { message: "config down" } }) }),
    businessShape,
    undefined,
  );
  assert.deepEqual(
    down.data,
    { hasDeals: true, word: "session", bookingsByEmail: false },
    "settings that cannot be read cost the booking tool's word, never the shape",
  );
  // A turn that holds the word, a deal on file and the settings reads none of them again.
  const turn = turnIn(ctxFor(t));
  await Promise.all([appointmentWord, hasDeals, config].map((x) => kernel.load(turn, x, undefined)));
  const held = turn.ctx.supabase.seen.length;
  await kernel.load(turn, businessShape, undefined);
  assert.equal(turn.ctx.supabase.seen.length, held, "the turn's own reads");
});

test("the people list, for Ask and for the page: GET contacts answers its reader's payload, key for key and byte for byte -- over people-routes' fixture in both workspaces, and a query, an offset and three digits over its paging fixture -- the same reading of who exists as the export, and each person a row, named as People names them", async () => {
  for (const [w, tenant, query, args] of [
    [listWorld(), A, "", { q: null, offset: 0 }],
    [listWorld(), B, "", { q: null, offset: 0 }],
    [pagingWorld(), A, "&q=%20bo%20", { q: "bo", offset: 0 }],
    [pagingWorld(), A, "&offset=1000", { q: null, offset: 1000 }],
    [pagingWorld(), A, "&q=0002", { q: "0002", offset: 0 }],
  ]) {
    const page = await contactsRoute.GET.run(req(`?workspace=${tenant}${query}`), worldCtx(w));
    const r = await kernel.load(turnIn(worldCtx(w), tenant), peopleReader, args);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(Object.keys(r.data), PEOPLE_KEYS, "the keys in the order the route answered them");
    assert.deepEqual(
      r.rows,
      r.data.people.map((p) => ({ kind: "person", id: p.id, route: `clients/${p.id}`, label: personName(p) })),
    );
  }
  // What people-routes asserts of the route, of the reader.
  const harbor = await kernel.load(turnIn(worldCtx(listWorld())), peopleReader, { q: null, offset: 0 });
  assert.deepEqual(
    harbor.data.people.map((p) => [p.id, p.effective_reply_mode, p.visits]),
    [
      [P1, "auto", null],
      [P2, "never", null],
    ],
  );
  assert.equal(harbor.data.calendar.state, "none");
  assert.deepEqual(harbor.data.page, { q: null, offset: 0, limit: 1000, total: 0, has_more: false, next: null });
  assert.deepEqual(
    harbor.rows.map((x) => x.label),
    ["Ada", "Ada"],
  );
  const found = await kernel.load(turnIn(worldCtx(pagingWorld())), peopleReader, { q: "bo", offset: 0 });
  assert.deepEqual(
    [found.data.people.map((p) => p.id), found.data.page],
    [[P2], { q: "bo", offset: 0, limit: 1000, total: 1, has_more: false, next: null }],
    "the door matched, and the count counted the same match",
  );
  // The same reading of who exists as the CSV export (everyone(), server/people/people.ts): the door's rows under the member's
  // RLS, each with the reply mode in force, a page at a time.
  const all = await listEveryone(worldCtx(listWorld()), A);
  assert.deepEqual(
    harbor.data.people.map((p) => [p.id, p.effective_reply_mode]),
    all.map((p) => [p.id, p.effective_reply_mode]),
  );
});

test("GET contacts through its reader asks what it asked at origin/main -- the page, its count and everything read of the workspace at once, then the follow-up's facts and who each step is for -- the settings now through the config reader's columns, and the word and a deal on file through theirs; a turn that holds the zone, the settings, the word and a deal on file reads none of them again", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const asConfigReader = (list) =>
      list.map(([k, cols]) => [k, k === "tenant_config.select" ? CONFIG_READER_COLUMNS : cols]);
    const want = asConfigReader(PEOPLE_ASKED_NOW);
    assert.deepEqual(bagOf(want), bagOf(asConfigReader(PEOPLE_ASKED_AT_MAIN)), "no read added and none lost");
    // One world for every request below: its times are read from the clock once.
    const w = peopleWorld();
    const routed = worldCtx(w);
    const page = await contactsRoute.GET.run(req(`?workspace=${A}`), routed);
    assert.deepEqual(recordApart(askedWith(routed)), recordApart(want), "the workspace's door, then the reads");
    const ctx = worldCtx(w);
    const r = await kernel.load(turnIn(ctx), peopleReader, { q: null, offset: 0 });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.deepEqual(recordApart(askedWith(ctx)), recordApart(want.slice(1)));
    // What each read was for, in the payload: Ana's visit from the feed, who each step is for, the pace, the follow-up.
    const [ana, luis] = r.data.people;
    assert.deepEqual(
      [r.data.calendar.state, ana.visits.last.title, luis.visits.last],
      ["ok", "Ana Ruiz · Balayage", null],
    );
    assert.deepEqual(
      [ana.step_for_name, ana.step_for_me, luis.step_for_name, luis.step_for_me],
      ["Sam", false, "Ada", true],
    );
    assert.deepEqual(
      [r.data.has_deals, r.data.appointment_word, r.data.deal_pace],
      [true, "meeting", { median_days: 10, yeses: 1 }],
    );
    assert.deepEqual(Object.keys(r.data.follow_up.had), [P2], "Luis had his proposal's follow-up");
    // A search reads neither the pace nor the follow-up's facts: People keeps its first page's.
    const searched = worldCtx(w);
    const s = await kernel.load(turnIn(searched), peopleReader, { q: "luis", offset: 0 });
    assert.deepEqual([s.data.deal_pace, s.data.follow_up], [null, null]);
    assert.deepEqual(
      recordApart(askedWith(searched)),
      recordApart(
        want
          .slice(1)
          .filter(
            ([k, cols]) =>
              !/^(sequence_steps|tenant_channels|lines|templates|sequence_batches|sequence_sends)\./.test(k) &&
              !(k === "deals.select" && cols !== "id") &&
              k !== "sequences.select" &&
              !(k === "tenants.select" && /^(status|timezone)$/.test(cols)),
          ),
      ),
      "the same, less the pace and the follow-up",
    );
    // A turn that already holds the zone, the settings, the word and a deal on file is asked for none of them again.
    const turn = turnIn(worldCtx(w));
    await Promise.all([facts, config, appointmentWord, hasDeals].map((x) => kernel.load(turn, x, undefined)));
    const held = turn.ctx.supabase.seen.length;
    await kernel.load(turn, peopleReader, { q: null, offset: 0 });
    const heldWant = want
      .slice(1)
      .filter(
        ([k, cols]) =>
          k !== "tenant_config.select" &&
          !(k === "tenants.select" && /appointment_word|name/.test(cols)) &&
          !(k === "deals.select" && cols === "id"),
      );
    // A deal on file already the turn's: the follow-up's first reads come before what was seen, and the team after them.
    const after = { "rpc:contact_seen": "id, contact_id, proposed_at", "rpc:team_roster": "id, mode" };
    for (const [key, cols] of Object.entries(after)) {
      const q = heldWant.find((x) => x[0] === key);
      heldWant.splice(heldWant.indexOf(q), 1);
      heldWant.splice(heldWant.findIndex((x) => x[1] === cols) + 1, 0, q);
    }
    // The follow-up's reads wait on the business's zone (its last day is judged by it: S1-3), which the turn holds but hands
    // over a moment later: they reach the database after who each step is for, in the order the page asks them.
    assert.deepEqual(
      recordApart(askedWith(turn.ctx).slice(held)),
      recordApart(heldWant),
      "the page, the steps, the pace and the follow-up's own reads: the zone, the settings, the word and a deal on file were the turn's",
    );
  });
});

test("the people list's calendar is never fatal: settings that cannot be read cost every row its visits and the list its calendar, said once in the log, and the rest of the page stands -- the reader's payload is the route's", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const down = { "tenant_config.select": { message: "config down" } };
    const w = peopleWorld();
    const { result: page, lines } = await logged("people_visits_failed", () =>
      contactsRoute.GET.run(req(`?workspace=${A}`), worldCtx(w, down)),
    );
    assert.deepEqual(
      [page.people.map((p) => p.visits), page.calendar, page.booking_link],
      [[null, null], { state: "none", source: "your calendar", timezone: "UTC" }, null],
    );
    assert.deepEqual([page.has_deals, Object.keys(page.follow_up.had), page.page.total], [true, [P2], 2]);
    assert.deepEqual(
      lines,
      // The settings come through the config reader now (getTenantConfig), which names itself in its failure.
      [{ tenant_id: A, error: "getTenantConfig: config down" }],
    );
    const { result: r } = await logged("people_visits_failed", () =>
      kernel.load(turnIn(worldCtx(w, down)), peopleReader, { q: null, offset: 0 }),
    );
    assert.deepEqual(r.data, page);
  });
});

test("the lists, for Ask and for the page: GET segments answers its reader's payload over people-routes' fixture in both workspaces -- every list of the one workspace read, with every member -- and each list a row a citation names, opened on People at that list", async () => {
  for (const [tenant, want] of [
    [A, [{ id: SEG1, name: "Regulars", ids: [P1], rule: null, archived_at: null }]],
    [B, [{ id: SEG2, name: "VIP", ids: [P2], rule: null, archived_at: null }]],
  ]) {
    const page = await segmentsRoute.GET.run(req(`?workspace=${tenant}`), worldCtx(segmentsWorld()));
    const ctx = worldCtx(segmentsWorld());
    const r = await kernel.load(turnIn(ctx, tenant), listsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.deepEqual(r.data, { lists: want });
    assert.deepEqual(
      r.rows,
      want.map((l) => ({ kind: "list", id: l.id, route: `clients/list:${l.id}`, label: l.name })),
    );
    assert.deepEqual(asked(ctx), ["segments.select", "segment_members.select"], "the lists and their members at once");
  }
});
