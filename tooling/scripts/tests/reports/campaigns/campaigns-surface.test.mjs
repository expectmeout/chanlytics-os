/**
 * The Campaigns lens's override (surfaces/reports/campaigns-surface.ts) and the helper it shares with Today's headline and the other
 * lenses (surfaces/reports/period-surface.ts): three reads for the range Reports shows (GET reports/campaigns, the sends' own
 * report; GET reports/campaigns/ledger, the window beyond the sends' counts and what is stuck; GET reports/reach-outs, its `report`
 * half), published under `reports_campaigns` through the seam as each route gave it (unfolded: the page folds them, so the fold never
 * rides the route's chunk) with the range they are of; held by period, so a pick of a period this tab has read paints at once; an
 * answer for a period left is held and never painted over the new one. EACH READ FAILS ALONE: a read that fails is null in the value,
 * is logged by its own name and the others stand, and all three failing is three nulls, a value held and not a failed surface.
 * Its live-feed rule is the lens's own: the messages, conversations, escalations and runs the feed tells a workspace of, heard on
 * the Campaigns lens alone (the Overview, which draws the surface for one fact, reads it as it comes on screen and again when it has
 * aged, never for each burst, and keeps a burst for the lens), a burst of them read once, three seconds after the first (the wait asked is five and the runner allows
 * three at most). A period pick (period.ts) paints what is held wherever it was made, and reads behind it only where the surface is
 * drawn and only when it must; a pick that failed says the period kept, by one rule for all the reads that follow the period; a
 * write that makes the read wrong forgets it. Every behaviour the reads share runs through this one. EXECUTED on the real modules
 * over the world's Harbor Studio, as the People lens's own test is.
 *
 * What the lens follows is a range: a period by name, or the days a member picked, which the address says. Over days it is read by
 * their first and last day and held under their one name; Today's line keeps following the period.
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { MIN_MS, headlineOf, reportDaysCount } from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";
import { CALENDAR, reportDto } from "../_report-world.mjs";
import { CAMPAIGNS, dtoWith } from "./_campaign-world.mjs";

installLegacyReact();
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
// On screen: a hidden page reads, of what the feed tells, only what says itself in the tab's title and badge, and holds the
// rest until it is in front (shell/feed/the-runner-heals.test.mjs).
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
// The shell's way of moving, as far as a pick needs it: the address says the route it was sent to.
globalThis.window.CHANLY = {
  ...(globalThis.window.CHANLY ?? {}),
  nav: (route) => {
    globalThis.location.hash = `#/${route}`;
  },
};
const keepError = console.error;
console.error = () => {};
const { reportsCampaigns, reportsCampaignsOverride } = await importSrc(
  "apps/dashboard/src/surfaces/reports/campaigns-surface.ts",
);
const { headline, reportsHeadlineOverride } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");
const { keepReportPeriod, shownReportPeriod, reportsOverride } = await importSrc(
  "apps/dashboard/src/surfaces/reports/surface.ts",
);
const { setReportRange } = await importSrc("apps/dashboard/src/surfaces/reports/period.ts");
const { surfaceValue, setSurfaceValue, followState } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { setStatus } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const { readWhatWasMissed } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
console.error = keepError;

const DAYS = { "7d": 7, "30d": 30, "90d": 90 };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const down = () => json(500, { ok: false, error: { code: "internal", message: "down" } });

/** A report of what the reach-outs wrote, of the days a read named (contracts ReachOutReportDto): 12 emails to 9 businesses. */
const reachOutReport = (over) => ({
  timezone: "America/New_York",
  days: over.days,
  today: "2026-09-04",
  ...(over.end === undefined ? {} : { end: over.end }),
  since: "2026-08-06",
  has_reach_out: true,
  totals: {
    written: 12,
    delivered: 11,
    bounced: 1,
    businesses: 9,
    wrote_back: 3,
    interested: 2,
    booked: 1,
    said_no: 1,
    handed: 0,
  },
  series: [{ day: "2026-09-02", written: 12 }],
  chains: [],
  angles: [],
  other_angles: { written: 0, businesses: 0, wrote_back: 0 },
  no_angle: 12,
  mailboxes: [],
});
/** What the three routes answer for the days a read named: the sends' report, the ledger and the reach-outs, in the shape of each route. */
const campaignsFor = (over) => {
  const end = over.end === undefined ? {} : { end: over.end };
  return { ...CAMPAIGNS, days: over.days, ...end };
};
const ledgerFor = (over) => {
  const end = over.end === undefined ? {} : { end: over.end };
  return { ...dtoWith(), days: over.days, ...end };
};
const CHAINS = { complete: true, by_root: { "step-1": { written: 12, businesses: 9, wrote_back: 3 } } };
const reachOutsFor = (over) => ({ report: reachOutReport(over), chains: CHAINS });

const asked = [];
const unexpected = [];
let parked = null;
let refuse = null;
/** The lens's reads that are down, by the route each answers: `campaigns`, `campaigns/ledger`, `reach-outs`. */
const failing = new Set();
/** Each route answers with its own shape: a read sent to the wrong route is a 404 and a failure of the test, never an answer that fits. */
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  // What a read names: a period, or the first and the last of the days picked, said here by the range's one name.
  const days = u.searchParams.has("from") ? { from: u.searchParams.get("from"), to: u.searchParams.get("to") } : null;
  const period = days ? `${days.from}~${days.to}` : u.searchParams.get("period");
  const route = u.pathname.replace("/api/v1/", "");
  asked.push(period ? `${route} ${period}` : route);
  if (parked && parked.route === route && parked.period === period) await parked.until;
  if (route === "reports") {
    if (refuse === period) return down();
    return json(200, { ok: true, data: { report: reportDto(), booking: CALENDAR, deals: null } });
  }
  if (route === "reports/headline")
    return json(200, { ok: true, data: { headline: headlineOf(reportDto(), period, CALENDAR) } });
  const over = days ? { days: reportDaysCount(days), end: days.to } : { days: DAYS[period] };
  if (/^reports\/(campaigns|campaigns\/ledger|reach-outs)$/.test(route)) {
    if (failing.has(route.replace("reports/", ""))) return down();
    if (route === "reports/campaigns") return json(200, { ok: true, data: { report: campaignsFor(over) } });
    if (route === "reports/campaigns/ledger") return json(200, { ok: true, data: ledgerFor(over) });
    return json(200, { ok: true, data: reachOutsFor(over) });
  }
  unexpected.push(route);
  return json(404, { ok: false, error: { code: "not_found", message: "no" } });
};
afterEach(() => {
  assert.deepEqual(unexpected.splice(0), [], "a read went to a route nothing here answers");
});
const settle = async () => {
  for (let i = 0; i < 12; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const LENS_ROUTES = ["reports/campaigns", "reports/campaigns/ledger", "reports/reach-outs"];
/** The three reads for a range, in the order the surface asks them. */
const threeFor = (range) => LENS_ROUTES.map((r) => `${r} ${range}`);
/**
 * The lens's reads among what was asked, told by the one route only the lens asks: the ledger (the sends' report and the
 * reach-outs' are routes the frame's own report has read too). A lens read is one entry, for the range it was made for.
 */
const lensReads = () => asked.filter((a) => a.startsWith("reports/campaigns/ledger "));
const ledgerRead = (range) => `reports/campaigns/ledger ${range}`;
const headlineReads = () => asked.filter((a) => a.startsWith("reports/headline"));
const onLens = () => {
  globalThis.location.hash = "#/reports/campaigns";
};
const elsewhere = (route = "reports/receptionist") => {
  globalThis.location.hash = `#/${route}`;
};
let studios = 0;
const reset = (period) => {
  asked.length = 0;
  parked = null;
  refuse = null;
  failing.clear();
  // Each test is a workspace of its own: a read is held by the address's workspace (held-views.ts), and the periods one test reads
  // must not be held when another says they were never read.
  globalThis.location.pathname = `/w/studio-${(studios += 1)}`;
  elsewhere("reports");
  keepReportPeriod(period);
  for (const key of ["reports_campaigns", "reports_headline"]) setSurfaceValue(key, undefined);
};
/** The reads that follow the period, each by the key it publishes under: the helper's users. */
const USERS = [
  ["the headline", headline, "reports_headline", "reports/headline"],
  ["the Campaigns read", reportsCampaigns, "reports_campaigns", "reports/campaigns"],
];
/**
 * What a published read is of: the headline says its period, and the Campaigns read its range's one name, which for a period is
 * the period's own (`30d`) and for days a member picked their days (`2026-09-01~2026-09-20`).
 */
const of = (key) => {
  const held = surfaceValue(key);
  return held === undefined ? undefined : (held.key ?? held.period);
};
/** What Reports shows, as its own surface publishes it: a period by name, here. */
const showing = (period) =>
  setSurfaceValue("reports", { ...(surfaceValue("reports") ?? {}), period, range: period, key: period });
/** Run `fn` with the page's `console.error` recorded: every call's arguments. */
const logged = async (fn) => {
  const was = console.error;
  const lines = [];
  console.error = (...args) => void lines.push(args);
  try {
    await fn();
  } finally {
    console.error = was;
  }
  return lines;
};

test("three reads for the range Reports shows, published as each route gave them with the range they are of, and nothing else", async () => {
  reset("30d");
  await reportsCampaignsOverride.apply();
  assert.deepEqual(
    [...asked].sort(),
    threeFor("30d").sort(),
    "one request to each of the three routes, for the shown period: { period }",
  );
  const held = surfaceValue("reports_campaigns");
  assert.deepEqual(
    Object.keys(held).sort(),
    ["campaigns", "key", "ledger", "reachOuts"],
    "the three answers and the range they are of: no view model, the page folds them",
  );
  assert.equal(held.key, "30d");
  assert.deepEqual(held.campaigns, campaignsFor({ days: 30 }), "the sends' report as its route gave it, unfolded");
  assert.deepEqual(held.ledger, ledgerFor({ days: 30 }), "the ledger as its route gave it");
  assert.deepEqual(
    held.reachOuts,
    reachOutsFor({ days: 30 }).report,
    "the reach-outs' `report`: the route's chains are dropped",
  );
  assert.equal("chains" in held, false, "the route's totals by chain are nobody's here");
  assert.equal(reportsCampaignsOverride.key, "reports_campaigns");
  assert.equal(reportsCampaignsOverride.value, "reports_campaigns", "the cache keeps it beside the surface's snapshot");
  assert.deepEqual(reportsCampaignsOverride.events, ["surface:reports_campaigns"]);
  assert.equal(reportsCampaignsOverride.onDemand, true, "read where the lens is drawn and nowhere else");
  assert.equal(typeof reportsCampaignsOverride.isStale, "function", "a read of it ages: the lens that draws it asks");
  assert.equal(
    reportsCampaignsOverride.view(),
    "30d",
    "reads of one period take their turn, a pick of another starts at once",
  );
  assert.equal(reportsCampaigns.override, reportsCampaignsOverride, "the override is the helper's own");
  assert.equal(
    Object.keys(globalThis.window).filter((k) => /REPORTS_?CAMPAIGNS/i.test(k)).length,
    0,
    "published through the seam alone: no mirror on window",
  );
});

test("the range asked is the period's own or the first and last of the days picked, of all three reads, and what is published is of the range asked", async () => {
  reset("7d");
  await reportsCampaignsOverride.apply();
  assert.deepEqual([...asked].sort(), threeFor("7d").sort(), "{ period: '7d' } for each");
  assert.equal(surfaceValue("reports_campaigns").key, "7d");
  assert.equal(surfaceValue("reports_campaigns").campaigns.days, 7);
  assert.equal(surfaceValue("reports_campaigns").ledger.days, 7);
  assert.equal(surfaceValue("reports_campaigns").reachOuts.days, 7);

  reset("30d");
  elsewhere("reports/campaigns:2026-09-01~2026-09-20");
  await reportsCampaignsOverride.apply();
  assert.deepEqual([...asked].sort(), threeFor("2026-09-01~2026-09-20").sort(), "{ from, to } for each");
  const held = surfaceValue("reports_campaigns");
  assert.equal(held.key, "2026-09-01~2026-09-20", "named by the days' one key");
  assert.deepEqual(held.campaigns, campaignsFor({ days: 20, end: "2026-09-20" }));
  assert.deepEqual(held.ledger, ledgerFor({ days: 20, end: "2026-09-20" }));
  assert.deepEqual(held.reachOuts, reachOutsFor({ days: 20, end: "2026-09-20" }).report);
});

for (const [name, follower, key, route] of USERS) {
  test(`${name}: held by period, a period read is painted at once when picked again, one never read is not, and the answer for a period left is held and not painted`, async () => {
    reset("30d");
    await follower.override.apply();
    keepReportPeriod("7d");
    assert.equal(follower.paintHeld(), false, "seven days was never read: nothing to paint");
    assert.equal(of(key), "30d", "and what was shown stays");
    await follower.override.apply();
    assert.equal(of(key), "7d");
    keepReportPeriod("30d");
    assert.equal(follower.paintHeld(), true, "thirty days was read: painted before any read of it");
    assert.equal(of(key), "30d");
    assert.equal(shownReportPeriod(), "30d");
    // A slow read of 90 lands after the pick of 7: its answer is for a period left and never lands on the new one.
    keepReportPeriod("90d");
    let release = () => {};
    parked = { route, period: "90d", until: new Promise((r) => (release = r)) };
    const slow = follower.override.apply();
    keepReportPeriod("7d");
    await follower.override.apply();
    release();
    await slow;
    assert.equal(of(key), "7d", "REGRESSION: a late answer put the old period over the new one");
    // The read was made, and a pick back to its period, which nothing else read, paints it.
    keepReportPeriod("90d");
    assert.equal(follower.paintHeld(), true, "the late answer was held for the period it is of");
    assert.equal(of(key), "90d");
  });

  test(`${name}: stale only once it has aged, five minutes after it was read, and for any period it holds none of`, async () => {
    reset("30d");
    assert.equal(follower.isStale(), true, "never read");
    await follower.override.apply();
    assert.equal(follower.isStale(), false, "just read");
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 4 * MIN_MS;
      assert.equal(follower.isStale(), false, "four minutes on");
      Date.now = () => realNow() + 6 * MIN_MS;
      assert.equal(follower.isStale(), true, "six minutes on: read again as its page comes back");
    } finally {
      Date.now = realNow;
    }
    keepReportPeriod("7d");
    assert.equal(follower.isStale(), true, "a read held for another period is not the period shown's");
  });

  test(`${name}: after a pick that failed, the period kept is the one painted, and where none is held for it nothing of the period the page left`, async () => {
    reset("30d");
    await follower.override.apply();
    // Thirty days is held, and the pick of ninety landed behind it: the pick failed, and the page says thirty days.
    keepReportPeriod("90d");
    await follower.override.apply();
    assert.equal(of(key), "90d");
    keepReportPeriod("30d");
    follower.paintKept();
    assert.equal(of(key), "30d", "the held read of the period kept is painted");
    // A tab that holds none of it, whose value is of another period (what a pick left behind it): nothing is said of that one.
    follower.forget();
    keepReportPeriod("90d");
    await follower.override.apply();
    keepReportPeriod("7d");
    follower.paintKept();
    assert.equal(surfaceValue(key), undefined, "REGRESSION: a period the page left was said under the one it kept");
    // A value of the period kept that this tab holds no read of (the cache restored it) stands.
    await follower.override.apply();
    const restored = surfaceValue(key);
    follower.forget();
    setSurfaceValue(key, restored);
    follower.paintKept();
    assert.equal(surfaceValue(key), restored, "a value of the period kept is not taken away for want of a held read");
  });

  test(`${name}: a write that makes it wrong forgets it: nothing is held, nothing is published, and a read that was out before the write is not kept past it`, async () => {
    reset("30d");
    await follower.override.apply();
    assert.equal(follower.isStale(), false);
    follower.forget();
    assert.equal(surfaceValue(key), undefined, "nothing is published of what the write made wrong");
    assert.equal(follower.isStale(), true, "nothing is held, so its page reads it as it comes on screen");
    keepReportPeriod("30d");
    assert.equal(follower.paintHeld(), false, "and a pick back to the period paints nothing");
    // A read that went out before the write answers its own pass, and is not kept past it.
    let release = () => {};
    parked = { route, period: "30d", until: new Promise((r) => (release = r)) };
    const before = follower.override.apply();
    follower.forget();
    release();
    await before;
    assert.equal(follower.isStale(), true, "REGRESSION: a read from before the write was held as if it came after");
  });
}

test("how the Campaigns read stands against the period shown: current, coming while a pick's read is out, failed when it could not be made", async () => {
  reset("30d");
  assert.equal(followState("reports_campaigns"), "coming", "nothing read yet");
  await reportsCampaignsOverride.apply();
  assert.equal(followState("reports_campaigns"), "current", "of the period shown");
  keepReportPeriod("7d");
  assert.equal(
    followState("reports_campaigns"),
    "coming",
    "a pick is made and its read is out: what is held is of the period left",
  );
  setStatus("reports_campaigns", "degraded");
  assert.equal(
    followState("reports_campaigns"),
    "failed",
    "a read that landed once, and whose latest could not be made",
  );
  setStatus("reports_campaigns", "live");
  assert.equal(followState("reports_campaigns"), "coming", "read again, the status is live and the read is out");
  await reportsCampaignsOverride.apply();
  keepReportPeriod("7d");
  assert.equal(followState("reports_campaigns"), "current");
  assert.equal(followState("reports_headline"), "coming", "each read stands on its own value");
  assert.equal(followState("setup"), "coming", "a surface that follows nothing is coming until it holds a value");
});

const READS = [
  ["the sends' report", "campaigns", "campaigns", "reports_campaigns_fetch_failed"],
  ["the ledger", "campaigns/ledger", "ledger", "reports_campaigns_ledger_fetch_failed"],
  ["the reach-outs' report", "reach-outs", "reachOuts", "reports_campaigns_reach_outs_fetch_failed"],
];

for (const [name, route, field, event] of READS) {
  test(`each read fails alone: ${name} down is null in the value and logged by its own name, and the other two stand as their routes gave them`, async () => {
    reset("30d");
    failing.add(route);
    const lines = await logged(() => reportsCampaignsOverride.apply());
    const held = surfaceValue("reports_campaigns");
    assert.notEqual(held, undefined, "a value is published: a read that failed is not a failed surface");
    assert.equal(held[field], null, `${name}: null where it failed`);
    assert.deepEqual(
      lines.map((l) => l[0]),
      [event],
      "and its own name is the one line logged",
    );
    assert.equal(lines[0][1], "down", "with what the route said");
    const stands = {
      campaigns: campaignsFor({ days: 30 }),
      ledger: ledgerFor({ days: 30 }),
      reachOuts: reachOutsFor({ days: 30 }).report,
    };
    for (const other of Object.keys(stands).filter((f) => f !== field))
      assert.deepEqual(held[other], stands[other], `${other} stands`);
    assert.equal(held.key, "30d");
    assert.equal(followState("reports_campaigns"), "current", "the lens draws what stands, of the period shown");
    assert.equal(reportsCampaigns.isStale(), false, "and it is held, not read again for want of one read");
  });
}

test("all three reads failing is three nulls in a value that is held, not a failed surface: the page says what failed, and each Retry reads them again", async () => {
  reset("30d");
  for (const [, route] of READS) failing.add(route);
  const lines = await logged(() => reportsCampaignsOverride.apply());
  assert.deepEqual(
    surfaceValue("reports_campaigns"),
    { campaigns: null, ledger: null, reachOuts: null, key: "30d" },
    "three nulls and the range they are of",
  );
  assert.deepEqual(lines.map((l) => l[0]).sort(), READS.map((r) => r[3]).sort(), "each logged by its own name");
  assert.equal(followState("reports_campaigns"), "current");
  assert.equal(reportsCampaigns.isStale(), false, "held for the period");
  // Read again, with the routes back: the whole value is replaced.
  failing.clear();
  await reportsCampaignsOverride.apply();
  assert.deepEqual(surfaceValue("reports_campaigns").campaigns, campaignsFor({ days: 30 }));
  assert.deepEqual(surfaceValue("reports_campaigns").ledger, ledgerFor({ days: 30 }));
  assert.deepEqual(surfaceValue("reports_campaigns").reachOuts, reachOutsFor({ days: 30 }).report);
});

test("its live-feed rule is the lens's own: messages, conversations, escalations and runs, a reach-out's replies, the number and domains it speaks of, a person's answer and a template's verdict, a burst waited out for longer than Reports' own read waits, heard on the Campaigns lens alone and left for it otherwise", () => {
  reset("30d");
  assert.deepEqual(reportsCampaignsOverride.refreshOnTables, [
    "messages",
    "conversations",
    "escalations",
    "sequence_batches",
    "sequence_replies",
    "tenant_channels",
    // The mailboxes a reach-out writes from, the hosted one among them (decision 0056; reads-not-heard's owed, closed).
    "mailboxes",
    "mailbox_connections",
    "contacts",
    // The verdicts its tile of the WhatsApp messages Meta paused, turned off or rejected counts (W-campaign-run-template-reachout-10).
    "templates",
    // A deal won, counted once in the reach-outs' report (00426; reads-not-heard's owed, closed).
    "deals",
  ]);
  // The yeses and stops it counts are columns of the people: an update of one is heard on the lens, a person made is no answer
  // and would read the dearest of the lenses for every arrival (the wiring's second audit, W-person-list-lead-8).
  onLens();
  assert.equal(
    reportsCampaignsOverride.refreshWhen({ table: "contacts", event: "UPDATE", row: {} }),
    true,
    "an answer moved",
  );
  assert.equal(
    reportsCampaignsOverride.refreshWhen({ table: "contacts", event: "INSERT", row: {} }),
    false,
    "a person made",
  );
  for (const table of reportsCampaignsOverride.refreshOnTables)
    assert.ok(watchedTables().includes(table), `${table}: the feed tells of it`);
  assert.equal(
    reportsCampaignsOverride.debounceMs,
    5_000,
    "the ledger is the dearest read of the lens: it asks for the longest wait",
  );
  assert.ok(reportsCampaignsOverride.debounceMs > reportsOverride.debounceMs, "and Reports' own read waits less");
  assert.equal(
    reportsCampaignsOverride.refreshOnMessageInserts,
    undefined,
    "it names its tables, not the historical trio",
  );
  // The receipts its funnel counts, Delivered and Read, are heard, and read once a run's receipts quieten (the wiring's second
  // audit, S3-5): the lens stood still while a run's receipts came in. Sent and failed are the run's own rows, heard as a send.
  assert.deepEqual(reportsCampaignsOverride.refreshOnMessageStatuses, ["delivered", "read"]);
  assert.equal(reportsCampaignsOverride.receiptsQuietMs, 5_000, "a run's receipts are read once they quieten");
  for (const status of ["sent", "failed", "queued"])
    assert.equal(
      wantsRefresh(reportsCampaignsOverride, "messages", { table: "messages", event: "UPDATE", row: { status } }),
      false,
      `a message ${status}: not a receipt the funnel counts`,
    );
  assert.deepEqual(
    reportsHeadlineOverride.refreshOnTables,
    ["messages", "calls", "appointments", "contacts", "tenant_config"],
    "the headline has its own, Today's (headline-live.test.mjs)",
  );
  const change = (table) => ({ table, event: table === "contacts" ? "UPDATE" : "INSERT", row: {} });
  for (const route of ["reports/campaigns", "reports/campaigns:2026-09-01~2026-09-20"]) {
    elsewhere(route);
    for (const table of reportsCampaignsOverride.refreshOnTables)
      assert.equal(reportsCampaignsOverride.refreshWhen(change(table)), true, `${table} on ${route}: the lens is open`);
  }
  // The Overview draws the surface for one fact: it reads it as it comes on screen and when it has aged, never for a burst.
  for (const route of [
    "reports",
    "reports/2026-09-01~2026-09-20",
    "reports/people",
    "reports/receptionist",
    "reports/reviews",
    "reports/pipeline",
    "today",
    "inbox",
  ]) {
    elsewhere(route);
    for (const table of reportsCampaignsOverride.refreshOnTables)
      assert.equal(
        reportsCampaignsOverride.refreshWhen(change(table)),
        false,
        `${table} on ${route}: kept for the lens`,
      );
  }
});

test("a change heard on the Overview is not read there but is kept for the lens: read once as the lens comes on screen, and the next arrival reads nothing", () => {
  reset("30d");
  setStatus("reports_campaigns", "live");
  const reads = [];
  // The real address rule over the real override, held fresh (a read recorded holds nothing and would always say it has aged).
  const stop = readWhatWasMissed(
    [{ ...reportsCampaignsOverride, isStale: () => false }],
    (keys) => void reads.push(...keys),
    globalThis,
  );
  const go = (route) => {
    elsewhere(route);
    globalThis.dispatchEvent({ type: "popstate" });
  };
  try {
    // What an earlier test left owed is read once, as the lens comes on screen: the slate is clean.
    go("reports/campaigns");
    go("reports");
    reads.length = 0;

    const change = (table) => ({ table, event: "INSERT", row: {} });
    for (const table of reportsCampaignsOverride.refreshOnTables)
      assert.equal(reportsCampaignsOverride.refreshWhen(change(table)), false, `${table}: not read for a burst`);
    assert.deepEqual(reads, [], "nothing is read on the Overview for the burst");

    go("reports/campaigns");
    assert.deepEqual(reads, ["reports_campaigns"], "REGRESSION: the lens showed what the Overview read on arrival");
    go("reports/pipeline");
    go("reports/campaigns");
    assert.deepEqual(reads, ["reports_campaigns"], "and once: the next arrival reads nothing new");

    // Heard on the lens itself the change is read by the runner at once, and kept for nobody.
    assert.equal(reportsCampaignsOverride.refreshWhen(change("messages")), true);
    go("reports/pipeline");
    go("reports/campaigns");
    assert.deepEqual(reads, ["reports_campaigns"], "a change heard on the lens leaves nothing owed");
  } finally {
    stop();
  }
});

test("a burst of changes is read once, three seconds after the first: the longest wait the runner allows, however many come and however they are spaced", async (t) => {
  // The REAL runner over the REAL override (its apply recorded rather than made), the feed held here, and the clock by hand.
  reset("30d");
  onLens();
  const reads = [];
  let feed = null;
  const stop = startSurfaces(
    [{ ...reportsCampaignsOverride, apply: async () => void reads.push(Date.now()) }],
    (onChange) => {
      feed = onChange;
      return () => {};
    },
  );
  try {
    await settle();
    assert.ok(feed, "the feed is joined once the boot is in");
    reads.length = 0;
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
    const flush = async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    };
    const heard = (table = "messages", event = "INSERT") => feed({ tenant_id: "t1" }, table, event);
    const advance = async (ms) => {
      t.mock.timers.tick(ms);
      await flush();
    };

    // One message: nothing at once, nothing at eight hundred milliseconds (Reports' own wait), the read at three seconds.
    heard();
    await advance(800);
    assert.deepEqual(
      reads,
      [],
      "REGRESSION: read eight hundred milliseconds after a message, as the cheaper lenses are",
    );
    await advance(2_199);
    assert.deepEqual(reads, [], "and not yet at 2,999");
    await advance(1);
    assert.deepEqual(reads, [3_000], "read at three seconds, the runner's longest wait");

    // Changes a second apart (each longer than 800 ms after the one before): one read for the three, at three seconds from the first.
    reads.length = 0;
    heard("messages", "INSERT");
    await advance(1_000);
    heard("escalations", "INSERT");
    await advance(1_000);
    heard("sequence_batches", "UPDATE");
    await advance(1_000);
    assert.equal(reads.length, 1, `one read for a burst a second apart, not one a change: ${reads.length}`);
    assert.equal(reads[0], 6_000, "three seconds from its first change (at 3,000)");

    // A stream that never pauses is still read: every three seconds, never starved.
    reads.length = 0;
    for (let ms = 0; ms < 9_000; ms += 500) {
      heard();
      await advance(500);
    }
    assert.ok(reads.length >= 2 && reads.length <= 3, `a read every three seconds of a steady stream: ${reads.length}`);
  } finally {
    t.mock.timers.reset();
    stop();
  }
});

test("a period pick on the lens paints the held read and reads behind it only when none is held or the held one is old; the headline is read behind a pick wherever it was made", async () => {
  const stop = startSurfaces([], () => () => {});
  const realNow = Date.now;
  try {
    reset("30d");
    onLens();
    await reportsCampaignsOverride.apply();
    await setReportRange("30d");
    asked.length = 0;

    // Seven days, never read: nothing to paint, so it is read behind the pick, and what lands is the seven days'.
    await setReportRange("7d");
    await settle();
    assert.deepEqual(lensReads(), [ledgerRead("7d")], "one read of the lens, for the period picked");
    assert.deepEqual(
      headlineReads(),
      ["reports/headline 7d"],
      "and one of Today's line, which is read ahead of its page",
    );
    assert.equal(of("reports_campaigns"), "7d", "REGRESSION: the lens stayed on the period before the pick");

    // Back to thirty days, which is held and fresh: painted at once, and not read again.
    asked.length = 0;
    await setReportRange("30d");
    await settle();
    assert.equal(of("reports_campaigns"), "30d", "painted from what is held");
    assert.deepEqual(lensReads(), [], "REGRESSION: a held, fresh read was made again on every pick");

    // A held read made longer ago than the lens keeps it is painted and read behind.
    Date.now = () => realNow() + 10 * MIN_MS;
    asked.length = 0;
    await setReportRange("7d");
    await settle();
    assert.equal(of("reports_campaigns"), "7d", "painted at once");
    assert.deepEqual(lensReads(), [ledgerRead("7d")], "and read behind, being old");
  } finally {
    Date.now = realNow;
    stop();
  }
});

test("a period pick made on the Overview, which draws the surface for one fact, reads it behind like any page that draws it; made anywhere else it reads nothing of it: a held period is painted, and a period never read is left to the page that draws it", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    onLens();
    await reportsCampaignsOverride.apply();
    // The Overview draws "drew the most replies" from it (R6): a period never read is read behind the pick, once, for it.
    elsewhere("reports");
    asked.length = 0;
    await setReportRange("7d");
    await settle();
    assert.deepEqual(lensReads(), [ledgerRead("7d")], "the Overview: drawn there, so read behind the pick");
    assert.equal(of("reports_campaigns"), "7d");
    // A page that does not draw it paints what is held and reads nothing, however far the period is from what is held.
    for (const route of ["reports/pipeline", "today", "inbox"]) {
      elsewhere("reports");
      await setReportRange("30d");
      await settle();
      elsewhere(route);
      asked.length = 0;
      await setReportRange("90d");
      await settle();
      assert.deepEqual(lensReads(), [], `${route}: the surface is not drawn there`);
      assert.equal(of("reports_campaigns"), "30d", `${route}: and nothing of ninety days is held to paint`);
      assert.equal(
        reportsCampaigns.isStale(),
        true,
        `${route}: so the page that draws it reads it as it comes on screen (readWhatWasMissed)`,
      );
      asked.length = 0;
      await setReportRange("30d");
      await settle();
      assert.deepEqual(lensReads(), [], `${route}: held and fresh`);
      assert.equal(of("reports_campaigns"), "30d");
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
    await reportsCampaignsOverride.apply();
    await setReportRange("30d");
    await settle();
    asked.length = 0;
    // The pick's read of the report is slow and fails; the lens's own read of ninety days lands first, and is painted.
    let release = () => {};
    parked = { route: "reports", period: "90d", until: new Promise((r) => (release = r)) };
    refuse = "90d";
    const pick = setReportRange("90d");
    await settle();
    assert.equal(of("reports_campaigns"), "90d", "the lens read what was picked, and painted it");
    assert.equal(
      followState("reports_campaigns"),
      "current",
      "the lens follows the pick, ahead of the report that is still out",
    );
    release();
    const ok = await pick;
    await settle();
    assert.equal(ok, false, "the pick failed");
    assert.equal(shownReportPeriod(), "30d", "the period goes back");
    assert.equal(
      of("reports_campaigns"),
      "30d",
      "REGRESSION: the lens kept saying ninety days after the pick that failed, while the page said thirty",
    );
    assert.equal(followState("reports_campaigns"), "current");
  } finally {
    stop();
  }
});

test("one rule for what a failed pick leaves, in both reads that follow the period: the one held for the period kept is painted, and where none is, nothing of the period the page left, read again where its page is on screen", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    onLens();
    // Ninety days landed behind a pick on a tab that never read thirty days (the lens and Today are on-demand); the pick fails.
    keepReportPeriod("90d");
    await reportsCampaignsOverride.apply();
    await reportsHeadlineOverride.apply();
    showing("30d");
    asked.length = 0;
    refuse = "90d";
    const ok = await setReportRange("90d");
    await settle();
    assert.equal(ok, false, "the pick failed");
    assert.equal(shownReportPeriod(), "30d");
    // The lens is on screen, so its read for the period kept is made behind the clearing; Today is not, so its line waits for Today.
    assert.deepEqual(lensReads(), [ledgerRead("30d")], "the lens reads what it lacks, being on screen");
    assert.equal(of("reports_campaigns"), "30d", "and says the period the page kept");
    assert.equal(surfaceValue("reports_headline"), undefined, "Today's line says nothing of the period the page left");
    assert.equal(headline.isStale(), true, "and is read as Today comes on screen");
    assert.deepEqual(headlineReads(), [], "and it is not read behind a pick that failed");
  } finally {
    stop();
  }
});

const PICKED = { from: "2026-09-01", to: "2026-09-20" };
const PICKED_KEY = "2026-09-01~2026-09-20";

test("on days a member picked the lens follows the address: read by their first and last day, held under their one name, painted when picked again; Today's line keeps the period", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    onLens();
    await reportsCampaignsOverride.apply();
    await reportsHeadlineOverride.apply();
    await setReportRange("30d");
    await settle();
    asked.length = 0;

    assert.equal(await setReportRange(PICKED), true);
    await settle();
    assert.equal(
      globalThis.location.hash,
      `#/reports/campaigns:${PICKED_KEY}`,
      "the address says the days, after the lens",
    );
    assert.deepEqual(lensReads(), [ledgerRead(PICKED_KEY)], "one read of the lens, by the days' first and last");
    assert.equal(of("reports_campaigns"), PICKED_KEY, "published under the days' one name");
    assert.equal(surfaceValue("reports_campaigns").campaigns.days, 20, "and the answers are of the days asked");
    assert.equal(surfaceValue("reports_campaigns").ledger.end, "2026-09-20", "to the last of them");
    assert.equal(reportsCampaignsOverride.view(), PICKED_KEY, "its reads take their turn by that name");
    assert.equal(followState("reports_campaigns"), "current");
    assert.equal(shownReportPeriod(), "30d", "the period kept in this browser is not touched by days");
    assert.deepEqual(headlineReads(), [], "Today's line is the period's, which it holds: days are nothing of its own");
    assert.equal(of("reports_headline"), "30d");

    // Back to the period: the address says no days, and thirty days is painted from what is held.
    asked.length = 0;
    assert.equal(await setReportRange("30d"), true);
    await settle();
    assert.equal(globalThis.location.hash, "#/reports/campaigns", "a period is never in the address");
    assert.equal(of("reports_campaigns"), "30d");
    assert.deepEqual(lensReads(), [], "held and fresh");

    // And the days again, by the address alone (Back): held under their name, painted at once.
    globalThis.location.hash = `#/reports/campaigns:${PICKED_KEY}`;
    assert.equal(reportsCampaigns.paintHeld(), true, "the days were read: painted before any read of them");
    assert.equal(of("reports_campaigns"), PICKED_KEY);
  } finally {
    stop();
  }
});

test("days the report could not read leave the lens on the range the page shows, and the address with it", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    onLens();
    await reportsCampaignsOverride.apply();
    await setReportRange("30d");
    await settle();
    asked.length = 0;
    refuse = PICKED_KEY;
    const was = console.error;
    console.error = () => {};
    let ok;
    try {
      ok = await setReportRange(PICKED);
      await settle();
    } finally {
      console.error = was;
    }
    assert.equal(ok, false, "the pick failed");
    assert.equal(globalThis.location.hash, "#/reports/campaigns", "the address goes back to what the page shows");
    assert.equal(
      of("reports_campaigns"),
      "30d",
      "the lens says thirty days again, though its own read of the days landed behind the pick",
    );
    assert.equal(followState("reports_campaigns"), "current");
    assert.equal(shownReportPeriod(), "30d");
  } finally {
    stop();
  }
});

test("a write that makes the read wrong forgets it, and nothing reads it from the page the write was made on; a write that moves nothing it says leaves it", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    await reportsCampaignsOverride.apply();
    assert.equal(reportsCampaigns.isStale(), false);
    asked.length = 0;
    const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
    elsewhere("inbox");
    // A notification setting says nothing a campaign counts, and a deal is Reports' own Deals section: what it holds is left as it is.
    AFTER["PUT notifications"]();
    assert.notEqual(
      surfaceValue("reports_campaigns"),
      undefined,
      "a notification setting forgets nothing of the lens's",
    );
    AFTER["POST contacts/[id]/deal"]();
    assert.notEqual(surfaceValue("reports_campaigns"), undefined, "nor does a deal");
    assert.equal(reportsCampaigns.isStale(), false);
    // A reply moves "replies waiting on you": forgotten, and read as the lens comes on screen, not from the Inbox.
    AFTER["POST conversations/[id]/reply"]();
    assert.equal(surfaceValue("reports_campaigns"), undefined, "forgotten");
    assert.equal(reportsCampaigns.isStale(), true, "so the lens reads it as it comes on screen");
    assert.deepEqual(lensReads(), [], "and it is not read from the Inbox");
    await reportsCampaignsOverride.apply();
    reportsCampaigns.forget();
    assert.equal(surfaceValue("reports_campaigns"), undefined, "the helper's forget holds nothing of it");
  } finally {
    stop();
  }
});
