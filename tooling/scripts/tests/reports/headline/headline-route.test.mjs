/**
 * GET /api/v1/reports/headline (readers/report.ts `reportHeadline`): the same report_series the page's route calls, summed on
 * the server by contracts' headlineOf, with the booking line counted by the one function the report counts it with. Executed over
 * the database in memory, in the worlds Reports' reader tests draw (tests/ask/readers.test.mjs).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { headlineOf, toHeadlineVM, toReportVM } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";
import { reportDto } from "../_report-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const kernel = await importSrc("apps/dashboard/src/server/readers/index.ts");
const { reportHeadline, reportPeriodAsked } = await importSrc("apps/dashboard/src/server/readers/report.ts");
const headlineRoute = await importSrc("apps/dashboard/app/api/v1/reports/headline/route.ts");
const reportsRoute = await importSrc("apps/dashboard/app/api/v1/reports/route.ts");
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const req = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const none = (days) => ({ calendar: "none", days, asked: 0, booked: 0 });
/** Harbor Studio in New York: nobody in People, no calendar, and report_series answering the world's series for the days asked. */
const world = (answer = (a) => ({ ...reportDto(), days: a.p_days })) => ({
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
  rpcs: { report_series: answer, people_list: () => [] },
});
const ctxOf = (w) => ({ supabase: fakeDb(w.tables, {}, w.rpcs), userId: "u1", email: "ada@example.com", params: {} });
const seenOf = (ctx, name) => ctx.supabase.seen.filter((q) => q.rpc === name).map((q) => q.args);

test("the route answers the series summed on the server, for each preset: report_series asked once, for the days, and the booking line beside it", async () => {
  for (const [period, days] of [
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ]) {
    const ctx = ctxOf(world());
    const body = await headlineRoute.GET.run(req(`?period=${period}&workspace=${A}`), ctx);
    assert.deepEqual(Object.keys(body), ["headline"]);
    assert.deepEqual(body.headline, headlineOf({ ...reportDto(), days }, period, none(days)), period);
    assert.deepEqual(
      seenOf(ctx, "report_series"),
      [{ p_tenant_id: A, p_days: days }],
      `${period}: one call, for ${days}`,
    );
  }
});

test("Today's numbers are Reports' numbers: the headline and the page's own route count one series, and the booking line is the same line", async () => {
  const page = await reportsRoute.GET.run(req(`?period=30d&workspace=${A}`), ctxOf(world()));
  const head = await headlineRoute.GET.run(req(`?period=30d&workspace=${A}`), ctxOf(world()));
  const vm = toReportVM(page.report, { profile: page.profile });
  const today = toHeadlineVM(head.headline);
  assert.equal(today.messages.total, vm.answered.totals.in);
  assert.equal(today.messages.compare, vm.tiles.find((t) => t.id === "messages").compare);
  assert.equal(today.answered.share, vm.answered.share);
  assert.equal(today.calls, vm.calls.total);
  assert.deepEqual(
    head.headline.booking,
    page.booking,
    "the one booking function: the same answer from the same world",
  );
});

test("Month is the days since the 1st in the workspace's zone, as for the other three report routes", async () => {
  const ctx = ctxOf(world());
  const rc = kernel.readerContext(
    ctx,
    { tenantId: A, role: "viewer", facts: { name: "Harbor Studio", timezone: "America/New_York" } },
    new Date("2026-10-05T12:00:00Z"),
  );
  const { data } = await kernel.load(rc, reportHeadline, { period: "month" });
  assert.deepEqual([data.headline.period, data.headline.days], ["month", 5]);
  assert.deepEqual(seenOf(ctx, "report_series"), [{ p_tenant_id: A, p_days: 5 }]);
});

test("a workspace the database answers nothing for is the page's 404, in its words; a period that is none of ours is refused in words", async () => {
  const rc = kernel.readerContext(ctxOf(world(() => ({ error: "unknown_tenant" }))), { tenantId: A, role: "viewer" });
  await assert.rejects(
    kernel.load(rc, reportHeadline, { period: "7d" }),
    (e) => [e.code, e.status, e.message].join("|") === "not_found|404|No workspace found for this report.",
  );
  for (const bad of [{ period: "14d" }, { period: "" }])
    assert.throws(
      () => reportPeriodAsked(bad),
      (e) => e.status === 400 && e.message === "period must be 7d, 30d, 90d or month.",
      JSON.stringify(bad),
    );
  assert.equal(reportPeriodAsked({}), "30d", "none named is thirty days");
  assert.equal(reportPeriodAsked({ days: "45" }), "30d", "`days` is no longer read: none named");
});

test("the route declares its policy as its siblings do: a member's read, counted with the aggregate reads", () => {
  assert.deepEqual(headlineRoute.GET.policy, {
    kind: "read",
    scope: "workspace",
    role: null,
    rate: "aggregate",
    spend: false,
  });
});
