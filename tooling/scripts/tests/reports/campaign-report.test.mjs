/**
 * Reports › Campaigns — the view model, EXECUTED, and the door behind it.
 *
 * What the offers earned: sent, delivered and replied as counts and as
 * shares of sent, yeses and stops from the consent ledger, deltas that
 * refuse to invent a percentage against nothing, the current period by
 * source with a share of the biggest, the honest empty, and the table twin.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCampaignReportVM } from "@chanlytics/contracts";
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

test("totals, shares of sent, and deltas over the prior period", () => {
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
  const by = Object.fromEntries(vm.tiles.map((t) => [t.id, t]));
  assert.deepEqual(
    vm.tiles.map((t) => t.label),
    ["Messages sent", "Delivered", "Replied", "Said yes", "Asked to stop"],
  );
  assert.equal(by.sent.value, "20");
  assert.equal(by.sent.meta, "over 3 sends");
  assert.equal(by.sent.delta.text, "+400% vs prior 7 days");
  assert.equal(by.delivered.value, "80%", "16 of 20 delivered");
  // A campaign goes by WhatsApp, text and email, and each wire says what it delivered: not WhatsApp's alone.
  assert.equal(by.delivered.meta, "16 of 20 · each channel's own receipts");
  assert.deepEqual(
    by.delivered.delta,
    { text: "-20 pts vs prior 7 days", tone: "neg" },
    "a share moves in points, never a percentage of a percentage",
  );
  assert.equal(by.replied.value, "20%");
  assert.deepEqual(
    vm.tiles.map((t) => t.metric),
    ["messages_sent", "delivered_share", "replied_share", "said_yes", "asked_to_stop"],
    "each names its figure where it is built",
  );
  assert.equal(by.optins.value, "3");
  assert.equal(by.optins.delta.text, "+200% vs prior 7 days");
  assert.equal(by.optouts.value, "2");
  assert.equal(by.optouts.delta, null, "no stops in the prior period: nothing to compare against");
  assert.deepEqual(by.sent.spark, [10, 0, 0, 6, 0, 4, 0]);
  assert.equal(vm.max, 10);
  assert.equal(vm.empty, false);
});

test("the current period by source: a playbook's runs together, a broadcast alone, shares of the biggest, titles for people", () => {
  const vm = toCampaignReportVM(dto());
  assert.deepEqual(
    vm.sources.map((s) => [s.name, s.kindLabel, s.runs, s.sent, s.deliveredPct, s.repliedPct, s.share, s.template]),
    [
      // The playbook sends the retired win-back (2 Oct 2026), called apart from the set's own by its title.
      ["Win-back", "Playbook", 2, 14, 86, 21, 1, "Win-back (earlier)"],
      ["A quick note · Sep 1", "Broadcast", 1, 6, 67, 17, 6 / 14, "A quick note"],
    ],
  );
  assert.match(vm.sources[0].lastLabel, /Sep \d/);
  // A read is a share of WhatsApp's own sends (0030): a source's sends are every channel's, so it says no read share.
  assert.ok(!("readPct" in vm.sources[0]));
});

test("the honest empty, and the table twin", () => {
  const nothing = toCampaignReportVM(dto({ series: dto().series.map((d) => day(d.day)), sources: [] }));
  assert.equal(nothing.empty, true);
  const by = Object.fromEntries(nothing.tiles.map((t) => [t.id, t]));
  assert.equal(by.delivered.value, "—");
  assert.equal(by.sent.meta, "none in this period");
  assert.equal(by.sent.delta, null);
  const onlyYes = toCampaignReportVM(
    dto({ series: dto().series.map((d) => day(d.day, d.day === "2026-09-02" ? { opt_ins: 1 } : {})), sources: [] }),
  );
  assert.equal(onlyYes.empty, false, "a yes with nothing sent is still news");
  const vm = toCampaignReportVM(dto());
  assert.deepEqual(vm.table.columns, ["Day", "Sent", "Delivered", "Replied", "Said yes", "Asked to stop"]);
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
    new Request(`http://localhost/api/v1/reports/campaigns?days=7&workspace=${W}`),
    ctx(),
  );
  assert.deepEqual([week, asked], [{ report: { days: 7 } }, [{ p_tenant_id: W, p_days: 7 }]]);
  await assert.rejects(
    route.GET.run(new Request(`http://localhost/api/v1/reports/campaigns?days=45&workspace=${W}`), ctx()),
    (e) => e.status === 400 && e.message === "period must be 7d, 30d, 90d or month.",
    "the same periods as the receptionist's report",
  );
  assert.deepEqual(
    await route.GET.run(new Request(`http://localhost/api/v1/reports/campaigns?period=90d&workspace=${W}`), ctx()),
    { report: { days: 90 } },
    "one period parameter: `period` names the window",
  );
  await assert.rejects(
    route.GET.run(new Request(`http://localhost/api/v1/reports/campaigns?period=14d&workspace=${W}`), ctx()),
    (e) => e.status === 400,
  );
  // What the surface does with this read (its own request, null where it fails) and what the Campaigns lens draws from it are
  // executed, not read as text: reports/lenses/reports-lens-page.test.mjs and shell/empty-failed.test.mjs.
});

test("the one sentence under each campaign card: who said yes to messages or stop, and how many runs sent it", () => {
  const vm = toCampaignReportVM(dto());
  assert.equal(
    vm.lines.funnel,
    "3 people said yes to messages, 2 people asked to stop.",
    "never 'offers': a visit reminder is no offer (C25)",
  );
  assert.equal(vm.lines.sent, "From 3 broadcast and playbook runs.", "the win-back's two runs and the broadcast");
  const one = toCampaignReportVM(
    dto({
      series: dto().series.map((d) => day(d.day, d.day === "2026-09-01" ? { sent: 6, opt_ins: 1, opt_outs: 1 } : {})),
      sources: [dto().sources[1]],
    }),
  );
  assert.equal(one.lines.funnel, "1 person said yes to messages, 1 person asked to stop.");
  assert.equal(one.lines.sent, "From one broadcast or playbook run.");
  const nothing = toCampaignReportVM(dto({ series: dto().series.map((d) => day(d.day)), sources: [] }));
  assert.equal(nothing.lines.funnel, "Nobody said yes to messages or asked to stop.");
  assert.equal(nothing.lines.sent, null, "no run sent anything");
  // The yes and the stop are drawn as figures, each with the period before in counts beside it (the Overview's strip does the same);
  // the sent, the delivered and the replied are drawn as the funnel and the day chart, which compare nothing.
  assert.deepEqual(
    vm.tiles.map((t) => t.compare),
    [null, null, null, "up from 1", "none the 7 days before"],
    "a count against the period before, in counts: one yes before and three now; no stop before and two now",
  );
  // A workspace with nothing before this period has nothing to compare with: never "none the 7 days before".
  const young = toCampaignReportVM(dto({ series: dto().series.slice(-7) }));
  assert.deepEqual(
    young.tiles.map((t) => t.compare),
    [null, null, null, null, null],
    "no period before: nothing is said of one",
  );
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
      ["sms", "Text", 4, 75, null, null, 25, "4 · 75% delivered"],
      ["email", "Email", 2, 50, null, null, 0, "2 · 50% delivered"],
    ],
    "a text's and an email's read is no figure at all, never a zero",
  );
  assert.deepEqual([vm.totals.read, vm.totals.readOf], [11, 14], "the period's read: of WhatsApp's own fourteen");
  assert.deepEqual(vm.channelTable, {
    columns: ["Channel", "Sent", "Delivered", "Read", "Wrote back"],
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
