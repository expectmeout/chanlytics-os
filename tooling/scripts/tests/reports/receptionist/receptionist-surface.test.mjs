/**
 * The Receptionist override (surfaces/reports/receptionist-surface.ts) and the helper it shares with Today's headline and the Reviews
 * lens (surfaces/reports/period-surface.ts): one read of GET reports/receptionist for the range Reports shows, published under
 * `reports_receptionist` through the seam as the route gave it (`dto`, unfolded: the page folds it, so the fold never rides the route's
 * chunk) with the range it is of and when it was read; held by period, so a pick of a period this tab has read paints at once; an
 * answer for a period left is held and never painted over the new one; a read that fails fails the surface. Its live-feed rule is the
 * lens's own: the messages, escalations and calls the feed tells a workspace of, heard while the lens is on screen and 800 ms after
 * the last change. A period pick (period.ts) paints what is held wherever it was made, and reads behind it only while the lens is on
 * screen and only when it must; a pick that failed says the period kept, by one rule for both of the reads that follow the period; a
 * write that makes the read wrong forgets it. Every behaviour the two share runs through both. EXECUTED on the real modules over the
 * world's Harbor Studio, as the headline's own test is.
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

installLegacyReact();
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
// The shell's way of moving, as far as a pick needs it: the address says the route it was sent to.
globalThis.window.CHANLY = {
  ...(globalThis.window.CHANLY ?? {}),
  nav: (route) => {
    globalThis.location.hash = `#/${route}`;
  },
};
const keepError = console.error;
console.error = () => {};
const { receptionist, receptionistOverride, forgetReceptionist } = await importSrc(
  "apps/dashboard/src/surfaces/reports/receptionist-surface.ts",
);
const { headline, reportsHeadlineOverride } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");
const { keepReportPeriod, shownReportPeriod } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { setReportRange } = await importSrc("apps/dashboard/src/surfaces/reports/period.ts");
const { surfaceValue, setSurfaceValue, followState } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { setStatus } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
console.error = keepError;

const DAYS = { "7d": 7, "30d": 30, "90d": 90 };
/** The instant the world's clock is stopped at when a read's `readAt` is asked for. */
const READ_AT = Date.parse("2026-09-21T15:00:00Z");
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const down = () => json(500, { ok: false, error: { code: "internal", message: "down" } });
/** The route's answer for the days asked: a window with no series yet, the shape a database without the function gives (the DTO's own). */
const answerFor = (over) => ({
  timezone: "America/New_York",
  today: "2026-09-21",
  ...(over.end === undefined ? {} : { end: over.end }),
  days: over.days,
  series: null,
  profile: null,
});
const asked = [];
const unexpected = [];
let parked = null;
let refuse = null;
let refuseReceptionist = false;
/** Each route answers with its own shape: a read sent to the wrong route is a 404 and a failure of the test, never an answer that fits. */
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  // What a read names: a period, or the first and the last of the days picked, said here by the range's one name.
  const days = u.searchParams.has("from") ? { from: u.searchParams.get("from"), to: u.searchParams.get("to") } : null;
  const period = days ? `${days.from}~${days.to}` : u.searchParams.get("period");
  const route = u.pathname.replace("/api/v1/", "");
  asked.push(period ? `${route} ${period}` : route);
  if (/^reports\/(campaigns|campaigns\/ledger|reach-outs)$/.test(route)) return down();
  if (parked && parked.route === route && parked.period === period) await parked.until;
  if (route === "reports") {
    if (refuse === period) return down();
    return json(200, { ok: true, data: { report: reportDto(), booking: CALENDAR, deals: null } });
  }
  if (route === "reports/headline")
    return json(200, { ok: true, data: { headline: headlineOf(reportDto(), period, CALENDAR) } });
  if (route === "reports/receptionist") {
    if (refuseReceptionist) return down();
    const over = days ? { days: reportDaysCount(days), end: days.to } : { days: DAYS[period] };
    return json(200, { ok: true, data: answerFor(over) });
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
const receptionistReads = () => asked.filter((a) => a.startsWith("reports/receptionist"));
const headlineReads = () => asked.filter((a) => a.startsWith("reports/headline"));
const onLens = () => {
  globalThis.location.hash = "#/reports/receptionist";
};
const elsewhere = (route = "reports/people") => {
  globalThis.location.hash = `#/${route}`;
};
let studios = 0;
const reset = (period) => {
  asked.length = 0;
  parked = null;
  refuse = null;
  refuseReceptionist = false;
  // Each test is a workspace of its own: a read is held by the address's workspace (held-views.ts), and the periods one test reads
  // must not be held when another says they were never read.
  globalThis.location.pathname = `/w/studio-${(studios += 1)}`;
  elsewhere("reports");
  keepReportPeriod(period);
  for (const key of ["reports_receptionist", "reports_headline"]) setSurfaceValue(key, undefined);
};
/** `run` with the clock stopped at the instant the read is said to be made at. */
const atReadTime = async (run) => {
  const real = Date.now;
  Date.now = () => READ_AT;
  try {
    return await run();
  } finally {
    Date.now = real;
  }
};
/** The reads that follow the period, each by the key it publishes under: the helper's users. */
const USERS = [
  ["the headline", headline, "reports_headline", "reports/headline"],
  ["the Receptionist read", receptionist, "reports_receptionist", "reports/receptionist"],
];
/**
 * What a published read is of: the headline says its period, and the Receptionist read its range's one name, which for a
 * period is the period's own (`30d`) and for days a member picked their days (`2026-09-01~2026-09-20`).
 */
const of = (key) => {
  const held = surfaceValue(key);
  return held === undefined ? undefined : (held.key ?? held.period);
};
/** What Reports shows, as its own surface publishes it: a period by name, here. */
const showing = (period) =>
  setSurfaceValue("reports", { ...(surfaceValue("reports") ?? {}), period, range: period, key: period });

test("one read of the receptionist for the range Reports shows, published as the route gave it with the range it is of and when it was read, and nothing else", async () => {
  reset("30d");
  await atReadTime(() => receptionistOverride.apply());
  assert.deepEqual(asked, ["reports/receptionist 30d"], "one request, for the shown period: { period }");
  const held = surfaceValue("reports_receptionist");
  assert.deepEqual(
    Object.keys(held).sort(),
    ["dto", "key", "readAt"],
    "the route's answer, the range it is of and when it was read: no view model, the page folds it",
  );
  assert.equal(held.key, "30d");
  assert.equal(held.readAt, READ_AT, "the moment the read was made, which the fold counts `now` from");
  assert.deepEqual(held.dto, answerFor({ days: 30 }), "the answer as the route gave it, unfolded");
  assert.equal(receptionistOverride.key, "reports_receptionist");
  assert.equal(receptionistOverride.value, "reports_receptionist", "the cache keeps it beside the surface's snapshot");
  assert.deepEqual(receptionistOverride.events, ["surface:reports_receptionist"]);
  assert.equal(receptionistOverride.onDemand, true, "read where the lens is drawn and nowhere else");
  assert.equal(typeof receptionistOverride.isStale, "function", "a read of it ages: the lens that draws it asks");
  assert.equal(
    receptionistOverride.view(),
    "30d",
    "reads of one period take their turn, a pick of another starts at once",
  );
  assert.equal(
    Object.keys(globalThis.window).filter((k) => /RECEPTIONIST/i.test(k)).length,
    0,
    "published through the seam alone: no mirror on window",
  );
});

test("the range asked is the period's own or the first and last of the days picked, and what is published is of the range asked", async () => {
  reset("7d");
  await receptionistOverride.apply();
  assert.deepEqual(asked, ["reports/receptionist 7d"], "{ period: '7d' }");
  assert.equal(surfaceValue("reports_receptionist").key, "7d");
  assert.equal(surfaceValue("reports_receptionist").dto.days, 7);

  reset("30d");
  elsewhere("reports/receptionist:2026-09-01~2026-09-20");
  await receptionistOverride.apply();
  assert.deepEqual(asked, ["reports/receptionist 2026-09-01~2026-09-20"], "{ from, to }");
  const held = surfaceValue("reports_receptionist");
  assert.equal(held.key, "2026-09-01~2026-09-20", "named by the days' one key");
  assert.deepEqual(held.dto, answerFor({ days: 20, end: "2026-09-20" }));
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

test("how the Receptionist read stands against the period shown: current, coming while a pick's read is out, failed when it could not be made", async () => {
  reset("30d");
  assert.equal(followState("reports_receptionist"), "coming", "nothing read yet");
  await receptionistOverride.apply();
  assert.equal(followState("reports_receptionist"), "current", "of the period shown");
  keepReportPeriod("7d");
  assert.equal(
    followState("reports_receptionist"),
    "coming",
    "a pick is made and its read is out: what is held is of the period left",
  );
  setStatus("reports_receptionist", "degraded");
  assert.equal(
    followState("reports_receptionist"),
    "failed",
    "a read that landed once, and whose latest could not be made",
  );
  setStatus("reports_receptionist", "live");
  assert.equal(followState("reports_receptionist"), "coming", "read again, the status is live and the read is out");
  await receptionistOverride.apply();
  keepReportPeriod("7d");
  assert.equal(followState("reports_receptionist"), "current");
  assert.equal(followState("reports_headline"), "coming", "each read stands on its own value");
  assert.equal(followState("setup"), "coming", "a surface that follows nothing is coming until it holds a value");
});

test("a read that fails fails the surface: the lens says so, never a count of nothing", async () => {
  reset("30d");
  refuseReceptionist = true;
  const was = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      () => receptionistOverride.apply(),
      (e) => e && e.code === "internal",
    );
  } finally {
    console.error = was;
  }
  assert.equal(surfaceValue("reports_receptionist"), undefined);
  assert.equal(receptionist.isStale(), true, "and nothing is held for the period");
});

test("its live-feed rule is the lens's own: messages, escalations and calls, 800 ms after the last change, heard while the lens is on screen and left for it otherwise", () => {
  reset("30d");
  assert.deepEqual(receptionistOverride.refreshOnTables, ["messages", "escalations", "calls"]);
  assert.equal(receptionistOverride.debounceMs, 800, "a burst of messages is waited out, as Reports' own read waits");
  assert.equal(receptionistOverride.refreshOnMessageInserts, undefined, "it names its tables, not the historical trio");
  assert.deepEqual(reportsHeadlineOverride.refreshOnTables, undefined, "the headline has none");
  const change = (table) => ({ table, event: "INSERT", row: {} });
  for (const route of ["reports/receptionist", "reports/receptionist:2026-09-01~2026-09-20"]) {
    elsewhere(route);
    for (const table of receptionistOverride.refreshOnTables)
      assert.equal(receptionistOverride.refreshWhen(change(table)), true, `${table} on ${route}: the lens is open`);
  }
  for (const route of ["reports", "reports/people", "reports/reviews", "reports/campaigns", "today", "inbox"]) {
    elsewhere(route);
    for (const table of receptionistOverride.refreshOnTables)
      assert.equal(receptionistOverride.refreshWhen(change(table)), false, `${table} on ${route}: kept for the lens`);
  }
});

test("a transcript turn of a call in progress is no change to the lens, wherever it is heard; a call starting and a call ending are", () => {
  reset("30d");
  const call = (event, status) => ({ table: "calls", event, row: { status } });
  for (const route of [
    "reports/receptionist",
    "reports/receptionist:2026-09-01~2026-09-20",
    "today",
    "reports/people",
  ]) {
    elsewhere(route);
    assert.equal(
      receptionistOverride.refreshWhen(call("UPDATE", "ongoing")),
      false,
      `${route}: a turn changes nothing the lens counts (and is not kept for it either)`,
    );
  }
  onLens();
  assert.equal(receptionistOverride.refreshWhen(call("INSERT", "ongoing")), true, "a call starting");
  assert.equal(receptionistOverride.refreshWhen(call("UPDATE", "ended")), true, "a call ending");
  assert.equal(receptionistOverride.refreshWhen(call("UPDATE", "failed")), true, "and one that failed");
  elsewhere("today");
  assert.equal(receptionistOverride.refreshWhen(call("UPDATE", "ended")), false, "off the lens it waits for it");
});

test("a period pick on the lens paints the held read and reads behind it only when none is held or the held one is old; the headline is read behind a pick wherever it was made", async () => {
  const stop = startSurfaces([], () => () => {});
  const realNow = Date.now;
  try {
    reset("30d");
    onLens();
    await receptionistOverride.apply();
    await setReportRange("30d");
    asked.length = 0;

    // Seven days, never read: nothing to paint, so it is read behind the pick, and what lands is the seven days'.
    await setReportRange("7d");
    await settle();
    assert.deepEqual(receptionistReads(), ["reports/receptionist 7d"], "one read of the lens, for the period picked");
    assert.deepEqual(
      headlineReads(),
      ["reports/headline 7d"],
      "and one of Today's line, which is read ahead of its page",
    );
    assert.equal(of("reports_receptionist"), "7d", "REGRESSION: the lens stayed on the period before the pick");

    // Back to thirty days, which is held and fresh: painted at once, and not read again.
    asked.length = 0;
    await setReportRange("30d");
    await settle();
    assert.equal(of("reports_receptionist"), "30d", "painted from what is held");
    assert.deepEqual(receptionistReads(), [], "REGRESSION: a held, fresh read was made again on every pick");

    // A held read made longer ago than the lens keeps it is painted and read behind.
    Date.now = () => realNow() + 10 * MIN_MS;
    asked.length = 0;
    await setReportRange("7d");
    await settle();
    assert.equal(of("reports_receptionist"), "7d", "painted at once");
    assert.deepEqual(receptionistReads(), ["reports/receptionist 7d"], "and read behind, being old");
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
    await receptionistOverride.apply();
    // (The Reviews and People lenses are other lenses that read a surface of their own when on screen: reviews-surface.test.mjs,
    // people-surface.test.mjs.)
    for (const route of ["reports", "reports/pipeline", "reports/campaigns"]) {
      elsewhere(route);
      asked.length = 0;
      await setReportRange("7d");
      await settle();
      assert.deepEqual(receptionistReads(), [], `${route}: the lens is not on screen`);
      assert.equal(of("reports_receptionist"), "30d", `${route}: and nothing of seven days is held to paint`);
      assert.equal(
        receptionist.isStale(),
        true,
        `${route}: so the lens reads it as it comes on screen (readWhatWasMissed)`,
      );
      asked.length = 0;
      await setReportRange("30d");
      await settle();
      assert.deepEqual(receptionistReads(), [], `${route}: held and fresh`);
      assert.equal(of("reports_receptionist"), "30d");
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
    await receptionistOverride.apply();
    await setReportRange("30d");
    await settle();
    asked.length = 0;
    // The pick's read of the report is slow and fails; the lens's own read of ninety days lands first, and is painted.
    let release = () => {};
    parked = { route: "reports", period: "90d", until: new Promise((r) => (release = r)) };
    refuse = "90d";
    const pick = setReportRange("90d");
    await settle();
    assert.equal(of("reports_receptionist"), "90d", "the lens read what was picked, and painted it");
    assert.equal(
      followState("reports_receptionist"),
      "current",
      "the lens follows the pick, ahead of the report that is still out",
    );
    release();
    const ok = await pick;
    await settle();
    assert.equal(ok, false, "the pick failed");
    assert.equal(shownReportPeriod(), "30d", "the period goes back");
    assert.equal(
      of("reports_receptionist"),
      "30d",
      "REGRESSION: the lens kept saying ninety days after the pick that failed, while the page said thirty",
    );
    assert.equal(followState("reports_receptionist"), "current");
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
    await receptionistOverride.apply();
    await reportsHeadlineOverride.apply();
    showing("30d");
    asked.length = 0;
    refuse = "90d";
    const ok = await setReportRange("90d");
    await settle();
    assert.equal(ok, false, "the pick failed");
    assert.equal(shownReportPeriod(), "30d");
    // The lens is on screen, so its read for the period kept is made behind the clearing; Today is not, so its line waits for Today.
    assert.deepEqual(
      receptionistReads(),
      ["reports/receptionist 30d"],
      "the lens reads what it lacks, being on screen",
    );
    assert.equal(of("reports_receptionist"), "30d", "and says the period the page kept");
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
    await receptionistOverride.apply();
    await reportsHeadlineOverride.apply();
    await setReportRange("30d");
    await settle();
    asked.length = 0;

    assert.equal(await setReportRange(PICKED), true);
    await settle();
    assert.equal(
      globalThis.location.hash,
      `#/reports/receptionist:${PICKED_KEY}`,
      "the address says the days, after the lens",
    );
    assert.deepEqual(
      receptionistReads(),
      [`reports/receptionist ${PICKED_KEY}`],
      "one read of the lens, by the days' first and last",
    );
    assert.equal(of("reports_receptionist"), PICKED_KEY, "published under the days' one name");
    assert.equal(surfaceValue("reports_receptionist").dto.days, 20, "and the answer is of the days asked");
    assert.equal(receptionistOverride.view(), PICKED_KEY, "its reads take their turn by that name");
    assert.equal(followState("reports_receptionist"), "current");
    assert.equal(shownReportPeriod(), "30d", "the period kept in this browser is not touched by days");
    assert.deepEqual(headlineReads(), [], "Today's line is the period's, which it holds: days are nothing of its own");
    assert.equal(of("reports_headline"), "30d");

    // Back to the period: the address says no days, and thirty days is painted from what is held.
    asked.length = 0;
    assert.equal(await setReportRange("30d"), true);
    await settle();
    assert.equal(globalThis.location.hash, "#/reports/receptionist", "a period is never in the address");
    assert.equal(of("reports_receptionist"), "30d");
    assert.deepEqual(receptionistReads(), [], "held and fresh");

    // And the days again, by the address alone (Back): held under their name, painted at once.
    globalThis.location.hash = `#/reports/receptionist:${PICKED_KEY}`;
    assert.equal(receptionist.paintHeld(), true, "the days were read: painted before any read of them");
    assert.equal(of("reports_receptionist"), PICKED_KEY);
  } finally {
    stop();
  }
});

test("days the report could not read leave the lens on the range the page shows, and the address with it", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    onLens();
    await receptionistOverride.apply();
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
    assert.equal(globalThis.location.hash, "#/reports/receptionist", "the address goes back to what the page shows");
    assert.equal(
      of("reports_receptionist"),
      "30d",
      "the lens says thirty days again, though its own read of the days landed behind the pick",
    );
    assert.equal(followState("reports_receptionist"), "current");
    assert.equal(shownReportPeriod(), "30d");
  } finally {
    stop();
  }
});

test("a write that makes the read wrong forgets it, and nothing reads it from the page the write was made on", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    await receptionistOverride.apply();
    assert.equal(receptionist.isStale(), false);
    asked.length = 0;
    const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
    elsewhere("inbox");
    AFTER["POST conversations/[id]/reply"]();
    assert.equal(surfaceValue("reports_receptionist"), undefined, "forgotten");
    assert.equal(receptionist.isStale(), true, "so the lens reads it as it comes on screen");
    assert.deepEqual(receptionistReads(), [], "and it is not read from the Inbox");
    await receptionistOverride.apply();
    forgetReceptionist();
    assert.equal(surfaceValue("reports_receptionist"), undefined, "forgetReceptionist is the helper's forget");
  } finally {
    stop();
  }
});
