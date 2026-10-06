/**
 * The headline's override (surfaces/reports/headline.ts): one read of GET reports/headline for the period Reports shows,
 * published under `reports_headline` through the seam as contracts' view model; held by period, so a pick of a period this tab has
 * read paints at once; an answer for a period left is not painted; a read that fails fails the surface, never an empty line; and no
 * live-feed rule of its own (the brief's "copy the Reports surface's" would be inert: no route's own surface is this one). A period
 * pick (period.ts) paints what is held and reads behind it only when it must, and a pick that failed repaints the period kept.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_MS, headlineOf, toHeadlineVM } from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";
import { CALENDAR, reportDto } from "../_report-world.mjs";

installLegacyReact();
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const keepError = console.error;
console.error = () => {};
const { reportsHeadlineOverride, paintHeldHeadline, isHeadlineStale } = await importSrc(
  "apps/dashboard/src/surfaces/reports/headline.ts",
);
const { keepReportPeriod, shownReportPeriod } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { setReportRange } = await importSrc("apps/dashboard/src/surfaces/reports/period.ts");
const { surfaceValue, setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
console.error = keepError;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const asked = [];
let parked = null;
let refuse = null;
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const period = u.searchParams.get("period");
  const route = u.pathname.replace("/api/v1/", "");
  asked.push(`${route} ${period}`);
  if (/^reports\/(campaigns|reach-outs)$/.test(route))
    return json(500, { ok: false, error: { code: "internal", message: "no" } });
  if (route === "reports" && refuse === period)
    return json(500, { ok: false, error: { code: "internal", message: "down" } });
  if (parked && parked.period === period) await parked.until;
  if (route === "reports")
    return json(200, { ok: true, data: { report: reportDto(), booking: CALENDAR, deals: null } });
  return json(200, { ok: true, data: { headline: headlineOf(reportDto(), period, CALENDAR) } });
};
const settle = async () => {
  for (let i = 0; i < 12; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const headlineReads = () => asked.filter((a) => a.startsWith("reports/headline"));
let studios = 0;
const reset = (period) => {
  asked.length = 0;
  parked = null;
  refuse = null;
  // Each test is a workspace of its own: a headline is held by the address's workspace (held-views.ts), and the seven days
  // the "held by period" test reads must not be held when the pick test says seven days was never read.
  globalThis.location.pathname = `/w/studio-${(studios += 1)}`;
  keepReportPeriod(period);
  setSurfaceValue("reports_headline", undefined);
};

test("one read of the headline for the period Reports shows, published as contracts' view model under its own key", async () => {
  reset("30d");
  await reportsHeadlineOverride.apply();
  assert.deepEqual(asked, ["reports/headline 30d"], "one request, for the shown period");
  assert.deepEqual(surfaceValue("reports_headline"), toHeadlineVM(headlineOf(reportDto(), "30d", CALENDAR)));
  assert.equal(reportsHeadlineOverride.key, "reports_headline");
  assert.equal(reportsHeadlineOverride.value, "reports_headline", "the cache keeps it beside the surface's snapshot");
  assert.deepEqual(reportsHeadlineOverride.events, ["surface:reports_headline"]);
  assert.equal(
    reportsHeadlineOverride.view(),
    "30d",
    "reads of one period take their turn, a pick of another starts at once",
  );
  assert.equal(
    Object.keys(globalThis.window).filter((k) => /HEADLINE/i.test(k)).length,
    0,
    "published through the seam alone: no mirror on window",
  );
});

test("it has no live-feed rule: a message moves a count by one in a hundred and the read reaches for the people pool and the calendar", () => {
  assert.equal(reportsHeadlineOverride.refreshOnMessageInserts, undefined);
  assert.equal(reportsHeadlineOverride.refreshOnTables, undefined);
  assert.equal(reportsHeadlineOverride.refreshWhen, undefined);
});

test("held by period: a period read is painted at once when picked again, one never read is not, and the answer for a period left is not painted", async () => {
  reset("30d");
  await reportsHeadlineOverride.apply();
  keepReportPeriod("7d");
  assert.equal(paintHeldHeadline(), false, "seven days was never read: nothing to paint");
  assert.equal(surfaceValue("reports_headline").period, "30d", "and what was shown stays");
  await reportsHeadlineOverride.apply();
  assert.equal(surfaceValue("reports_headline").period, "7d");
  keepReportPeriod("30d");
  assert.equal(paintHeldHeadline(), true, "thirty days was read: painted before any read of it");
  assert.equal(surfaceValue("reports_headline").period, "30d");
  assert.equal(shownReportPeriod(), "30d");
  // A slow read of 30 lands after the pick of 7: its answer is for a period left and never lands on the new one.
  let release = () => {};
  parked = { period: "30d", until: new Promise((r) => (release = r)) };
  const slow = reportsHeadlineOverride.apply();
  keepReportPeriod("7d");
  await reportsHeadlineOverride.apply();
  release();
  await slow;
  assert.equal(
    surfaceValue("reports_headline").period,
    "7d",
    "REGRESSION: a late answer put the old period over the new one",
  );
});

test("a read that fails fails the surface: the shell says so where the line would be, never a line about nobody", async () => {
  reset("30d");
  const was = globalThis.window.fetch;
  globalThis.window.fetch = async () => json(500, { ok: false, error: { code: "internal", message: "down" } });
  try {
    await assert.rejects(
      () => reportsHeadlineOverride.apply(),
      (e) => e && e.code === "internal",
    );
    assert.equal(surfaceValue("reports_headline"), undefined);
  } finally {
    globalThis.window.fetch = was;
  }
});

test("a period pick paints the held headline and reads behind it only when none is held or the held one is old; a pick that fails repaints the period kept", async () => {
  const stop = startSurfaces([], () => () => {});
  const realNow = Date.now;
  try {
    reset("30d");
    await reportsHeadlineOverride.apply();
    assert.equal(isHeadlineStale(), false, "just read");
    asked.length = 0;

    // Seven days, never read: nothing to paint, so it is read behind the pick, and the value that lands is the seven days'.
    await setReportRange("7d");
    await settle();
    assert.deepEqual(headlineReads(), ["reports/headline 7d"], "one read of the headline, for the period picked");
    assert.equal(
      surfaceValue("reports_headline").period,
      "7d",
      "REGRESSION: the headline stayed on the period before the pick",
    );

    // Back to thirty days, which is held and fresh: painted at once, and not read again (the pick was doubling the read).
    asked.length = 0;
    await setReportRange("30d");
    await settle();
    assert.equal(surfaceValue("reports_headline").period, "30d", "painted from what is held");
    assert.deepEqual(headlineReads(), [], "REGRESSION: a held, fresh headline was read again on every pick");

    // A held headline read longer ago than HEADLINE_STALE_MS is painted and read behind.
    Date.now = () => realNow() + 10 * MIN_MS; // past the few minutes a held headline stays fresh
    assert.equal(isHeadlineStale(), true);
    asked.length = 0;
    await setReportRange("7d");
    await settle();
    assert.equal(surfaceValue("reports_headline").period, "7d", "painted at once");
    assert.deepEqual(headlineReads(), ["reports/headline 7d"], "and read behind, being old");
    Date.now = realNow;

    // A pick whose own read fails is taken back: the headline Today says is the period Reports kept, not the one that failed.
    await setReportRange("30d");
    await settle();
    asked.length = 0;
    refuse = "90d";
    const ok = await setReportRange("90d");
    await settle();
    assert.equal(ok, false, "the pick failed");
    assert.equal(shownReportPeriod(), "30d", "the period goes back");
    assert.equal(
      surfaceValue("reports_headline").period,
      "30d",
      "REGRESSION: Today kept saying 90 days after the pick that failed, while the page said thirty",
    );
  } finally {
    Date.now = realNow;
    stop();
  }
});
