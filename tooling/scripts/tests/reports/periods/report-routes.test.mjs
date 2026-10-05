/**
 * The one query the three report routes take (readers/report-period.ts): `period` names the window, `days` is read until
 * its day (report-periods.test.mjs holds it), and Month is the days since the 1st in the workspace's own zone, read from the
 * membership's facts and only when Month is asked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { readerContext } = await importSrc("apps/dashboard/src/server/readers/index.ts");
const { reportDaysFor } = await importSrc("apps/dashboard/src/server/readers/report-period.ts");

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
