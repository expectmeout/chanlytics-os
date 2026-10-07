/**
 * The one query the four report routes take (readers/report.ts): `period` names the window, `days` is read until
 * its day (report-periods.test.mjs holds it), and Month is the days since the 1st in the workspace's own zone, read from the
 * membership's facts and only when Month is asked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { readerContext } = await importSrc("apps/dashboard/src/server/readers/index.ts");
const { reportDaysFor } = await importSrc("apps/dashboard/src/server/readers/report.ts");
const { fakeDb } = await import("../../_fake-db.mjs");
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
const { REPORT_RANGES, REPORT_PERIOD_IDS, reviewsReadSince } = await import("@chanlytics/contracts");

const W = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** A reader context for a workspace in `timezone` at `iso`; its supabase is never touched (the facts are seeded). */
const at = (iso, timezone) =>
  readerContext(
    { userId: "u1", supabase: null },
    { tenantId: W, role: "viewer", facts: { name: "Harbor Studio", timezone } },
    new Date(iso),
  );

test("a request's period is its days: the three presets as they are, Month in the workspace's zone", async () => {
  const la = at("2026-10-01T02:30:00Z", "America/Los_Angeles");
  assert.deepEqual(await Promise.all(["7d", "30d", "90d"].map((period) => reportDaysFor(la, { period }))), [7, 30, 90]);
  assert.equal(await reportDaysFor(la, { period: "month" }), 30, "still 30 September in Los Angeles");
  assert.equal(
    await reportDaysFor(at("2026-10-01T02:30:00Z", "Pacific/Auckland"), { period: "month" }),
    1,
    "the 1st already in Auckland: one day",
  );
  assert.equal(await reportDaysFor(at("2026-10-05T12:00:00Z", "America/New_York"), { period: "month" }), 5);
});

test("a route sent period=month answers the days since the 1st in the workspace's zone, and the closed set of periods refuses any other at the door", async () => {
  setRateStore(memoryStore());
  const route = await importSrc("apps/dashboard/app/api/v1/reports/campaigns/route.ts");
  const asked = [];
  const ctx = () => ({
    supabase: fakeDb(
      {
        memberships: [
          {
            user_id: "u1",
            tenant_id: W,
            role: "viewer",
            tenants: { slug: "harbor", name: "Harbor Studio", timezone: "America/New_York" },
            created_at: "2026-01-01",
          },
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
  const out = await route.GET.run(
    new Request(`http://localhost/api/v1/reports/campaigns?period=month&workspace=${W}`),
    ctx(),
  );
  // Month is the day of the month in the workspace's zone, today included (a request that crosses local midnight is accepted: Not in this plan).
  const days = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(8, 10));
  assert.deepEqual([out, asked], [{ report: { days } }, [{ p_tenant_id: W, p_days: days }]]);
  for (const bad of ["14d", "7", "MONTH"])
    await assert.rejects(
      route.GET.run(new Request(`http://localhost/api/v1/reports/campaigns?period=${bad}&workspace=${W}`), ctx()),
      (e) => e.status === 400,
      `period=${bad} is no id of the table`,
    );
});

test("the reviews' route takes the same query: Month is the days since the 1st in the workspace's zone, the one ledger read starts from the day that zone and those days say, and any other period is refused at the door", async () => {
  setRateStore(memoryStore());
  const route = await importSrc("apps/dashboard/app/api/v1/reports/reviews/route.ts");
  const ctx = () => ({
    supabase: fakeDb({
      memberships: [
        {
          user_id: "u1",
          tenant_id: W,
          role: "viewer",
          tenants: { slug: "harbor", name: "Harbor Studio", timezone: "America/New_York" },
          created_at: "2026-01-01",
        },
      ],
      policies: [],
      google_listings: [{ tenant_id: W, place_id: "place-1", name: "Harbor Studio", rating: 4.8, review_count: 213 }],
      google_connections: [],
      google_reviews: [],
      google_listing_days: [],
      events: [],
    }),
    userId: "u1",
    email: "ada@example.com",
    params: {},
  });
  const c = ctx();
  const out = await route.GET.run(
    new Request(`http://localhost/api/v1/reports/reviews?period=month&workspace=${W}`),
    c,
  );
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  assert.deepEqual([out.timezone, out.today, out.days], ["America/New_York", today, Number(today.slice(8, 10))]);
  assert.notEqual(out.ledger, null, "a listing is linked: the ledger is read");
  assert.deepEqual(
    c.supabase.seen
      .filter((q) => q.table === "google_reviews" && q.op === "select")
      .flatMap((q) => q.filters)
      .filter(([op, col]) => op === "gte" && col === "published_at"),
    [["gte", "published_at", reviewsReadSince(out.today, out.days)]],
    "from the day before the period before the month begins",
  );
  for (const bad of ["14d", "7", "MONTH"])
    await assert.rejects(
      route.GET.run(new Request(`http://localhost/api/v1/reports/reviews?period=${bad}&workspace=${W}`), ctx()),
      (e) => e.status === 400,
      `period=${bad} is no id of the table`,
    );
});

test("the table is the one list of periods: the closed set a request names, and the counts of days the Ask report tool takes, said from it", async () => {
  assert.deepEqual(
    REPORT_PERIOD_IDS,
    REPORT_RANGES.map((r) => r.id),
    "the ids, in the control's order",
  );
  const { reportTool } = await importSrc("apps/dashboard/src/server/ask/tools/read/report.ts");
  const [action] = Object.values(reportTool.actions);
  const counts = REPORT_RANGES.flatMap((r) => (r.days === null ? [] : [r.days]));
  for (const days of counts) assert.equal(action.input.safeParse({ days }).success, true, `${days} days`);
  for (const days of [1, 8, 45, 365])
    assert.equal(action.input.safeParse({ days }).success, false, `${days} days is no period of the table`);
  assert.ok(
    reportTool.description.includes(
      `days takes ${counts.slice(0, -1).join(", ")} or ${counts.at(-1)} and nothing else`,
    ),
    "the sentence the model reads is made from the table",
  );
});

test("`days`, which open tabs still send, means what it meant; none named is thirty days; a period that is none of ours is refused in words", async () => {
  const rc = at("2026-10-05T12:00:00Z", "America/New_York");
  assert.equal(await reportDaysFor(rc, { days: "90" }), 90);
  assert.equal(await reportDaysFor(rc, {}), 30);
  for (const bad of [{ days: "45" }, { period: "14d" }, { period: "" }])
    await assert.rejects(
      reportDaysFor(rc, bad),
      (e) => e.status === 400 && e.message === "period must be 7d, 30d, 90d or month.",
      JSON.stringify(bad),
    );
});
