/**
 * Today's "Worth a look" and period line move while Today is open (surfaces/reports/headline.ts, decision 0047, task 1.1).
 *
 * They are printed from the headline, a small read of its own, and it had no live rule: "No reply: 3 customer messages" stayed at
 * 3 while the names under it, from the live queue, shrank to none, and "2 of the 9 people got onto the calendar" stayed at 2 after
 * a visit was booked. Now the headline is Today's own to read (surface-registry.ts), heard on messages, calls and visits while
 * Today is on screen and kept for it otherwise; it asks for a long wait (it is the dearest read there is, and moves by one in a
 * hundred for a message); a write that moves what it counts re-reads it where Today is on screen, in the writer's tab, without
 * blanking the band; and the business's midnight reads it, with Today, so "Today so far" is of the new day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { headlineOf } from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";
import { CALENDAR, reportDto } from "../_report-world.mjs";

installLegacyReact();
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
const listeners = new Map();
globalThis.document = {
  visibilityState: "visible",
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    listeners.get(type)?.delete(fn);
  },
};
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
const keepError = console.error;
console.error = () => {};
const { headline, reportsHeadlineOverride } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");
const { keepReportPeriod } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { surfaceValue, setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
const { ownsTheScreen, ROUTE_DRAWS } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
console.error = keepError;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  if (u.pathname.endsWith("/reports/headline"))
    return json(200, { ok: true, data: { headline: headlineOf(reportDto(), u.searchParams.get("period"), CALENDAR) } });
  return json(404, { ok: false, error: { code: "not_found", message: "no" } });
};

const at = (hash) => {
  globalThis.location.hash = hash;
};
const change = (table, event = "INSERT", row = {}) => ({ table, event, row });
const keysOf = (route) => AFTER[route]().map((o) => o.key);
const THREAD_WRITES = [
  "POST conversations/[id]/reply",
  "POST escalations/[id]/resolve",
  "POST conversations/[id]/take-over",
  "POST conversations/[id]/hand-back",
  "POST conversations/[id]/snooze",
  "POST conversations/[id]/wake",
  "POST conversations/[id]/archive",
  "POST messages/[id]/steer",
  "POST messages/[id]/cancel-send",
];

test("Today owns the headline it draws: its own page reads it, and no other page of those it draws beside its own", () => {
  assert.ok(ROUTE_DRAWS.today.includes("reports_headline"), "Today draws the headline");
  assert.equal(ownsTheScreen("reports_headline", "today"), true);
  for (const route of ["reports", "reports/receptionist", "clients", "inbox", "campaigns", "calendar"])
    assert.equal(ownsTheScreen("reports_headline", route), false, `not on ${route}`);
  // Today draws a good many surfaces and still owns only the headline, the replies to a reach-out and the setup band among them: a
  // message re-reads the three that draw messages (and Setup only for the first WhatsApp message, awaitsFirstMessage), People's
  // pages of contacts being the heaviest read there is.
  for (const key of ["calendar", "broadcasts", "playbooks", "notifications", "live", "google", "people"])
    assert.equal(ownsTheScreen(key, "today"), false, `Today does not own ${key}`);
  assert.equal(ownsTheScreen("today", "today"), true);
  // Of everything Today draws, exactly these three: a surface added to Today's draws is not owned unless it is named here.
  assert.deepEqual(ROUTE_DRAWS.today.filter((key) => ownsTheScreen(key, "today")).sort(), [
    "reach_out_replies",
    "reports_headline",
    "setup",
  ]);
});

test("its live-feed rule: messages, calls and visits, a long wait for a read this dear, heard while Today is on screen", () => {
  // And the people its booking line is "of the N people" (contacts, 0047), the calendar settings it reads (tenant_config, the wiring's
  // second audit, S3-4).
  assert.deepEqual(reportsHeadlineOverride.refreshOnTables, [
    "messages",
    "calls",
    "appointments",
    "contacts",
    "tenant_config",
  ]);
  assert.equal(reportsHeadlineOverride.refreshOnMessageInserts, undefined, "it names its tables");
  assert.equal(reportsHeadlineOverride.debounceMs, 15_000, "fifteen seconds after the last change");
  assert.equal(reportsHeadlineOverride.maxWaitMs, 30_000, "and never later than thirty after the first");
  assert.equal(reportsHeadlineOverride.readAtMidnight, true, "and when the day turns");
  assert.equal(reportsHeadlineOverride.onDemand, true, "still read only where it is drawn");
  for (const table of reportsHeadlineOverride.refreshOnTables) {
    at("#/today");
    assert.equal(reportsHeadlineOverride.refreshWhen(change(table)), true, `${table}: heard on Today`);
    for (const route of ["#/inbox", "#/reports", "#/clients", "#/campaigns"]) {
      at(route);
      assert.equal(reportsHeadlineOverride.refreshWhen(change(table)), false, `${table} on ${route}: kept for Today`);
    }
  }
  at("#/today");
});

test("a transcript turn of a call in progress asks for nothing; a call starting or ending does", () => {
  const call = (event, status) => change("calls", event, { status });
  for (const route of ["#/today", "#/inbox"]) {
    at(route);
    assert.equal(
      reportsHeadlineOverride.refreshWhen(call("UPDATE", "ongoing")),
      false,
      `${route}: a turn counts for nothing`,
    );
  }
  at("#/today");
  assert.equal(reportsHeadlineOverride.refreshWhen(call("INSERT", "ongoing")), true, "a call starting");
  assert.equal(reportsHeadlineOverride.refreshWhen(call("UPDATE", "ended")), true, "a call ending");
});

test("a burst is read once, fifteen seconds after the last change and never past thirty after the first", async (t) => {
  at("#/today");
  const reads = [];
  let feed = null;
  const stop = startSurfaces(
    [{ ...reportsHeadlineOverride, apply: async () => void reads.push(Date.now()) }],
    (onChange) => {
      feed = onChange;
      return () => {};
    },
  );
  try {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
    for (let i = 0; i < 30; i += 1) await new Promise((r) => setImmediate(r));
    assert.ok(feed, "the feed is joined once the boot is in");
    reads.length = 0;
    const flush = async () => {
      for (let i = 0; i < 30; i += 1) await Promise.resolve();
    };
    const advance = async (ms) => {
      t.mock.timers.tick(ms);
      await flush();
    };
    feed({ tenant_id: "t1" }, "messages", "INSERT");
    await advance(14_999);
    assert.deepEqual(reads, [], "not yet at fourteen seconds");
    await advance(1);
    assert.deepEqual(reads, [15_000], "one message: read at fifteen");
    reads.length = 0;
    const start = Date.now();
    feed({ tenant_id: "t1" }, "messages", "INSERT");
    await advance(10_000);
    feed({ tenant_id: "t1" }, "appointments", "UPDATE");
    await advance(10_000);
    feed({ tenant_id: "t1" }, "calls", "INSERT");
    await advance(10_000);
    assert.deepEqual(
      reads.map((at0) => at0 - start),
      [30_000],
      "a message, a visit and a call ten seconds apart: one read, thirty seconds from the first",
    );
  } finally {
    t.mock.timers.reset();
    stop();
  }
});

test("a thread write read from Today reads the headline again, and the band keeps its numbers until the read lands", () => {
  keepReportPeriod("7d");
  at("#/today");
  for (const route of THREAD_WRITES) {
    setSurfaceValue("reports_headline", { period: "7d" });
    const keys = keysOf(route);
    assert.equal(keys.filter((k) => k === "reports_headline").length, 1, `${route}: the headline, once: ${keys}`);
    assert.notEqual(
      surfaceValue("reports_headline"),
      undefined,
      `${route}: Worth a look is not blanked for the length of the read`,
    );
    assert.equal(headline.isStale(), true, `${route}: and what every period held is old`);
  }
  setSurfaceValue("reports_headline", undefined);
});

test("and from any other page it is forgotten, not read: Today reads it as it comes on screen", () => {
  keepReportPeriod("7d");
  for (const hash of ["#/inbox", "#/reports", "#/clients", "#/campaigns"]) {
    at(hash);
    for (const route of THREAD_WRITES) {
      setSurfaceValue("reports_headline", { period: "7d" });
      assert.equal(keysOf(route).includes("reports_headline"), false, `${route} on ${hash}: not read from there`);
      assert.equal(
        surfaceValue("reports_headline"),
        undefined,
        `${route} on ${hash}: and what Today printed is dropped`,
      );
      assert.equal(headline.isStale(), true, `${route} on ${hash}: so Today reads it on arrival`);
    }
  }
  at("#/today");
});

test("a zone saved reads the headline where Today is on screen, whose days are the zone's, and forgets it elsewhere", () => {
  keepReportPeriod("7d");
  at("#/today");
  setSurfaceValue("reports_headline", { period: "7d" });
  assert.equal(keysOf("PATCH workspaces").filter((k) => k === "reports_headline").length, 1, "read on Today");
  assert.notEqual(surfaceValue("reports_headline"), undefined, "and the band keeps its numbers until the read lands");
  for (const hash of ["#/inbox", "#/reports", "#/clients", "#/campaigns", "#/calendar"]) {
    at(hash);
    setSurfaceValue("reports_headline", { period: "7d" });
    assert.equal(keysOf("PATCH workspaces").includes("reports_headline"), false, `${hash}: not read from there`);
    assert.equal(surfaceValue("reports_headline"), undefined, `${hash}: forgotten`);
    assert.equal(headline.isStale(), true, `${hash}: so Today reads it as it comes on screen`);
  }
  at("#/today");
});

test("a settings save reads the headline where Today is on screen, whose Booking gap reads the calendar link, and forgets it elsewhere (W-visit-deal-4)", () => {
  // The booking pair is made from the calendar link and the zone (readers/report.ts bookingOf): a link connected or changed in
  // Settings left Today's "Booking gap" on the old answer until it aged.
  keepReportPeriod("7d");
  for (const route of ["PUT settings", "POST settings/receptionist"]) {
    at("#/today");
    setSurfaceValue("reports_headline", { period: "7d" });
    assert.equal(keysOf(route).filter((k) => k === "reports_headline").length, 1, `${route}: read on Today`);
    assert.notEqual(
      surfaceValue("reports_headline"),
      undefined,
      `${route}: the band keeps its numbers until the read lands`,
    );
    for (const hash of ["#/admin/workspace", "#/admin/integrations", "#/start", "#/calendar"]) {
      at(hash);
      setSurfaceValue("reports_headline", { period: "7d" });
      assert.equal(keysOf(route).includes("reports_headline"), false, `${route} on ${hash}: not read from there`);
      assert.equal(surfaceValue("reports_headline"), undefined, `${route} on ${hash}: forgotten`);
      assert.equal(headline.isStale(), true, `${route} on ${hash}: so Today reads it as it comes on screen`);
    }
  }
  at("#/today");
});

test("the thread writes keep what they re-read before", () => {
  at("#/inbox");
  assert.deepEqual(keysOf("POST conversations/[id]/reply"), ["inbox", "conversations", "today"]);
  at("#/today");
  assert.deepEqual(keysOf("POST conversations/[id]/reply"), ["inbox", "conversations", "today", "reports_headline"]);
});

test("the read that follows a write lands as what Today prints and holds the period again", async () => {
  at("#/today");
  keepReportPeriod("30d");
  setSurfaceValue("reports_headline", { period: "7d" });
  keysOf("POST conversations/[id]/reply");
  assert.equal(headline.isStale(), true, "nothing is held after the write");
  await reportsHeadlineOverride.apply();
  assert.equal(headline.isStale(), false, "and the read holds it");
  assert.equal(surfaceValue("reports_headline").period, "30d");
});
