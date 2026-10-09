/**
 * The report functions as packages/db calls them (repositories/reports/report-series.ts): by name, for the workspace and the days,
 * over whatever client the caller holds (the session's, so RLS decides what a member reads). A read that fails throws;
 * the reach-outs' say the database's refusal with its code, for the door to word. The reviews' ledger (`reviews_ledger`)
 * is one of them: its counts, its window in the workspace's zone and who wrote each reply are SQL's, held by
 * google/google-reviews-ledger.db.test.mjs over a real database. It answers null where the database does not have its
 * function yet (00350 is applied after the dashboard deploys), and the counts beside it (00362, 00363) answer "missing",
 * for one release.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignSeries,
  playbookTotals,
  reachOutChainTotals,
  reachOutReport,
  reportSeries,
  reviewsLedger,
  runCounts,
  templateSends,
} from "@chanlytics/db";

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

test("a database that does not have the reviews' ledger yet (00350 not applied) answers null, and only that: any other refusal throws, and no other function is excused", async () => {
  const gone = "Could not find the function public.reviews_ledger(p_days, p_tenant_id) in the schema cache";
  const refusedWith = (code) => ({ data: null, error: { message: gone, code } });
  for (const code of ["PGRST202", "42883"])
    assert.equal(await reviewsLedger(dbWith({ reviews_ledger: refusedWith(code) }).db, W, 30), null, code);
  for (const code of ["42501", "08006", undefined])
    await assert.rejects(
      reviewsLedger(dbWith({ reviews_ledger: refusedWith(code) }).db, W, 30),
      /reviews_ledger: Could not find the function/,
      `${code}`,
    );
  await assert.rejects(
    reportSeries(dbWith({ report_series: refusedWith("PGRST202") }).db, W, 30),
    /report_series: Could not find the function/,
    "the series is the report's own: a database without it is a failure, not a lens that draws less",
  );
});

test("the counts' doors (00362, 00363) ask by name for the workspace, answer what the database says, answer 'missing' for a database without the function -- PostgREST's PGRST202, Postgres's 42883 -- so the dashboard reads the old way for one release, and throw every other failure", async () => {
  const { db, asked } = dbWith({
    playbook_totals: { data: { p1: {} }, error: null },
    run_counts: { data: {}, error: null },
    template_sends: { data: {}, error: null },
    reach_out_chain_totals: { data: {}, error: null },
  });
  assert.deepEqual(await playbookTotals(db, W, 10), { p1: {} });
  assert.deepEqual(await runCounts(db, W, ["b1", "b2"]), {});
  assert.deepEqual(await templateSends(db, W), {});
  assert.deepEqual(await reachOutChainTotals(db, W, 30), {});
  assert.deepEqual(asked, [
    ["playbook_totals", { p_tenant_id: W, p_history: 10 }],
    ["run_counts", { p_tenant_id: W, p_run_ids: ["b1", "b2"] }],
    ["template_sends", { p_tenant_id: W }],
    ["reach_out_chain_totals", { p_tenant_id: W, p_days: 30 }],
  ]);
  for (const code of ["PGRST202", "42883"]) {
    const gone = { data: null, error: { message: "Could not find the function", code } };
    const missing = dbWith({
      playbook_totals: gone,
      run_counts: gone,
      template_sends: gone,
      reach_out_chain_totals: gone,
    }).db;
    assert.equal(await playbookTotals(missing, W, 10), "missing", code);
    assert.equal(await runCounts(missing, W, []), "missing", code);
    assert.equal(await templateSends(missing, W), "missing", code);
    assert.equal(await reachOutChainTotals(missing, W, 30), "missing", code);
  }
  const down = { data: null, error: { message: "canceling statement due to statement timeout", code: "57014" } };
  const slow = dbWith({
    playbook_totals: down,
    run_counts: down,
    template_sends: down,
    reach_out_chain_totals: down,
  }).db;
  await assert.rejects(playbookTotals(slow, W, 10), /playbook_totals: canceling statement/);
  await assert.rejects(runCounts(slow, W, []), /run_counts: canceling statement/);
  await assert.rejects(templateSends(slow, W), /template_sends: canceling statement/);
  await assert.rejects(reachOutChainTotals(slow, W, 30), /reach_out_chain_totals: canceling statement/);
  // Each function answers one object (an empty one when nothing is counted), so any other answer is a read that failed,
  // never a value "missing" could be mistaken for.
  for (const odd of [null, [], "missing", 3]) {
    const strange = dbWith({ run_counts: { data: odd, error: null } }).db;
    await assert.rejects(runCounts(strange, W, []), /run_counts: answered no object/, JSON.stringify(odd));
  }
});
