/**
 * The one query the four report routes take (readers/report.ts): `period` names the window, `days` is read until
 * its day (report-periods.test.mjs holds it) by the three routes that existed before there was a Month, and Month is the days
 * since the 1st in the workspace's own zone, read from the membership's facts and only when Month is asked. The Reviews route
 * is newer than `days` and takes the period alone. And the days a member picked, `from` and `to` together: a window that
 * ends on the workspace's today names no day to the database, as a period never does, and one that ended earlier names
 * its last day; what cannot be read is refused in the request's own words, before anything is asked of the database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { rows } from "../../_rows.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { readerContext } = await importSrc("apps/dashboard/src/server/readers/index.ts");
const { reportWindowFor } = await importSrc("apps/dashboard/src/server/readers/report.ts");
const { fakeDb } = await import("../../_fake-db.mjs");
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
const { REPORT_RANGES, REPORT_PERIOD_IDS } = await import("@chanlytics/contracts");

const W = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** A reader context for a workspace in `timezone` at `iso`; its supabase is never touched (the facts are seeded). */
const at = (iso, timezone) =>
  readerContext(
    { userId: "u1", supabase: null },
    { tenantId: W, role: "viewer", facts: { name: "Harbor Studio", timezone } },
    new Date(iso),
  );

/** A period's window: its days, and no last day named, since it ends on the workspace's today. */
const live = (days) => ({ days, end: null });

test("a request's period is its days: the three presets as they are, Month in the workspace's zone, and none names a last day", async () => {
  const la = at("2026-10-01T02:30:00Z", "America/Los_Angeles");
  assert.deepEqual(await Promise.all(["7d", "30d", "90d"].map((period) => reportWindowFor(la, { period }))), [
    live(7),
    live(30),
    live(90),
  ]);
  assert.deepEqual(await reportWindowFor(la, { period: "month" }), live(30), "still 30 September in Los Angeles");
  assert.deepEqual(
    await reportWindowFor(at("2026-10-01T02:30:00Z", "Pacific/Auckland"), { period: "month" }),
    live(1),
    "the 1st already in Auckland: one day",
  );
  assert.deepEqual(await reportWindowFor(at("2026-10-05T12:00:00Z", "America/New_York"), { period: "month" }), live(5));
});

test("days a member picked are read as that many days to their last day, which is named only when it is before the workspace's today", async () => {
  const ny = at("2026-10-06T16:00:00Z", "America/New_York");
  assert.deepEqual(await reportWindowFor(ny, { from: "2026-09-01", to: "2026-09-20" }), {
    days: 20,
    end: "2026-09-20",
  });
  assert.deepEqual(await reportWindowFor(ny, { from: "2026-10-05", to: "2026-10-05" }), { days: 1, end: "2026-10-05" });
  assert.deepEqual(
    await reportWindowFor(ny, { from: "2026-10-01", to: "2026-10-06" }),
    live(6),
    "days that end today are read as a period is: no day named, so a database without 00359 reads them too",
  );
  assert.deepEqual(await reportWindowFor(ny, { from: "2026-07-09", to: "2026-10-06" }), live(90), "ninety days");
  // Today is the workspace's, not the server's: at 02:30 UTC on the 7th it is still the 6th in New York and already the 7th in Auckland.
  const late = "2026-10-07T02:30:00Z";
  assert.deepEqual(
    await reportWindowFor(at(late, "America/New_York"), { from: "2026-10-01", to: "2026-10-06" }),
    live(6),
    "the 6th is today in New York",
  );
  assert.deepEqual(
    await reportWindowFor(at(late, "Pacific/Auckland"), { from: "2026-10-01", to: "2026-10-06" }),
    { days: 6, end: "2026-10-06" },
    "and yesterday in Auckland",
  );
});

test("days that cannot be read are refused in the request's own words: to come, too many, out of order, half a window, or beside a period", async () => {
  const ny = at("2026-10-06T16:00:00Z", "America/New_York");
  const refused = (asked, message) =>
    assert.rejects(
      reportWindowFor(ny, asked),
      (e) => e.status === 400 && e.message === message,
      `${JSON.stringify(asked)}: ${message}`,
    );
  await refused({ from: "2026-10-01", to: "2026-10-07" }, "A report ends today at the latest.");
  await refused({ from: "2026-07-08", to: "2026-10-06" }, "A report covers 90 days at most.");
  await refused({ from: "2026-09-20", to: "2026-09-01" }, "from is after to.");
  for (const half of [
    { from: "2026-09-01" },
    { to: "2026-09-20" },
    { from: "2026-09-01", to: "2026-09-20", period: "7d" },
    { from: "2026-09-01", to: "2026-09-20", days: "7" },
    { from: "2026-02-30", to: "2026-03-01" },
  ])
    await assert.rejects(reportWindowFor(ny, half), (e) => e.status === 400, JSON.stringify(half));
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

test("a route sent from and to asks the database for those days to their last day, and refuses days to come before asking it anything", async () => {
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
          return { days: a.p_days, end: a.p_end };
        },
      },
    ),
    userId: "u1",
    email: "ada@example.com",
    params: {},
  });
  const get = (query) =>
    route.GET.run(new Request(`http://localhost/api/v1/reports/campaigns?${query}&workspace=${W}`), ctx());
  // Days long past, whatever today is: twenty of them, to the 20th.
  const out = await get("from=2026-01-01&to=2026-01-20");
  assert.deepEqual(
    [out, asked],
    [{ report: { days: 20, end: "2026-01-20" } }, [{ p_tenant_id: W, p_days: 20, p_end: "2026-01-20" }]],
  );
  asked.length = 0;
  for (const bad of ["from=2999-01-01&to=2999-01-05", "from=2026-01-01", "from=2026-01-20&to=2026-01-01"])
    await assert.rejects(get(bad), (e) => e.status === 400, bad);
  await assert.rejects(get("from=2026-01-01&to=2026-01-20&period=7d"), (e) => e.status === 400, "days beside a period");
  assert.deepEqual(asked, [], "nothing was asked of the database for days it would not be read over");
});

test("the reviews' route takes the period alone: Month is the days since the 1st in the workspace's zone, the ledger is asked for those days, any other period is refused at the door, and `days` is none of its query", async () => {
  setRateStore(memoryStore());
  const route = await importSrc("apps/dashboard/app/api/v1/reports/reviews/route.ts");
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
        policies: [],
        google_listings: [rows.googleListing({ tenant_id: W, name: "Harbor Studio", rating: 4.8, review_count: 213 })],
        google_connections: [],
        google_reviews: [],
        google_listing_days: [],
        events: [],
      },
      {},
      {
        reviews_ledger: (a) => ({
          timezone: "America/New_York",
          today: "2026-10-07",
          days: a.p_days,
          on_record: { profile: 0, places: 0, complete: false },
          written: [],
          waiting_total: 0,
          waiting: [],
        }),
      },
    ),
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
  assert.equal(out.ledger, null, "no Business Profile has synced: the five public reviews are no record");
  assert.deepEqual(
    c.supabase.seen.filter((q) => q.rpc),
    [{ rpc: "reviews_ledger", args: { p_tenant_id: W, p_days: out.days } }],
    "the database counts the month's days, and the period before them",
  );
  for (const bad of ["14d", "7", "MONTH"])
    await assert.rejects(
      route.GET.run(new Request(`http://localhost/api/v1/reports/reviews?period=${bad}&workspace=${W}`), ctx()),
      (e) => e.status === 400,
      `period=${bad} is no id of the table`,
    );
  // No page ever sent `days` to this route, so it is not read here as it is on the three older ones: none named is thirty.
  const aged = await route.GET.run(new Request(`http://localhost/api/v1/reports/reviews?days=7&workspace=${W}`), ctx());
  assert.equal(aged.days, 30, "thirty days, whatever the old query says");
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
  assert.deepEqual(await reportWindowFor(rc, { days: "90" }), live(90));
  assert.deepEqual(await reportWindowFor(rc, {}), live(30));
  for (const bad of [{ days: "45" }, { period: "14d" }, { period: "" }])
    await assert.rejects(
      reportWindowFor(rc, bad),
      (e) => e.status === 400 && e.message === "period must be 7d, 30d, 90d or month.",
      JSON.stringify(bad),
    );
});
