/**
 * Reports › Campaigns — the sends' view model, EXECUTED, and the door behind it.
 *
 * What the offers earned: sent, delivered and replied as counts, yeses and stops from the consent ledger, the period before
 * beside the period, the current period by source and by channel, the honest empty, and the table twin. The Campaigns home
 * reads its totals and channels; the Campaigns lens folds it again into its own figures and words (campaigns/campaign-lens.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REPORT_MIN_N, isThinShare, shareSaid, toCampaignReportVM } from "@chanlytics/contracts";
import { importSrc, readRaw } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

// The route runs below over a database in memory; a module that ever builds a service client reads these, and nothing
// dials it.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

function day(d, over = {}) {
  return { day: d, sent: 0, delivered: 0, read: 0, replied: 0, opt_ins: 0, opt_outs: 0, ...over };
}

/** Seven previous days (one small send) then seven current days (a win-back run and a broadcast). */
function dto(over = {}) {
  const prev = ["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"].map(
    (d, i) => day(d, i === 2 ? { sent: 4, delivered: 4, read: 2, replied: 2, opt_ins: 1 } : {}),
  );
  const cur = [
    day("2026-08-29", { sent: 10, delivered: 9, read: 6, replied: 2, opt_ins: 2 }),
    day("2026-08-30"),
    day("2026-08-31", { opt_ins: 1, opt_outs: 1 }),
    day("2026-09-01", { sent: 6, delivered: 3, read: 1, replied: 1 }),
    day("2026-09-02"),
    day("2026-09-03", { sent: 4, delivered: 4, read: 4, replied: 1, opt_outs: 1 }),
    day("2026-09-04"),
  ];
  return {
    timezone: "America/New_York",
    days: 7,
    span_days: 14,
    today: "2026-09-04",
    series: [...prev, ...cur],
    sources: [
      {
        id: "p1",
        kind: "playbook",
        name: "Win-back",
        template_name: "winback_offer",
        runs: 2,
        sent: 14,
        delivered: 12,
        read: 7,
        replied: 3,
        last_at: "2026-09-03T14:05:00Z",
      },
      {
        id: "b1",
        kind: "broadcast",
        name: "A quick note · Sep 1",
        template_name: "quick_note",
        runs: 1,
        sent: 6,
        delivered: 4,
        read: 4,
        replied: 1,
        last_at: "2026-09-01T15:00:00Z",
      },
    ],
    ...over,
  };
}

test("totals over the period, and the period before's beside them", () => {
  const vm = toCampaignReportVM(dto());
  assert.equal(vm.days, 7);
  assert.equal(vm.points.length, 7);
  // From a database before the channels were counted (no by_channel), a read is a share of every send (0030).
  assert.deepEqual(vm.totals, {
    sent: 20,
    delivered: 16,
    read: 11,
    readOf: 20,
    replied: 4,
    sends: 3,
    optIns: 3,
    optOuts: 2,
  });
  assert.deepEqual(
    vm.points.map((p) => p.sent),
    [10, 0, 0, 6, 0, 4, 0],
  );
  // The seven days before: the one small send and its yes, which the Campaigns lens sets its figures beside.
  assert.deepEqual(vm.before, { sent: 4, delivered: 4, replied: 2, optIns: 1, optOuts: 0 });
  assert.equal(vm.empty, false);
  // What the Campaigns home and the lens read, and nothing drawn from it that no page draws (the five tiles, the prior line, the
  // largest day and a source's share of the largest went on 11 Oct 2026: computed and never drawn).
  assert.deepEqual(Object.keys(vm).sort(), [
    "before",
    "channelTable",
    "channels",
    "days",
    "empty",
    "lines",
    "points",
    "sources",
    "table",
    "totals",
  ]);
  assert.deepEqual(Object.keys(vm.lines).sort(), ["channels", "sent"]);
});

test("the current period by source: a playbook's runs together, a broadcast alone, titles for people", () => {
  const vm = toCampaignReportVM(dto());
  assert.deepEqual(
    vm.sources.map((s) => [s.name, s.kindLabel, s.runs, s.sent, s.deliveredPct, s.repliedPct, s.template]),
    [
      // The playbook sends the retired win-back (2 Oct 2026), called apart from the set's own by its title.
      ["Win-back", "Campaign", 2, 14, 86, 21, "Win-back (earlier)"],
      ["A quick note · Sep 1", "Broadcast", 1, 6, 67, 17, "A quick note"],
    ],
  );
  assert.deepEqual(
    vm.sources.map((s) => [s.deliveredWords, s.repliedWords]),
    [
      ["86%", "21% (3)"],
      ["67%", "17% (1)"],
    ],
    "what the table says: each of five sends or more, the answered with their count",
  );
  assert.match(vm.sources[0].lastLabel, /Sep \d/);
  // A read is a share of WhatsApp's own sends (0030): a source's sends are every channel's, so it says no read share.
  assert.ok(!("readPct" in vm.sources[0]));
});

test("the honest empty, and the table twin", () => {
  const nothing = toCampaignReportVM(dto({ series: dto().series.map((d) => day(d.day)), sources: [] }));
  assert.equal(nothing.empty, true);
  assert.deepEqual(
    [nothing.totals.sent, nothing.totals.delivered, nothing.totals.sends, nothing.sources.length],
    [0, 0, 0, 0],
    "nothing sent is counted as 0, shown as 0",
  );
  const onlyYes = toCampaignReportVM(
    dto({ series: dto().series.map((d) => day(d.day, d.day === "2026-09-02" ? { opt_ins: 1 } : {})), sources: [] }),
  );
  assert.equal(onlyYes.empty, false, "a yes with nothing sent is still news");
  const vm = toCampaignReportVM(dto());
  // The day twin's count of messages is "Answered", as the funnel's row and the other twins say it; the people who wrote back are the strip's.
  assert.deepEqual(vm.table.columns, ["Day", "Sent", "Delivered", "Answered", "Said yes", "Asked to stop"]);
  assert.equal(vm.table.rows.length, 7);
  assert.deepEqual(vm.table.rows[0].slice(1), [10, 9, 2, 2, 0]);
});

test("the door: two periods by the business's clock, replied by the Broadcasts rule, yeses and stops from the consent ledger, the invoker's RLS", async () => {
  const m = readRaw("supabase/migrations/00051_campaign_series.sql");
  assert.ok(
    m.includes("create or replace function public.campaign_series(p_tenant_id uuid, p_days integer default 30)"),
  );
  assert.ok(m.includes("v_span  := v_days * 2;") && m.includes("v_today := (now() at time zone v_tz)::date;"));
  assert.ok(
    m.includes("and i.direction = 'inbound'") && m.includes("and i.created_at > s.sent_at)  as replied"),
    "replied means the customer wrote after the message went out",
  );
  assert.ok(
    m.includes("and e.kind = 'contact.consent_changed'") &&
      m.includes("c.consent = 'opted_in'") &&
      m.includes("c.consent = 'opted_out'"),
  );
  assert.ok(
    m.includes("group by coalesce(s.playbook_id, s.broadcast_id), (s.playbook_id is not null)"),
    "a playbook's runs roll up together",
  );
  assert.ok(!/security definer/i.test(m), "the caller's RLS applies");
  assert.ok(m.includes("grant execute on function public.campaign_series(uuid, integer) to authenticated;"));
  // The route, run: counted with the aggregate reads, the function asked for the workspace and the period, and any
  // other period refused in the receptionist's report's own words.
  const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
  setRateStore(memoryStore());
  const route = await importSrc("apps/dashboard/app/api/v1/reports/campaigns/route.ts");
  assert.equal(route.GET.policy.rate, "aggregate");
  const W = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const asked = [];
  const ctx = () => ({
    supabase: fakeDb(
      {
        memberships: [
          { user_id: "u1", tenant_id: W, role: "viewer", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
        ],
      },
      {},
      {
        campaign_series: (a) => {
          asked.push(a);
          return { days: a.p_days };
        },
      },
    ),
    userId: "u1",
    email: "ada@example.com",
    params: {},
  });
  const week = await route.GET.run(
    new Request(`http://localhost/api/v1/reports/campaigns?period=7d&workspace=${W}`),
    ctx(),
  );
  assert.deepEqual([week, asked], [{ report: { days: 7 } }, [{ p_tenant_id: W, p_days: 7 }]]);
  await assert.rejects(
    route.GET.run(new Request(`http://localhost/api/v1/reports/campaigns?period=14d&workspace=${W}`), ctx()),
    (e) => e.status === 400 && e.message === 'period: Invalid option: expected one of "7d"|"30d"|"90d"|"month"',
    "the same periods as the receptionist's report",
  );
  assert.deepEqual(
    await route.GET.run(new Request(`http://localhost/api/v1/reports/campaigns?period=90d&workspace=${W}`), ctx()),
    { report: { days: 90 } },
    "one period parameter: `period` names the window",
  );
  // What the surface does with this read (its own request, null where it fails) and what the Campaigns lens draws from it are
  // executed, not read as text: reports/lenses/reports-lens-page.test.mjs and shell/empty-failed.test.mjs.
});

test("the one sentence under the day card: how many runs sent it", () => {
  const vm = toCampaignReportVM(dto());
  assert.equal(vm.lines.sent, "From 3 broadcast and campaign runs.", "the win-back's two runs and the broadcast");
  const one = toCampaignReportVM(
    dto({
      series: dto().series.map((d) => day(d.day, d.day === "2026-09-01" ? { sent: 6, opt_ins: 1, opt_outs: 1 } : {})),
      sources: [dto().sources[1]],
    }),
  );
  assert.equal(one.lines.sent, "From one broadcast or campaign run.");
  const nothing = toCampaignReportVM(dto({ series: dto().series.map((d) => day(d.day)), sources: [] }));
  assert.equal(nothing.lines.sent, null, "no run sent anything");
  // The yes and the stop are the lens's figures (campaign-lens.test.mjs says them against the period before, in counts); this fold
  // keeps the days they fell on, and the period before's totals for the lens to set them beside.
  assert.deepEqual(
    vm.points.map((p) => [p.optIns, p.optOuts]),
    [
      [2, 0],
      [0, 0],
      [1, 1],
      [0, 0],
      [0, 0],
      [0, 1],
      [0, 0],
    ],
  );
  // A workspace with nothing before this period has no period before to set it beside: its totals are all zero.
  const young = toCampaignReportVM(dto({ series: dto().series.slice(-7) }));
  assert.deepEqual(young.before, { sent: 0, delivered: 0, replied: 0, optIns: 0, optOuts: 0 });
});

test("by channel (0030): each channel that sent, the most first, over its own sends; a read is WhatsApp's alone and the period's read a share of WhatsApp's sends; one channel, no split", () => {
  // The period's twenty, as campaign_series splits them: its sums are the days' (sent 20, delivered 16, read 11, replied 4).
  const withChannels = (by_channel) => toCampaignReportVM({ ...dto(), by_channel });
  const vm = withChannels([
    { channel: "whatsapp", sent: 14, delivered: 12, read: 11, replied: 3 },
    { channel: "sms", sent: 4, delivered: 3, read: 0, replied: 1 },
    { channel: "email", sent: 2, delivered: 1, read: 0, replied: 0 },
  ]);
  assert.deepEqual(
    vm.channels.map((c) => [c.channel, c.label, c.sent, c.deliveredPct, c.read, c.readPct, c.repliedPct, c.display]),
    [
      ["whatsapp", "WhatsApp", 14, 86, 11, 79, 21, "14 · 86% delivered"],
      ["sms", "Text", 4, 75, null, null, 25, "4 · 3 of 4 delivered"],
      ["email", "Email", 2, 50, null, null, 0, "2 · 1 of 2 delivered"],
    ],
    "a text's and an email's read is no figure at all, never a zero",
  );
  assert.deepEqual([vm.totals.read, vm.totals.readOf], [11, 14], "the period's read: of WhatsApp's own fourteen");
  assert.deepEqual(vm.channelTable, {
    columns: ["Channel", "Sent", "Delivered", "Read", "Answered"],
    rows: [
      ["WhatsApp", 14, 12, 11, 3],
      ["Text", 4, 3, null, 1],
      ["Email", 2, 1, null, 0],
    ],
  });
  // No figure is null, never a dash of the report's own: the kit's table draws its dash, and its CSV an empty cell.
  assert.equal(vm.lines.channels, "Read receipts are WhatsApp's alone: 11 of its 14 were read.");
  // One channel: nothing to split, so no line, and the lens draws no card.
  const one = withChannels([{ channel: "whatsapp", sent: 20, delivered: 16, read: 11, replied: 4 }]);
  assert.deepEqual([one.channels.length, one.lines.channels, one.totals.readOf], [1, null, 20]);
  // Nothing by WhatsApp: no read to share.
  const none = withChannels([
    { channel: "sms", sent: 12, delivered: 10, read: 0, replied: 3 },
    { channel: "email", sent: 8, delivered: 6, read: 0, replied: 1 },
  ]);
  assert.deepEqual(
    [none.totals.read, none.totals.readOf, none.lines.channels],
    [0, 0, "A text or an email keeps no read receipt."],
  );
  // A channel the report has no word for, or one that sent nothing, is no row.
  assert.deepEqual(
    withChannels([
      { channel: "fax", sent: 3, delivered: 3, read: 0, replied: 0 },
      { channel: "sms", sent: 0, delivered: 0, read: 0, replied: 0 },
    ]).channels,
    [],
  );
});

test("a share of fewer than five is the count, never a percentage (D9): the one predicate and the one spelling, at 0, 4, 5 and 6", () => {
  assert.equal(REPORT_MIN_N, 5);
  // The minimum is named by whoever judges, never defaulted: a ratio with a smaller one of its own cannot forget it.
  assert.equal(isThinShare.length, 2, "both parameters are required");
  // Thin is some, but too few: of none there is no ratio to grey, and from five it is read.
  assert.deepEqual(
    [0, 1, 4, 5, 6].map((n) => isThinShare(n, REPORT_MIN_N)),
    [false, true, true, false, false],
  );
  // A ratio that keeps a minimum of its own (the reviews' reply time) is judged by it.
  assert.deepEqual(
    [0, 1, 2, 3].map((n) => isThinShare(n, 3)),
    [false, true, true, false],
  );
  // Said, a share is a percentage from five and the count under that; of none it is nothing.
  assert.deepEqual(
    [shareSaid(75, 3, 4), shareSaid(60, 3, 5), shareSaid(50, 3, 6), shareSaid(100, 1, 1), shareSaid(null, 0, 0)],
    ["3 of 4", "60%", "50%", "1 of 1", null],
  );
});

test("a channel's bar and a source's row say a share only of five sends or more, and the count under that; the Campaigns home takes neither", () => {
  const channels = (sent) =>
    toCampaignReportVM({
      ...dto(),
      by_channel: [
        { channel: "whatsapp", sent: 20, delivered: 18, read: 10, replied: 4 },
        { channel: "sms", sent, delivered: sent - 1, read: 0, replied: 1 },
      ],
    }).channels.map((c) => c.display);
  assert.deepEqual(channels(4), ["20 · 90% delivered", "4 · 3 of 4 delivered"], "four sends: the count");
  assert.deepEqual(channels(5), ["20 · 90% delivered", "5 · 80% delivered"], "five sends: the share");
  assert.deepEqual(channels(6), ["20 · 90% delivered", "6 · 83% delivered"]);
  const source = (sent, delivered, replied) => ({
    id: "s",
    kind: "playbook",
    name: "Win-back",
    template_name: null,
    runs: 1,
    sent,
    delivered,
    read: 0,
    replied,
    last_at: null,
  });
  const words = (sent, delivered, replied) => {
    const s = toCampaignReportVM({ ...dto(), sources: [source(sent, delivered, replied)] }).sources[0];
    return [s.deliveredWords, s.repliedWords];
  };
  assert.deepEqual(words(4, 3, 1), ["3 of 4", "1 of 4"], "four sends: counts, and no count in brackets");
  assert.deepEqual(words(5, 4, 1), ["80%", "20% (1)"], "five sends: the shares, the answered with their count");
  assert.deepEqual(words(14, 12, 3), ["86%", "21% (3)"]);
  assert.deepEqual(words(0, 0, 0), ["—", "—"], "a source that sent none: a dash");
  // The shares as numbers stay on the view model for whoever says them in their own words (Ask does, with the same predicate).
  const vm = toCampaignReportVM({ ...dto(), sources: [source(4, 3, 1)] });
  assert.deepEqual([vm.sources[0].deliveredPct, vm.sources[0].repliedPct], [75, 25]);
  // The Campaigns home reads the totals and each channel's sends: nothing of a share.
  assert.deepEqual(Object.keys(vm.totals).sort(), [
    "delivered",
    "optIns",
    "optOuts",
    "read",
    "readOf",
    "replied",
    "sends",
    "sent",
  ]);
});

test("a day's column says its sends to a screen reader and the messages answered to a pointer, as messages", () => {
  const { points } = toCampaignReportVM(dto());
  assert.deepEqual(
    points.slice(0, 4).map((p) => [p.label, p.sentWords, p.answeredWords]),
    [
      ["Aug 29", "Aug 29: 10 sent", "2 answered"],
      ["Aug 30", "Aug 30: 0 sent", null],
      ["Aug 31", "Aug 31: 0 sent", null],
      ["Sep 1", "Sep 1: 6 sent", "1 answered"],
    ],
    "a day nothing was answered on adds nothing under its number",
  );
});
