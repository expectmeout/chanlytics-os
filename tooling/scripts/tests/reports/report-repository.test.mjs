/**
 * The report functions as packages/db calls them (repositories/reports/report-series.ts): by name, for the workspace and the days,
 * over whatever client the caller holds (the session's, so RLS decides what a member reads). A read that fails throws;
 * the reach-outs' say the database's refusal with its code, for the door to word. The reviews' ledger (`reviews_ledger`)
 * is one of them: its counts, its window in the workspace's zone and who wrote each reply are SQL's, held by
 * google/google-reviews-ledger.db.test.mjs over a real database. It and the Receptionist lens's series
 * (`receptionist_series`, 00380) and the People lens's (`people_series`, 00394) answer null where the database does not
 * have their function yet (00350, 00380 and 00394 are applied after the dashboard deploys), and the counts beside them
 * (00374, 00375) answer "missing", for one release.
 *
 * Each reads a window: a count of days and the day they end on (00359). Days that end today name no day, which is the
 * call every one of these was before, so a database without 00359 reads a period as it always did; only days that ended
 * earlier name their last day, and a database that cannot take one is said as that, never as some other days. What the
 * functions count over a window is SQL's, held by periods/report-window.db.test.mjs over a real database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ReportWindowNotReadable,
  campaignSeries,
  playbookTotals,
  reachOutChainTotals,
  peopleSeries,
  reachOutReport,
  receptionistSeries,
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
/** Days that end on the workspace's today: no last day is named. */
const live = (days) => ({ days, end: null });
/** Days that ended before today, to their last day. */
const ended = (days, end) => ({ days, end });

test("each function is asked for the workspace and the days, and answers what the database says", async () => {
  const { db, asked } = dbWith({
    report_series: { data: { days: 7 }, error: null },
    campaign_series: { data: { days: 30 }, error: null },
    reviews_ledger: { data: { days: 30, written: [] }, error: null },
    reach_out_report: { data: { days: 90 }, error: null },
  });
  assert.deepEqual(await reportSeries(db, W, live(7)), { days: 7 });
  assert.deepEqual(await campaignSeries(db, W, live(30)), { days: 30 });
  assert.deepEqual(await reviewsLedger(db, W, live(30)), { days: 30, written: [] });
  assert.deepEqual(await reachOutReport(db, W, live(90)), { ok: true, data: { days: 90 } });
  assert.deepEqual(
    asked,
    [
      ["report_series", { p_tenant_id: W, p_days: 7 }],
      ["campaign_series", { p_tenant_id: W, p_days: 30 }],
      ["reviews_ledger", { p_tenant_id: W, p_days: 30 }],
      ["reach_out_report", { p_tenant_id: W, p_days: 90 }],
    ],
    "days that end today name no day: the call a database without 00359 has always answered",
  );
});

test("days that ended before today name their last day to every function, and nothing else changes in what is asked", async () => {
  const { db, asked } = dbWith({
    report_series: { data: { days: 20, end: "2026-09-20" }, error: null },
    campaign_series: { data: { days: 20 }, error: null },
    reviews_ledger: { data: { days: 20, written: [] }, error: null },
    reach_out_report: { data: { days: 20 }, error: null },
  });
  const window = ended(20, "2026-09-20");
  assert.deepEqual(await reportSeries(db, W, window), { days: 20, end: "2026-09-20" });
  assert.deepEqual(await campaignSeries(db, W, window), { days: 20 });
  assert.deepEqual(await reviewsLedger(db, W, window), { days: 20, written: [] });
  assert.deepEqual(await reachOutReport(db, W, window), { ok: true, data: { days: 20 } });
  const args = { p_tenant_id: W, p_days: 20, p_end: "2026-09-20" };
  assert.deepEqual(asked, [
    ["report_series", args],
    ["campaign_series", args],
    ["reviews_ledger", args],
    ["reach_out_report", args],
  ]);
});

test("a read that fails throws, never nothing; the reach-outs' refusal keeps the code the door words it by", async () => {
  const down = { data: null, error: { message: "connection refused", code: "08006" } };
  for (const window of [live(7), ended(7, "2026-09-20")]) {
    await assert.rejects(
      reportSeries(dbWith({ report_series: down }).db, W, window),
      /report_series.*connection refused/,
    );
    await assert.rejects(
      campaignSeries(dbWith({ campaign_series: down }).db, W, window),
      /campaign_series.*connection refused/,
    );
    await assert.rejects(
      reviewsLedger(dbWith({ reviews_ledger: down }).db, W, window),
      /reviews_ledger.*connection refused/,
    );
    const refused = { data: null, error: { message: "No workspace.", code: "P0002" } };
    assert.deepEqual(await reachOutReport(dbWith({ reach_out_report: refused }).db, W, window), {
      ok: false,
      code: "P0002",
      message: "No workspace.",
    });
  }
});

test("days that ended before today, on a database that cannot take a last day yet (00359 not applied), are said as that: never a failure in the database's words, and never some other days", async () => {
  const gone = "Could not find the function public.report_series(p_days, p_end, p_tenant_id) in the schema cache";
  const refusedWith = (code) => ({ data: null, error: { message: gone, code } });
  const window = ended(20, "2026-09-20");
  for (const code of ["PGRST202", "42883"]) {
    const refusal = refusedWith(code);
    const world = dbWith({ report_series: refusal, campaign_series: refusal, reach_out_report: refusal });
    for (const [door, read] of [
      ["report_series", reportSeries],
      ["campaign_series", campaignSeries],
      ["reach_out_report", reachOutReport],
    ])
      await assert.rejects(
        read(world.db, W, window),
        (e) => e instanceof ReportWindowNotReadable && e.message.startsWith(`${door}: `),
        `${door}, ${code}`,
      );
    assert.equal(world.asked.length, 3, "each was asked once, for the days picked, and for no others after");
    // The same refusal for days that end today is the database's own failure: its function is simply not there.
    await assert.rejects(
      reportSeries(dbWith({ report_series: refusal }).db, W, live(30)),
      (e) => !(e instanceof ReportWindowNotReadable) && /report_series: Could not find the function/.test(e.message),
      code,
    );
  }
  // Any other refusal of days that ended is what it always was.
  await assert.rejects(
    reportSeries(dbWith({ report_series: refusedWith("42501") }).db, W, window),
    (e) => !(e instanceof ReportWindowNotReadable) && /report_series: /.test(e.message),
  );
  assert.deepEqual(await reachOutReport(dbWith({ reach_out_report: refusedWith("22023") }).db, W, window), {
    ok: false,
    code: "22023",
    message: gone,
  });
});

test("a database that does not have the reviews' ledger yet (00350 not applied) answers null, and only that: any other refusal throws, and no other function is excused", async () => {
  const gone = "Could not find the function public.reviews_ledger(p_days, p_tenant_id) in the schema cache";
  const refusedWith = (code) => ({ data: null, error: { message: gone, code } });
  for (const code of ["PGRST202", "42883"]) {
    assert.equal(await reviewsLedger(dbWith({ reviews_ledger: refusedWith(code) }).db, W, live(30)), null, code);
    assert.equal(
      await reviewsLedger(dbWith({ reviews_ledger: refusedWith(code) }).db, W, ended(20, "2026-09-20")),
      null,
      `${code}: a database without 00359 has no ledger that takes a last day, and the lens draws the listing alone`,
    );
  }
  for (const code of ["42501", "08006", undefined])
    await assert.rejects(
      reviewsLedger(dbWith({ reviews_ledger: refusedWith(code) }).db, W, live(30)),
      /reviews_ledger: Could not find the function/,
      `${code}`,
    );
  await assert.rejects(
    reportSeries(dbWith({ report_series: refusedWith("PGRST202") }).db, W, live(30)),
    /report_series: Could not find the function/,
    "the series is the report's own: a database without it is a failure, not a lens that draws less",
  );
});

test("receptionistSeries asks receptionist_series for the window, naming the last day only when it is not today", async () => {
  const { db, asked } = dbWith({
    receptionist_series: { data: { days: 30 }, error: null },
  });
  assert.deepEqual(await receptionistSeries(db, W, live(30)), { days: 30 });
  await receptionistSeries(db, W, ended(20, "2026-09-20"));
  assert.deepEqual(asked, [
    ["receptionist_series", { p_tenant_id: W, p_days: 30 }],
    ["receptionist_series", { p_tenant_id: W, p_days: 20, p_end: "2026-09-20" }],
  ]);
});

test("receptionistSeries is null where the database does not have the function yet (00380 not applied), and throws for any other failure", async () => {
  const gone = "Could not find the function public.receptionist_series(p_days, p_tenant_id) in the schema cache";
  for (const code of ["PGRST202", "42883"]) {
    const missing = dbWith({ receptionist_series: { data: null, error: { message: gone, code } } }).db;
    assert.equal(await receptionistSeries(missing, W, live(30)), null, code);
    assert.equal(
      await receptionistSeries(missing, W, ended(20, "2026-09-20")),
      null,
      `${code}: a window that names a day too`,
    );
  }
  for (const code of ["XX000", "42501", "08006", undefined])
    for (const window of [live(30), ended(20, "2026-09-20")])
      await assert.rejects(
        receptionistSeries(
          dbWith({ receptionist_series: { data: null, error: { message: "boom", code } } }).db,
          W,
          window,
        ),
        /^Error: receptionist_series: boom$/,
        `${code}`,
      );
});

test("peopleSeries asks people_series for the window, naming the last day only when it is not today", async () => {
  const { db, asked } = dbWith({
    people_series: { data: { days: 30 }, error: null },
  });
  assert.deepEqual(await peopleSeries(db, W, live(30)), { days: 30 });
  await peopleSeries(db, W, ended(20, "2026-09-20"));
  assert.deepEqual(asked, [
    ["people_series", { p_tenant_id: W, p_days: 30 }],
    ["people_series", { p_tenant_id: W, p_days: 20, p_end: "2026-09-20" }],
  ]);
});

test("peopleSeries is null where the database does not have the function yet (00394 not applied), for a period and for picked days, and throws for any other failure", async () => {
  const gone = "Could not find the function public.people_series(p_days, p_tenant_id) in the schema cache";
  for (const code of ["PGRST202", "42883"]) {
    const missing = dbWith({ people_series: { data: null, error: { message: gone, code } } }).db;
    assert.equal(await peopleSeries(missing, W, live(30)), null, code);
    assert.equal(
      await peopleSeries(missing, W, ended(20, "2026-09-20")),
      null,
      `${code}: a window that names a day too`,
    );
  }
  for (const code of ["XX000", "42501", "08006", undefined])
    for (const window of [live(30), ended(20, "2026-09-20")])
      await assert.rejects(
        peopleSeries(dbWith({ people_series: { data: null, error: { message: "boom", code } } }).db, W, window),
        /^Error: people_series: boom$/,
        `${code}`,
      );
});

test("the counts' doors (00374, 00375) ask by name for the workspace, answer what the database says, answer 'missing' for a database without the function -- PostgREST's PGRST202, Postgres's 42883 -- so the dashboard reads the old way for one release, and throw every other failure", async () => {
  const { db, asked } = dbWith({
    playbook_totals: { data: { p1: {} }, error: null },
    run_counts: { data: {}, error: null },
    template_sends: { data: {}, error: null },
    reach_out_chain_totals: { data: {}, error: null },
  });
  assert.deepEqual(await playbookTotals(db, W, 10), { p1: {} });
  assert.deepEqual(await runCounts(db, W, ["b1", "b2"]), {});
  assert.deepEqual(await templateSends(db, W), {});
  assert.deepEqual(await reachOutChainTotals(db, W, live(30)), {});
  // The chains read the report's window: its last day named only where it ended before today (00360).
  assert.deepEqual(await reachOutChainTotals(db, W, ended(20, "2026-09-20")), {});
  assert.deepEqual(asked, [
    ["playbook_totals", { p_tenant_id: W, p_history: 10 }],
    ["run_counts", { p_tenant_id: W, p_run_ids: ["b1", "b2"] }],
    ["template_sends", { p_tenant_id: W }],
    ["reach_out_chain_totals", { p_tenant_id: W, p_days: 30 }],
    ["reach_out_chain_totals", { p_tenant_id: W, p_days: 20, p_end: "2026-09-20" }],
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
    assert.equal(await reachOutChainTotals(missing, W, live(30)), "missing", code);
    assert.equal(await reachOutChainTotals(missing, W, ended(20, "2026-09-20")), "missing", code);
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
  await assert.rejects(reachOutChainTotals(slow, W, live(30)), /reach_out_chain_totals: canceling statement/);
  // Each function answers one object (an empty one when nothing is counted), so any other answer is a read that failed,
  // never a value "missing" could be mistaken for.
  for (const odd of [null, [], "missing", 3]) {
    const strange = dbWith({ run_counts: { data: odd, error: null } }).db;
    await assert.rejects(runCounts(strange, W, []), /run_counts: answered no object/, JSON.stringify(odd));
  }
});
