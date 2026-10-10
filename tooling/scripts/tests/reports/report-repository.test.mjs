/**
 * The report functions as packages/db calls them (repositories/reports/report-series.ts): by name, for the workspace and the days,
 * over whatever client the caller holds (the session's, so RLS decides what a member reads). A read that fails throws;
 * the reach-outs' say the database's refusal with its code, for the door to word. The reviews' ledger (`reviews_ledger`)
 * is one of them: its counts, its window in the workspace's zone and who wrote each reply are SQL's, held by
 * google/google-reviews-ledger.db.test.mjs over a real database. It and the Receptionist lens's series
 * (`receptionist_series`, 00380) alone answer null where the database does not have their function yet (00350 and 00380
 * are applied after the dashboard deploys).
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
  reachOutReport,
  receptionistSeries,
  reportSeries,
  reviewsLedger,
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
