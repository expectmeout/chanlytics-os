/**
 * The report functions as packages/db calls them (repositories/reports/report-series.ts): by name, for the workspace and the days,
 * over whatever client the caller holds (the session's, so RLS decides what a member reads). A read that fails throws;
 * the reach-outs' say the database's refusal with its code, for the door to word. The reviews' ledger (`reviews_ledger`)
 * is one of them: its counts, its window in the workspace's zone and who wrote each reply are SQL's, held by
 * google/google-reviews-ledger.db.test.mjs over a real database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignSeries, reachOutReport, reportSeries, reviewsLedger } from "@chanlytics/db";

const W = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** A database that answers a function by name and keeps what it was asked. */
const dbWith = (answers) => {
  const asked = [];
  return { asked, db: { rpc: async (name, args) => (asked.push([name, args]), answers[name]) } };
};

test("each function is asked for the workspace and the days, and answers what the database says", async () => {
  const { db, asked } = dbWith({
    report_series: { data: { days: 7 }, error: null },
    campaign_series: { data: { days: 30 }, error: null },
    reviews_ledger: { data: { days: 30, written: [] }, error: null },
    reach_out_report: { data: { days: 90 }, error: null },
  });
  assert.deepEqual(await reportSeries(db, W, 7), { days: 7 });
  assert.deepEqual(await campaignSeries(db, W, 30), { days: 30 });
  assert.deepEqual(await reviewsLedger(db, W, 30), { days: 30, written: [] });
  assert.deepEqual(await reachOutReport(db, W, 90), { ok: true, data: { days: 90 } });
  assert.deepEqual(asked, [
    ["report_series", { p_tenant_id: W, p_days: 7 }],
    ["campaign_series", { p_tenant_id: W, p_days: 30 }],
    ["reviews_ledger", { p_tenant_id: W, p_days: 30 }],
    ["reach_out_report", { p_tenant_id: W, p_days: 90 }],
  ]);
});

test("a read that fails throws, never nothing; the reach-outs' refusal keeps the code the door words it by", async () => {
  const down = { data: null, error: { message: "connection refused", code: "08006" } };
  await assert.rejects(reportSeries(dbWith({ report_series: down }).db, W, 7), /report_series.*connection refused/);
  await assert.rejects(
    campaignSeries(dbWith({ campaign_series: down }).db, W, 7),
    /campaign_series.*connection refused/,
  );
  await assert.rejects(reviewsLedger(dbWith({ reviews_ledger: down }).db, W, 7), /reviews_ledger.*connection refused/);
  const refused = { data: null, error: { message: "No workspace.", code: "P0002" } };
  assert.deepEqual(await reachOutReport(dbWith({ reach_out_report: refused }).db, W, 7), {
    ok: false,
    code: "P0002",
    message: "No workspace.",
  });
});
