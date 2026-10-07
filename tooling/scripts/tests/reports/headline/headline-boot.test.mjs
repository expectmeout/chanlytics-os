/**
 * What the boot stopped loading for Reports' sake (the lenses spec, D17 and §6.5). Before, the runner booted every override on every
 * page, so the report (GET reports, reports/campaigns, reports/reach-outs: three routes and four view models built in the browser) was
 * read on the Inbox as a stranger and on Today as a surface it draws; now Today draws `reports_headline`, one small read, and the
 * report is read where Reports is on screen. The real runner is started over every override (the report's real, over a recording
 * fetch on a busy workspace's thirty days; the others recorded) on `today` and on `inbox`, both passes counted, before and after; and
 * the database's doors are counted per route over the in-memory double. The direction is held; the numbers are printed for the pull
 * request.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { headlineOf } from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";
import { campaignDto, cday, reportDto, rday } from "../_report-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
installLegacyReact();
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
const keepError = console.error;
console.error = () => {};
const { reportsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { reportsHeadlineOverride } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");
console.error = keepError;
const { ROUTE_DRAWS } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
const reportsRoute = await importSrc("apps/dashboard/app/api/v1/reports/route.ts");
const campaignsRoute = await importSrc("apps/dashboard/app/api/v1/reports/campaigns/route.ts");
const reachOutsRoute = await importSrc("apps/dashboard/app/api/v1/reports/reach-outs/route.ts");
const headlineRoute = await importSrc("apps/dashboard/app/api/v1/reports/headline/route.ts");
beforeEach(() => setRateStore(memoryStore()));

/* ---- a busy workspace's thirty days, and the thirty before them ---- */
const DAYS = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 7, 6 + i)).toISOString().slice(0, 10));
const busyReport = () =>
  reportDto({
    days: 30,
    span_days: 60,
    today: DAYS[59],
    series: DAYS.map((d, i) =>
      rday(d, {
        messages_in: 9 + (i % 5),
        conversations: 6,
        answered_ai: 7,
        answered_you: 1,
        unanswered: 1,
        out_ai: 7,
        out_you: 1,
        escalations: i % 4 === 0 ? 1 : 0,
        calls: 1 + (i % 3),
        call_seconds: 140,
        new_contacts: i % 2,
      }),
    ),
    replies: DAYS.slice(30).flatMap((day) => Array.from({ length: 7 }, (_, k) => ({ day, s: 60 + k, hold: 60 }))),
    arrivals: DAYS.slice(30).flatMap((d) => Array.from({ length: 8 }, (_, q) => ({ d, q: 36 + q, n: 1 }))),
  });
const busyCampaigns = () => ({
  ...campaignDto(),
  days: 30,
  span_days: 60,
  today: DAYS[59],
  series: DAYS.map((d) => cday(d, { sent: 3, delivered: 3, read: 2, replied: 1 })),
});
const NO_REACH_OUTS = {
  timezone: "America/New_York",
  days: 30,
  today: DAYS[59],
  since: DAYS[30],
  has_reach_out: false,
  totals: { written: 0, delivered: 0, bounced: 0, wrote_back: 0, interested: 0, booked: 0, said_no: 0, handed: 0 },
  series: [],
  chains: [],
  angles: [],
  other_angles: { written: 0, wrote_back: 0 },
  no_angle: 0,
  domains: [],
};
const BOOKING = { calendar: "ok", days: 30, asked: 140, booked: 60 };
const BODIES = {
  reports: { report: busyReport(), booking: BOOKING, deals: null, profile: null },
  "reports/campaigns": { report: busyCampaigns() },
  "reports/reach-outs": { report: NO_REACH_OUTS },
  "reports/headline": { headline: headlineOf(busyReport(), "30d", BOOKING) },
};

/* ---- the runner: both passes of a boot over every override, before and after ---- */
const sent = [];
globalThis.window.fetch = async (url) => {
  const route = new URL(String(url), "https://app.chanlytics.com").pathname.replace("/api/v1/", "");
  const body = BODIES[route];
  assert.ok(body !== undefined, `a read this test does not model: ${route}`);
  const text = JSON.stringify({ ok: true, data: body });
  sent.push({ route, bytes: Buffer.byteLength(text) });
  return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
};
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
const S = "apps/dashboard/src";
const { startSurfaces } = await importSrc(`${S}/legacy-bridge/surface-runner.ts`);
/** Every other override the app registers (LegacyApp.tsx), recorded rather than read: the runner decides what is read. */
const OTHERS = [
  (await importSrc(`${S}/legacy-bridge/surface-data.ts`)).workspaceOverride,
  (await importSrc(`${S}/surfaces/inbox/conversations-surface.ts`)).conversationsOverride,
  (await importSrc(`${S}/surfaces/inbox/surface.ts`)).inboxOverride,
  (await importSrc(`${S}/surfaces/today/surface.ts`)).todayOverride,
  (await importSrc(`${S}/legacy-bridge/surfaces/settings.ts`)).settingsOverride,
  (await importSrc(`${S}/surfaces/people/surface.ts`)).peopleOverride,
  (await importSrc(`${S}/surfaces/leads/surface.ts`)).leadsOverride,
  (await importSrc(`${S}/surfaces/live/surface.ts`)).liveOverride,
  (await importSrc(`${S}/surfaces/campaigns/broadcasts/surface.ts`)).broadcastsOverride,
  (await importSrc(`${S}/surfaces/campaigns/playbooks/surface.ts`)).playbooksOverride,
  (await importSrc(`${S}/surfaces/campaigns/reach-out/surface.ts`)).reachOutsOverride,
  (await importSrc(`${S}/legacy-bridge/reach-out/replies.ts`)).repliesOverride,
  (await importSrc(`${S}/surfaces/settings/partner/surface.ts`)).partnerOverride,
  (await importSrc(`${S}/surfaces/calendar/surface.ts`)).calendarOverride,
  (await importSrc(`${S}/legacy-bridge/surfaces/notifications.ts`)).notificationsOverride,
  (await importSrc(`${S}/surfaces/setup/surface.ts`)).setupOverride,
  (await importSrc(`${S}/legacy-bridge/google.ts`)).googleOverride,
  (await importSrc(`${S}/surfaces/settings/billing/surface.ts`)).billingOverride,
];
const settle = async (n = 40) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
};
/**
 * The runner started on `hash` over every override, and what both its passes read. Before: no `onDemand` (the runner as it was: the
 * report is a stranger on every page but Reports), Today drawing the report, and no headline. After: this branch's.
 */
async function bootOn(hash, after) {
  globalThis.window.location.hash = hash;
  sent.length = 0;
  const asked = [];
  const drawn = ROUTE_DRAWS.today;
  if (!after) ROUTE_DRAWS.today = drawn.map((k) => (k === "reports_headline" ? "reports" : k));
  const overrides = [
    ...OTHERS.map((o) => ({ ...o, apply: async () => void asked.push(o.key) })),
    after ? reportsOverride : { ...reportsOverride, onDemand: false },
    ...(after ? [reportsHeadlineOverride] : []),
  ];
  const stop = startSurfaces(overrides, () => () => {});
  try {
    await settle();
  } finally {
    stop();
    ROUTE_DRAWS.today = drawn;
  }
  return {
    routes: sent.map((s) => s.route).sort(),
    requests: sent.length,
    bytes: sent.reduce((n, s) => n + s.bytes, 0),
    asked,
  };
}
const REPORT_ROUTES = ["reports", "reports/campaigns", "reports/reach-outs"];

test("on Today, one small route is read for Reports' sake where three large ones were, in either pass", async (t) => {
  assert.ok(ROUTE_DRAWS.today.includes("reports_headline"), "Today draws the headline");
  assert.ok(!ROUTE_DRAWS.today.includes("reports"), "and no longer the report");
  const before = await bootOn("#/today", false);
  const after = await bootOn("#/today", true);
  t.diagnostic(
    `Today's boot, both passes, on a busy workspace's 30 days: before ${before.requests} requests, ${before.bytes} bytes (${before.routes.join(", ")}); after ${after.requests} request, ${after.bytes} bytes (${after.routes.join(", ")})`,
  );
  assert.deepEqual(before.routes, REPORT_ROUTES);
  assert.deepEqual(after.routes, ["reports/headline"]);
  assert.ok(
    after.bytes * 20 < before.bytes,
    `a few hundred bytes for tens of thousands: ${after.bytes} against ${before.bytes}`,
  );
});

test("on any other page the report is no longer read at all: it was a stranger in the second pass of every boot, and is now left to its own page", async (t) => {
  const before = await bootOn("#/inbox", false);
  const after = await bootOn("#/inbox", true);
  t.diagnostic(
    `The Inbox's boot, both passes: before ${before.requests} requests, ${before.bytes} bytes (${before.routes.join(", ")}); after ${after.requests} requests, ${after.bytes} bytes`,
  );
  assert.deepEqual(
    before.routes,
    REPORT_ROUTES,
    "REGRESSION it measures: every page's boot read the report beside its own",
  );
  assert.deepEqual(
    after.routes,
    [],
    "the Inbox's boot reads nothing of Reports: not the report, and not Today's headline",
  );
  assert.equal(after.asked.includes("inbox"), true, "and still reads what it draws, and the strangers not marked");
});

/* ---- the server: which doors each route reaches for ---- */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const req = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const world = () => ({
  tables: {
    memberships: [
      {
        user_id: "u1",
        tenant_id: A,
        role: "viewer",
        tenants: { slug: "harbor", name: "Harbor Studio", timezone: "America/New_York" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    tenants: [],
    tenant_config: [],
    policies: [],
  },
  rpcs: {
    report_series: (a) => ({ ...busyReport(), days: a.p_days }),
    campaign_series: (a) => ({ ...busyCampaigns(), days: a.p_days }),
    reach_out_report: () => NO_REACH_OUTS,
    people_list: () => [],
  },
});
const doorsOf = async (route) => {
  const w = world();
  const ctx = { supabase: fakeDb(w.tables, {}, w.rpcs), userId: "u1", email: "ada@example.com", params: {} };
  await route.GET.run(req(`?period=30d&workspace=${A}`), ctx);
  return new Set(ctx.supabase.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`)));
};

test("the database is asked less: the headline reaches for the report's series, People and the calendar, and not for the campaigns', the reach-outs' or the deals", async (t) => {
  const before = new Set();
  for (const route of [reportsRoute, campaignsRoute, reachOutsRoute])
    for (const door of await doorsOf(route)) before.add(door);
  const after = await doorsOf(headlineRoute);
  t.diagnostic(`doors, before (three routes): ${[...before].sort().join(", ")}`);
  t.diagnostic(`doors, after (one route): ${[...after].sort().join(", ")}`);
  for (const door of after) assert.ok(before.has(door), `the headline reaches for nothing new: ${door}`);
  for (const door of ["rpc:report_series", "rpc:people_list"]) assert.ok(after.has(door), `still read: ${door}`);
  for (const door of ["rpc:campaign_series", "rpc:reach_out_report"]) {
    assert.ok(before.has(door), `read before: ${door}`);
    assert.ok(!after.has(door), `no longer read: ${door}`);
  }
});
