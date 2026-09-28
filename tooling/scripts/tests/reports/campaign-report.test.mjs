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
import { importSrc, readCode, readRaw } from "../_source.mjs";
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
  assert.deepEqual(vm.totals, { sent: 20, delivered: 16, replied: 4, sends: 3, optIns: 3, optOuts: 2 });
  const by = Object.fromEntries(vm.tiles.map((t) => [t.id, t]));
  assert.deepEqual(
    vm.tiles.map((t) => t.label),
    ["Messages sent", "Delivered", "Replied", "Said yes", "Asked to stop"],
  );
  assert.equal(by.sent.value, "20");
  assert.equal(by.sent.meta, "over 3 sends");
  assert.equal(by.sent.delta.text, "+400% vs prior 7 days");
  assert.equal(by.delivered.value, "80%", "16 of 20 delivered");
  assert.equal(by.delivered.meta, "16 of 20 · WhatsApp's receipts");
  assert.deepEqual(
    by.delivered.delta,
    { text: "-20 pts vs prior 7 days", tone: "neg" },
    "a share moves in points, never a percentage of a percentage",
  );
  assert.equal(by.replied.value, "20%");
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
    vm.sources.map((s) => [
      s.name,
      s.kindLabel,
      s.runs,
      s.sent,
      s.deliveredPct,
      s.readPct,
      s.repliedPct,
      s.share,
      s.template,
    ]),
    [
      ["Win-back", "Playbook", 2, 14, 86, 50, 21, 1, "Win-back"],
      ["A quick note · Sep 1", "Broadcast", 1, 6, 67, 67, 17, 6 / 14, "A quick note"],
    ],
  );
  assert.match(vm.sources[0].lastLabel, /Sep \d/);
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
    (e) => e.status === 400 && e.message === "days must be 7, 30 or 90.",
    "the same three presets as the receptionist's report",
  );
  const s = readCode("apps/dashboard/src/legacy-bridge/surfaces/reports.ts");
  assert.ok(
    s.includes('read("GET reports/campaigns", { query: { days: String(days) } })'),
    "fetched with the same period, beside the receptionist's numbers",
  );
  assert.ok(
    s.includes("campaigns: campaigns instanceof Error ? null : toCampaignReportVM(campaigns.report)"),
    "its own read: null when it fails, never a blank page (D9)",
  );
  const p = readCode("apps/dashboard/src/legacy/pages/reports-sections.jsx");
  assert.ok(
    p.includes('testid="chart-funnel"'),
    "the funnel: sent, delivered, wrote back (the campaign tiles folded into it: each number once)",
  );
  assert.ok(
    p.includes('testid="chart-campaigns"'),
    "chart-campaigns: the card, the empty and the failed read all carry it",
  );
  assert.ok(
    p.includes('testid="chart-sources"') && p.includes('title="By playbook and broadcast"'),
    "the sources card",
  );
  assert.ok(
    p.includes('<RptSection title="Campaigns"') && p.includes('data-testid="reports-tiles"'),
    "the page is sectioned, and the strip is one frame",
  );
  assert.ok(!/\$\d|revenue|booked from/i.test(p.slice(p.indexOf("const ReportsSections"))), "nothing in dollars");
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
  assert.deepEqual(
    vm.tiles.map((t) => t.compare),
    [null, null, null, null, null],
    "a campaign tile compares nothing on Reports",
  );
});
