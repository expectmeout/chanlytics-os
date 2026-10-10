/**
 * The People lens's override (surfaces/reports/people-surface.ts) and the helper it shares with Today's headline and the other lenses
 * (surfaces/reports/period-surface.ts): one read of GET reports/people for the range Reports shows, published under `reports_people`
 * through the seam as the route gave it (`dto`, unfolded: the page folds it, so the fold never rides the route's chunk) with the range
 * it is of; held by period, so a pick of a period this tab has read paints at once; an answer for a period left is held and never
 * painted over the new one; a read that fails fails the surface. Its live-feed rule is the lens's own: the messages, calls and notes
 * the feed tells a workspace of, heard while the lens is on screen, a burst of them read once, three seconds after the first (the
 * wait asked is five and the runner allows three at most; the feed carries no row, so no change is told outbound from inbound).
 * A period pick (period.ts) paints
 * what is held wherever it was made, and reads behind it only while the lens is on screen and only when it must; a pick that failed
 * says the period kept, by one rule for all the reads that follow the period; a write that makes the read wrong forgets it. Every
 * behaviour the reads share runs through this one. EXECUTED on the real modules over the world's Harbor Studio, as the headline's own
 * test is.
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
import { dtoWith } from "./_people-world.mjs";

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
const { reportsPeople, reportsPeopleOverride, forgetReportsPeople } = await importSrc(
  "apps/dashboard/src/surfaces/reports/people-surface.ts",
);
const { headline, reportsHeadlineOverride } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");
const { keepReportPeriod, shownReportPeriod, reportsOverride } = await importSrc(
  "apps/dashboard/src/surfaces/reports/surface.ts",
);
const { setReportRange } = await importSrc("apps/dashboard/src/surfaces/reports/period.ts");
const { surfaceValue, setSurfaceValue, followState } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { setStatus } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
console.error = keepError;

const DAYS = { "7d": 7, "30d": 30, "90d": 90 };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const down = () => json(500, { ok: false, error: { code: "internal", message: "down" } });
/** The route's answer for the days asked: the people world's DTO (the window and the book), of the days the read named. */
const answerFor = (over) => {
  const end = over.end === undefined ? {} : { end: over.end };
  return { ...dtoWith({ days: over.days, ...end }), days: over.days, ...end };
};
const asked = [];
const unexpected = [];
let parked = null;
let refuse = null;
let refusePeople = false;
/** Each route answers with its own shape: a read sent to the wrong route is a 404 and a failure of the test, never an answer that fits. */
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  // What a read names: a period, or the first and the last of the days picked, said here by the range's one name.
  const days = u.searchParams.has("from") ? { from: u.searchParams.get("from"), to: u.searchParams.get("to") } : null;
  const period = days ? `${days.from}~${days.to}` : u.searchParams.get("period");
  const route = u.pathname.replace("/api/v1/", "");
  asked.push(period ? `${route} ${period}` : route);
  if (/^reports\/(campaigns|reach-outs)$/.test(route)) return down();
  if (parked && parked.route === route && parked.period === period) await parked.until;
  if (route === "reports") {
    if (refuse === period) return down();
    return json(200, { ok: true, data: { report: reportDto(), booking: CALENDAR, deals: null } });
  }
  if (route === "reports/headline")
    return json(200, { ok: true, data: { headline: headlineOf(reportDto(), period, CALENDAR) } });
  if (route === "reports/people") {
    if (refusePeople) return down();
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
const peopleReads = () => asked.filter((a) => a.startsWith("reports/people"));
const headlineReads = () => asked.filter((a) => a.startsWith("reports/headline"));
const onLens = () => {
  globalThis.location.hash = "#/reports/people";
};
const elsewhere = (route = "reports/receptionist") => {
  globalThis.location.hash = `#/${route}`;
};
let studios = 0;
const reset = (period) => {
  asked.length = 0;
  parked = null;
  refuse = null;
  refusePeople = false;
  // Each test is a workspace of its own: a read is held by the address's workspace (held-views.ts), and the periods one test reads
  // must not be held when another says they were never read.
  globalThis.location.pathname = `/w/studio-${(studios += 1)}`;
  elsewhere("reports");
  keepReportPeriod(period);
  for (const key of ["reports_people", "reports_headline"]) setSurfaceValue(key, undefined);
};
/** The reads that follow the period, each by the key it publishes under: the helper's users. */
const USERS = [
  ["the headline", headline, "reports_headline", "reports/headline"],
  ["the People read", reportsPeople, "reports_people", "reports/people"],
];
/**
 * What a published read is of: the headline says its period, and the People read its range's one name, which for a period is
 * the period's own (`30d`) and for days a member picked their days (`2026-09-01~2026-09-20`).
 */
const of = (key) => {
  const held = surfaceValue(key);
  return held === undefined ? undefined : (held.key ?? held.period);
};
/** What Reports shows, as its own surface publishes it: a period by name, here. */
const showing = (period) =>
  setSurfaceValue("reports", { ...(surfaceValue("reports") ?? {}), period, range: period, key: period });

test("one read of the people for the range Reports shows, published as the route gave it with the range it is of, and nothing else", async () => {
  reset("30d");
  await reportsPeopleOverride.apply();
  assert.deepEqual(asked, ["reports/people 30d"], "one request, for the shown period: { period }");
  const held = surfaceValue("reports_people");
  assert.deepEqual(
    Object.keys(held).sort(),
    ["dto", "key"],
    "the route's answer and the range it is of: no view model, the page folds it",
  );
  assert.equal(held.key, "30d");
  assert.deepEqual(held.dto, answerFor({ days: 30 }), "the answer as the route gave it, unfolded");
  assert.deepEqual(Object.keys(held.dto).sort(), ["days", "now", "series", "timezone", "today"]);
  assert.equal(reportsPeopleOverride.key, "reports_people");
  assert.equal(reportsPeopleOverride.value, "reports_people", "the cache keeps it beside the surface's snapshot");
  assert.deepEqual(reportsPeopleOverride.events, ["surface:reports_people"]);
  assert.equal(reportsPeopleOverride.onDemand, true, "read where the lens is drawn and nowhere else");
  assert.equal(typeof reportsPeopleOverride.isStale, "function", "a read of it ages: the lens that draws it asks");
  assert.equal(
    reportsPeopleOverride.view(),
    "30d",
    "reads of one period take their turn, a pick of another starts at once",
  );
  assert.equal(reportsPeople.override, reportsPeopleOverride, "the override is the helper's own");
  assert.equal(
    Object.keys(globalThis.window).filter((k) => /REPORTS_?PEOPLE/i.test(k)).length,
    0,
    "published through the seam alone: no mirror on window",
  );
});

test("the range asked is the period's own or the first and last of the days picked, and what is published is of the range asked", async () => {
  reset("7d");
  await reportsPeopleOverride.apply();
  assert.deepEqual(asked, ["reports/people 7d"], "{ period: '7d' }");
  assert.equal(surfaceValue("reports_people").key, "7d");
  assert.equal(surfaceValue("reports_people").dto.days, 7);

  reset("30d");
  elsewhere("reports/people:2026-09-01~2026-09-20");
  await reportsPeopleOverride.apply();
  assert.deepEqual(asked, ["reports/people 2026-09-01~2026-09-20"], "{ from, to }");
  const held = surfaceValue("reports_people");
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

test("how the People read stands against the period shown: current, coming while a pick's read is out, failed when it could not be made", async () => {
  reset("30d");
  assert.equal(followState("reports_people"), "coming", "nothing read yet");
  await reportsPeopleOverride.apply();
  assert.equal(followState("reports_people"), "current", "of the period shown");
  keepReportPeriod("7d");
  assert.equal(
    followState("reports_people"),
    "coming",
    "a pick is made and its read is out: what is held is of the period left",
  );
  setStatus("reports_people", "degraded");
  assert.equal(followState("reports_people"), "failed", "a read that landed once, and whose latest could not be made");
  setStatus("reports_people", "live");
  assert.equal(followState("reports_people"), "coming", "read again, the status is live and the read is out");
  await reportsPeopleOverride.apply();
  keepReportPeriod("7d");
  assert.equal(followState("reports_people"), "current");
  assert.equal(followState("reports_headline"), "coming", "each read stands on its own value");
  assert.equal(followState("setup"), "coming", "a surface that follows nothing is coming until it holds a value");
});

test("a read that fails fails the surface: the lens says so, never a count of nothing", async () => {
  reset("30d");
  refusePeople = true;
  const was = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      () => reportsPeopleOverride.apply(),
      (e) => e && e.code === "internal",
    );
  } finally {
    console.error = was;
  }
  assert.equal(surfaceValue("reports_people"), undefined);
  assert.equal(reportsPeople.isStale(), true, "and nothing is held for the period");
});

test("its live-feed rule is the lens's own: messages, calls and notes, a burst waited out for longer than Reports' own read waits, heard while the lens is on screen and left for it otherwise", () => {
  reset("30d");
  assert.deepEqual(reportsPeopleOverride.refreshOnTables, ["messages", "calls", "person_notes"]);
  assert.equal(
    reportsPeopleOverride.debounceMs,
    5_000,
    "the dearest read of the lenses (the whole pool, measured at 3.9 s for 20,000 people) asks for the longest wait",
  );
  assert.ok(reportsPeopleOverride.debounceMs > reportsOverride.debounceMs, "and Reports' own read waits less");
  assert.equal(
    reportsPeopleOverride.refreshOnMessageInserts,
    undefined,
    "it names its tables, not the historical trio",
  );
  assert.deepEqual(reportsHeadlineOverride.refreshOnTables, undefined, "the headline has none");
  const change = (table) => ({ table, event: "INSERT", row: {} });
  for (const route of ["reports/people", "reports/people:2026-09-01~2026-09-20"]) {
    elsewhere(route);
    for (const table of reportsPeopleOverride.refreshOnTables)
      assert.equal(reportsPeopleOverride.refreshWhen(change(table)), true, `${table} on ${route}: the lens is open`);
  }
  for (const route of ["reports", "reports/receptionist", "reports/reviews", "reports/campaigns", "today", "inbox"]) {
    elsewhere(route);
    for (const table of reportsPeopleOverride.refreshOnTables)
      assert.equal(reportsPeopleOverride.refreshWhen(change(table)), false, `${table} on ${route}: kept for the lens`);
  }
});

test("a transcript turn of a call in progress is no change to the lens, wherever it is heard; a call starting and a call ending are", () => {
  reset("30d");
  const call = (event, status) => ({ table: "calls", event, row: { status } });
  for (const route of ["reports/people", "reports/people:2026-09-01~2026-09-20", "today", "reports/receptionist"]) {
    elsewhere(route);
    assert.equal(
      reportsPeopleOverride.refreshWhen(call("UPDATE", "ongoing")),
      false,
      `${route}: a turn changes nothing the lens counts (and is not kept for it either)`,
    );
  }
  onLens();
  assert.equal(reportsPeopleOverride.refreshWhen(call("INSERT", "ongoing")), true, "a call starting");
  assert.equal(reportsPeopleOverride.refreshWhen(call("UPDATE", "ended")), true, "a call ending");
  assert.equal(reportsPeopleOverride.refreshWhen(call("UPDATE", "failed")), true, "and one that failed");
  elsewhere("today");
  assert.equal(reportsPeopleOverride.refreshWhen(call("UPDATE", "ended")), false, "off the lens it waits for it");
});

test("a burst of changes is read once, three seconds after the first: the longest wait the runner allows, however many come and however they are spaced", async (t) => {
  // The REAL runner over the REAL override (its apply recorded rather than made), the feed held here, and the clock by hand.
  reset("30d");
  onLens();
  const reads = [];
  let feed = null;
  const stop = startSurfaces(
    [{ ...reportsPeopleOverride, apply: async () => void reads.push(Date.now()) }],
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
    heard("calls", "INSERT");
    await advance(1_000);
    heard("person_notes", "UPDATE");
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

    // A transcript turn of a call in progress asks for nothing, wherever it is heard.
    reads.length = 0;
    feed({ tenant_id: "t1", status: "ongoing" }, "calls", "UPDATE");
    await advance(6_000);
    assert.deepEqual(reads, [], "a turn of a call in progress moves nothing the lens counts");
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
    await reportsPeopleOverride.apply();
    await setReportRange("30d");
    asked.length = 0;

    // Seven days, never read: nothing to paint, so it is read behind the pick, and what lands is the seven days'.
    await setReportRange("7d");
    await settle();
    assert.deepEqual(peopleReads(), ["reports/people 7d"], "one read of the lens, for the period picked");
    assert.deepEqual(
      headlineReads(),
      ["reports/headline 7d"],
      "and one of Today's line, which is read ahead of its page",
    );
    assert.equal(of("reports_people"), "7d", "REGRESSION: the lens stayed on the period before the pick");

    // Back to thirty days, which is held and fresh: painted at once, and not read again.
    asked.length = 0;
    await setReportRange("30d");
    await settle();
    assert.equal(of("reports_people"), "30d", "painted from what is held");
    assert.deepEqual(peopleReads(), [], "REGRESSION: a held, fresh read was made again on every pick");

    // A held read made longer ago than the lens keeps it is painted and read behind.
    Date.now = () => realNow() + 10 * MIN_MS;
    asked.length = 0;
    await setReportRange("7d");
    await settle();
    assert.equal(of("reports_people"), "7d", "painted at once");
    assert.deepEqual(peopleReads(), ["reports/people 7d"], "and read behind, being old");
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
    await reportsPeopleOverride.apply();
    // (The Reviews and Receptionist lenses read surfaces of their own when on screen: reviews-surface.test.mjs, receptionist-surface.test.mjs.)
    for (const route of ["reports", "reports/pipeline", "reports/campaigns"]) {
      elsewhere(route);
      asked.length = 0;
      await setReportRange("7d");
      await settle();
      assert.deepEqual(peopleReads(), [], `${route}: the lens is not on screen`);
      assert.equal(of("reports_people"), "30d", `${route}: and nothing of seven days is held to paint`);
      assert.equal(
        reportsPeople.isStale(),
        true,
        `${route}: so the lens reads it as it comes on screen (readWhatWasMissed)`,
      );
      asked.length = 0;
      await setReportRange("30d");
      await settle();
      assert.deepEqual(peopleReads(), [], `${route}: held and fresh`);
      assert.equal(of("reports_people"), "30d");
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
    await reportsPeopleOverride.apply();
    await setReportRange("30d");
    await settle();
    asked.length = 0;
    // The pick's read of the report is slow and fails; the lens's own read of ninety days lands first, and is painted.
    let release = () => {};
    parked = { route: "reports", period: "90d", until: new Promise((r) => (release = r)) };
    refuse = "90d";
    const pick = setReportRange("90d");
    await settle();
    assert.equal(of("reports_people"), "90d", "the lens read what was picked, and painted it");
    assert.equal(
      followState("reports_people"),
      "current",
      "the lens follows the pick, ahead of the report that is still out",
    );
    release();
    const ok = await pick;
    await settle();
    assert.equal(ok, false, "the pick failed");
    assert.equal(shownReportPeriod(), "30d", "the period goes back");
    assert.equal(
      of("reports_people"),
      "30d",
      "REGRESSION: the lens kept saying ninety days after the pick that failed, while the page said thirty",
    );
    assert.equal(followState("reports_people"), "current");
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
    await reportsPeopleOverride.apply();
    await reportsHeadlineOverride.apply();
    showing("30d");
    asked.length = 0;
    refuse = "90d";
    const ok = await setReportRange("90d");
    await settle();
    assert.equal(ok, false, "the pick failed");
    assert.equal(shownReportPeriod(), "30d");
    // The lens is on screen, so its read for the period kept is made behind the clearing; Today is not, so its line waits for Today.
    assert.deepEqual(peopleReads(), ["reports/people 30d"], "the lens reads what it lacks, being on screen");
    assert.equal(of("reports_people"), "30d", "and says the period the page kept");
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
    await reportsPeopleOverride.apply();
    await reportsHeadlineOverride.apply();
    await setReportRange("30d");
    await settle();
    asked.length = 0;

    assert.equal(await setReportRange(PICKED), true);
    await settle();
    assert.equal(
      globalThis.location.hash,
      `#/reports/people:${PICKED_KEY}`,
      "the address says the days, after the lens",
    );
    assert.deepEqual(
      peopleReads(),
      [`reports/people ${PICKED_KEY}`],
      "one read of the lens, by the days' first and last",
    );
    assert.equal(of("reports_people"), PICKED_KEY, "published under the days' one name");
    assert.equal(surfaceValue("reports_people").dto.days, 20, "and the answer is of the days asked");
    assert.equal(surfaceValue("reports_people").dto.end, "2026-09-20", "to the last of them");
    assert.equal(reportsPeopleOverride.view(), PICKED_KEY, "its reads take their turn by that name");
    assert.equal(followState("reports_people"), "current");
    assert.equal(shownReportPeriod(), "30d", "the period kept in this browser is not touched by days");
    assert.deepEqual(headlineReads(), [], "Today's line is the period's, which it holds: days are nothing of its own");
    assert.equal(of("reports_headline"), "30d");

    // Back to the period: the address says no days, and thirty days is painted from what is held.
    asked.length = 0;
    assert.equal(await setReportRange("30d"), true);
    await settle();
    assert.equal(globalThis.location.hash, "#/reports/people", "a period is never in the address");
    assert.equal(of("reports_people"), "30d");
    assert.deepEqual(peopleReads(), [], "held and fresh");

    // And the days again, by the address alone (Back): held under their name, painted at once.
    globalThis.location.hash = `#/reports/people:${PICKED_KEY}`;
    assert.equal(reportsPeople.paintHeld(), true, "the days were read: painted before any read of them");
    assert.equal(of("reports_people"), PICKED_KEY);
  } finally {
    stop();
  }
});

test("days the report could not read leave the lens on the range the page shows, and the address with it", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    onLens();
    await reportsPeopleOverride.apply();
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
    assert.equal(globalThis.location.hash, "#/reports/people", "the address goes back to what the page shows");
    assert.equal(
      of("reports_people"),
      "30d",
      "the lens says thirty days again, though its own read of the days landed behind the pick",
    );
    assert.equal(followState("reports_people"), "current");
    assert.equal(shownReportPeriod(), "30d");
  } finally {
    stop();
  }
});

test("a write that makes the read wrong forgets it, and nothing reads it from the page the write was made on; a write that moves nothing it counts leaves it", async () => {
  const stop = startSurfaces([], () => () => {});
  try {
    reset("30d");
    await reportsPeopleOverride.apply();
    assert.equal(reportsPeople.isStale(), false);
    asked.length = 0;
    const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
    elsewhere("inbox");
    // A reply is a conversation's, and a hold moves nothing the lens counts: what it holds is left as it is.
    AFTER["POST conversations/[id]/reply"]();
    assert.notEqual(surfaceValue("reports_people"), undefined, "a reply forgets nothing of the lens's");
    assert.equal(reportsPeople.isStale(), false);
    // Who is in the book is what the lens counts: forgotten, and read as the lens comes on screen, not from the Inbox.
    AFTER["POST contacts/import"]();
    assert.equal(surfaceValue("reports_people"), undefined, "forgotten");
    assert.equal(reportsPeople.isStale(), true, "so the lens reads it as it comes on screen");
    assert.deepEqual(peopleReads(), [], "and it is not read from the Inbox");
    await reportsPeopleOverride.apply();
    forgetReportsPeople();
    assert.equal(surfaceValue("reports_people"), undefined, "forgetReportsPeople is the helper's forget");
  } finally {
    stop();
  }
});
