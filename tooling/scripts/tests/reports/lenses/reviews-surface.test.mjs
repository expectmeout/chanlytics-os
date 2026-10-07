/**
 * The Reviews override (surfaces/reports/reviews-surface.ts): one read of GET reports/reviews for the period Reports shows, folded
 * once into contracts' view model and published under `reports_reviews` through the seam beside the answer, the period and when it
 * was read; held by period, so a pick of a period this tab has read paints at once; an answer for a period left is held and never
 * painted over the new one; a read that fails fails the surface. Its live-feed rule is the lens's own: the tables the feed tells a
 * workspace of that move it, heard while the lens is on screen. A period pick (period.ts) paints what is held wherever it was made,
 * and reads behind it only while the lens is on screen and only when it must; a pick that failed repaints the period kept. EXECUTED
 * on the real modules over the world's Harbor Studio, as the headline's own test is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_MS, toReviewsReportVM } from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";
import { CALENDAR, reportDto, reviewsDto } from "../_report-world.mjs";

installLegacyReact();
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const keepError = console.error;
console.error = () => {};
const { reviewsOverride, paintHeldReviews, isReviewsStale } = await importSrc(
  "apps/dashboard/src/surfaces/reports/reviews-surface.ts",
);
const { keepReportPeriod, shownReportPeriod } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { setReportRange } = await importSrc("apps/dashboard/src/surfaces/reports/period.ts");
const { surfaceValue, setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
console.error = keepError;

const DAYS = { "7d": 7, "30d": 30, "90d": 90 };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const asked = [];
let parked = null;
let refuse = null;
let refuseReviews = false;
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const period = u.searchParams.get("period");
  const route = u.pathname.replace("/api/v1/", "");
  asked.push(`${route} ${period}`);
  if (/^reports\/(campaigns|reach-outs)$/.test(route))
    return json(500, { ok: false, error: { code: "internal", message: "no" } });
  if (parked && parked.route === route && parked.period === period) await parked.until;
  if (route === "reports" && refuse === period)
    return json(500, { ok: false, error: { code: "internal", message: "down" } });
  if (route === "reports")
    return json(200, { ok: true, data: { report: reportDto(), booking: CALENDAR, deals: null } });
  if (refuseReviews) return json(500, { ok: false, error: { code: "internal", message: "down" } });
  return json(200, { ok: true, data: reviewsDto({ days: DAYS[period] }) });
};
const settle = async () => {
  for (let i = 0; i < 12; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const reviewReads = () => asked.filter((a) => a.startsWith("reports/reviews"));
const onLens = () => {
  globalThis.location.hash = "#/reports/reviews";
};
const elsewhere = (route = "reports/people") => {
  globalThis.location.hash = `#/${route}`;
};
let studios = 0;
const reset = (period) => {
  asked.length = 0;
  parked = null;
  refuse = null;
  refuseReviews = false;
  // Each test is a workspace of its own: a read is held by the address's workspace (held-views.ts), and the periods one test reads
  // must not be held when another says they were never read.
  globalThis.location.pathname = `/w/studio-${(studios += 1)}`;
  elsewhere("reports");
  keepReportPeriod(period);
  setSurfaceValue("reports_reviews", undefined);
};

test("one read of the reviews for the period Reports shows, folded once and published under its own key with the period and when it was read", async () => {
  reset("30d");
  const before = Date.now();
  await reviewsOverride.apply();
  assert.deepEqual(asked, ["reports/reviews 30d"], "one request, for the shown period");
  const held = surfaceValue("reports_reviews");
  assert.deepEqual(held.dto, reviewsDto({ days: 30 }), "what the route answered, as it answered it");
  assert.equal(held.period, "30d");
  assert.ok(held.fetchedAt >= before && held.fetchedAt <= Date.now(), "when it was read");
  assert.deepEqual(
    held.vm,
    toReviewsReportVM(held.dto, { nowMs: held.fetchedAt }),
    "folded once, by contracts' own function, over the days the answer says",
  );
  assert.equal(typeof held.vm.lines.head, "string", "and the head's sentence is that fold's, not the page's");
  assert.equal(reviewsOverride.key, "reports_reviews");
  assert.equal(reviewsOverride.value, "reports_reviews", "the cache keeps it beside the surface's snapshot");
  assert.deepEqual(reviewsOverride.events, ["surface:reports_reviews"]);
  assert.equal(reviewsOverride.view(), "30d", "reads of one period take their turn, a pick of another starts at once");
  assert.equal(
    Object.keys(globalThis.window).filter((k) => /REVIEWS/i.test(k)).length,
    0,
    "published through the seam alone: no mirror on window",
  );
});

test("the days of the fold are the answer's own: seven days is read and folded as seven", async () => {
  reset("7d");
  await reviewsOverride.apply();
  assert.deepEqual(asked, ["reports/reviews 7d"]);
  const held = surfaceValue("reports_reviews");
  assert.equal(held.period, "7d");
  assert.equal(held.dto.days, 7);
  assert.equal(held.vm.days, 7);
});

test("held by period: a period read is painted at once when picked again, one never read is not, and the answer for a period left is held and not painted", async () => {
  reset("30d");
  await reviewsOverride.apply();
  keepReportPeriod("7d");
  assert.equal(paintHeldReviews(), false, "seven days was never read: nothing to paint");
  assert.equal(surfaceValue("reports_reviews").period, "30d", "and what was shown stays");
  await reviewsOverride.apply();
  assert.equal(surfaceValue("reports_reviews").period, "7d");
  keepReportPeriod("30d");
  assert.equal(paintHeldReviews(), true, "thirty days was read: painted before any read of it");
  assert.equal(surfaceValue("reports_reviews").period, "30d");
  assert.equal(shownReportPeriod(), "30d");
  // A slow read of 90 lands after the pick of 7: its answer is for a period left and never lands on the new one.
  keepReportPeriod("90d");
  let release = () => {};
  parked = { route: "reports/reviews", period: "90d", until: new Promise((r) => (release = r)) };
  const slow = reviewsOverride.apply();
  keepReportPeriod("7d");
  await reviewsOverride.apply();
  release();
  await slow;
  assert.equal(
    surfaceValue("reports_reviews").period,
    "7d",
    "REGRESSION: a late answer put the old period over the new one",
  );
  // The read was made, and a pick back to its period, which nothing else read, paints it.
  keepReportPeriod("90d");
  assert.equal(paintHeldReviews(), true, "the late answer was held for the period it is of");
  assert.equal(surfaceValue("reports_reviews").period, "90d");
});

test("a read that fails fails the surface: the lens says so, never a count of nothing", async () => {
  reset("30d");
  refuseReviews = true;
  const was = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      () => reviewsOverride.apply(),
      (e) => e && e.code === "internal",
    );
  } finally {
    console.error = was;
  }
  assert.equal(surfaceValue("reports_reviews"), undefined);
  assert.equal(isReviewsStale(), true, "and nothing is held for the period");
});

test("a read held for the period shown is stale only once it has aged: five minutes", async () => {
  reset("30d");
  assert.equal(isReviewsStale(), true, "never read");
  await reviewsOverride.apply();
  assert.equal(isReviewsStale(), false, "just read");
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 4 * MIN_MS;
    assert.equal(isReviewsStale(), false, "four minutes on");
    Date.now = () => realNow() + 6 * MIN_MS;
    assert.equal(isReviewsStale(), true, "six minutes on: read again as the lens comes back");
  } finally {
    Date.now = realNow;
  }
  keepReportPeriod("7d");
  assert.equal(isReviewsStale(), true, "a read held for another period is not the period shown's");
});

test("its live-feed rule is the lens's own: the listing's three tables, heard while the lens is on screen and left for it otherwise", () => {
  reset("30d");
  assert.deepEqual(reviewsOverride.refreshOnTables, ["google_reviews", "google_listings", "google_connections"]);
  assert.equal(reviewsOverride.refreshOnMessageInserts, undefined, "a message is no review");
  onLens();
  for (const table of reviewsOverride.refreshOnTables)
    assert.equal(reviewsOverride.refreshWhen({ table, event: "INSERT", row: {} }), true, `${table}: the lens is open`);
  for (const route of ["reports", "reports/people", "reports/campaigns", "today"]) {
    elsewhere(route);
    for (const table of reviewsOverride.refreshOnTables)
      assert.equal(
        reviewsOverride.refreshWhen({ table, event: "INSERT", row: {} }),
        false,
        `${table} on ${route}: kept for the lens`,
      );
  }
});

test("a period pick on the lens paints the held read and reads behind it only when none is held or the held one is old", async () => {
  const stop = startSurfaces([], () => () => {});
  const realNow = Date.now;
  try {
    reset("30d");
    onLens();
    await reviewsOverride.apply();
    await setReportRange("30d");
    asked.length = 0;

    // Seven days, never read: nothing to paint, so it is read behind the pick, and what lands is the seven days'.
    await setReportRange("7d");
    await settle();
    assert.deepEqual(reviewReads(), ["reports/reviews 7d"], "one read of the lens, for the period picked");
    assert.equal(
      surfaceValue("reports_reviews").period,
      "7d",
      "REGRESSION: the lens stayed on the period before the pick",
    );

    // Back to thirty days, which is held and fresh: painted at once, and not read again.
    asked.length = 0;
    await setReportRange("30d");
    await settle();
    assert.equal(surfaceValue("reports_reviews").period, "30d", "painted from what is held");
    assert.deepEqual(reviewReads(), [], "REGRESSION: a held, fresh read was made again on every pick");

    // A held read made longer ago than the lens keeps it is painted and read behind.
    Date.now = () => realNow() + 10 * MIN_MS;
    asked.length = 0;
    await setReportRange("7d");
    await settle();
    assert.equal(surfaceValue("reports_reviews").period, "7d", "painted at once");
    assert.deepEqual(reviewReads(), ["reports/reviews 7d"], "and read behind, being old");
  } finally {
    Date.now = realNow;
    stop();
  }
});

test("a period pick made anywhere but on the lens reads nothing of it: a held period is painted, and a period never read is left to the lens", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    onLens();
    await reviewsOverride.apply();
    for (const route of ["reports", "reports/people", "reports/campaigns"]) {
      elsewhere(route);
      asked.length = 0;
      await setReportRange("7d");
      await settle();
      assert.deepEqual(reviewReads(), [], `${route}: the lens is not on screen`);
      assert.equal(
        surfaceValue("reports_reviews").period,
        "30d",
        `${route}: and nothing of seven days is held to paint`,
      );
      assert.equal(isReviewsStale(), true, `${route}: so the lens reads it as it comes on screen (readWhatWasMissed)`);
      asked.length = 0;
      await setReportRange("30d");
      await settle();
      assert.deepEqual(reviewReads(), [], `${route}: held and fresh`);
      assert.equal(surfaceValue("reports_reviews").period, "30d");
    }
  } finally {
    stop();
  }
});

test("a pick that fails repaints the period kept on the lens: what it read for the period that failed may have landed behind the pick", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    onLens();
    await reviewsOverride.apply();
    await setReportRange("30d");
    await settle();
    asked.length = 0;
    // The pick's read of the report is slow and fails; the lens's own read of ninety days lands first, and is painted.
    let release = () => {};
    parked = { route: "reports", period: "90d", until: new Promise((r) => (release = r)) };
    refuse = "90d";
    const pick = setReportRange("90d");
    await settle();
    assert.equal(surfaceValue("reports_reviews").period, "90d", "the lens read what was picked, and painted it");
    release();
    const ok = await pick;
    await settle();
    assert.equal(ok, false, "the pick failed");
    assert.equal(shownReportPeriod(), "30d", "the period goes back");
    assert.equal(
      surfaceValue("reports_reviews").period,
      "30d",
      "REGRESSION: the lens kept saying ninety days after the pick that failed, while the page said thirty",
    );
  } finally {
    stop();
  }
});
