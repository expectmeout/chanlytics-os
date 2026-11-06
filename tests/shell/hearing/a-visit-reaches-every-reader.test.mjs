/**
 * A visit's outcome reaches every page that counts visits (docs/decisions/0047, task 1.1 of the wiring plan).
 *
 * #1549 made a member's word on a visit (kept, missed, cancelled) and #1551 made People, the playbooks' pools, Reports' booking
 * line and a person's page read that word, and the write re-read the Calendar alone: People kept the old Next visit, Campaigns
 * counted a missed visit as a reminder owed, the headline kept its booking gap. Run on the real refresh map and the real
 * overrides: the mark re-reads, in the writer's tab, what counts visits (and, by the lens pattern, forgets the reads of the
 * pages that draw them elsewhere; New, which counts with the playbooks read (decision 0065), and the audiences on Sent's page,
 * where they are drawn, and left for those pages elsewhere: the wiring's second
 * audit, S10-6); and the pages that count visits hear the `appointments` table, which a teammate's mark, a
 * booking email and the hourly calendar read write: People on every page (a few a day; the Inbox's visit chip and Today's
 * "Asked, never booked" are drawn from its read), the playbooks, the audiences and the lenses on their own page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { headlineOf } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { CALENDAR, reportDto } from "../../reports/_report-world.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.dispatchEvent ??= () => true;
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const route = u.pathname.replace("/api/v1/", "");
  if (route === "reports")
    return json(200, { ok: true, data: { report: reportDto(), booking: CALENDAR, deals: null, profile: null } });
  if (route === "reports/headline")
    return json(200, {
      ok: true,
      data: { headline: headlineOf(reportDto(), u.searchParams.get("period"), CALENDAR) },
    });
  return json(404, { ok: false, error: { code: "not_found", message: "no" } });
};

const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const { readWhatWasMissed } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { setStatus } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { peopleOverride } = await importSrc("apps/dashboard/src/surfaces/people/surface.ts");
const { playbooksOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");
const { audiencesOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/audiences-surface.ts");
const { receptionist, receptionistOverride } = await importSrc(
  "apps/dashboard/src/surfaces/reports/receptionist-surface.ts",
);
const { headline } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");
const { reportsOverride, paintHeldReports, keepReportPeriod } = await importSrc(
  "apps/dashboard/src/surfaces/reports/surface.ts",
);

const MARK = "POST calendar/visits/[id]";
const keysOf = (route) => AFTER[route]().map((o) => o.key);
const at = (hash) => {
  globalThis.location.hash = hash;
};
const heldLenses = () => {
  setSurfaceValue("reports_headline", { period: "7d" });
  setSurfaceValue("reports_people", { dto: {}, key: "7d" });
  setSurfaceValue("reports_receptionist", { dto: {}, key: "7d", readAt: 1 });
};
const forgottenLenses = () =>
  ["reports_headline", "reports_people", "reports_receptionist"].filter((k) => surfaceValue(k) === undefined);
const change = (table, event = "UPDATE") => ({ table, event, row: {} });

test("a visit marked kept, missed or cancelled re-reads the Calendar and People in the writer's tab, and the playbooks and the audiences where the page draws them", () => {
  at("#/calendar");
  assert.deepEqual(keysOf(MARK), ["calendar", "people"], "the Calendar draws neither composer");
  at("#/inbox");
  assert.deepEqual(
    keysOf(MARK),
    ["calendar", "people"],
    "the Inbox draws Sent's runs waiting for your word, which count no visit (the Inbox's run review, 18 Oct 2026)",
  );
  at("#/campaigns/sequences/new:once");
  assert.deepEqual(
    keysOf(MARK),
    ["calendar", "people", "playbooks"],
    "New counts who each moment and list reaches with the playbooks read (decision 0065)",
  );
  at("#/broadcasts");
  assert.deepEqual(
    keysOf(MARK),
    ["calendar", "people", "playbooks", "audiences"],
    "and Sent's page, which draws both: a run's campaign, and who each audience reaches",
  );
  at("#/outbound");
  assert.deepEqual(keysOf(MARK), ["calendar", "people", "playbooks"], "and the playbooks' own page, the playbooks");
  at("#/campaigns");
  assert.deepEqual(keysOf(MARK), ["calendar", "people"], "and its landing, Sequences' list, neither");
  at("#/today");
});

test("and what counts the visit on a page that draws it is read there: Today's headline, day strip and queue on Today, the overview on Reports, a lens on its own page", () => {
  at("#/today");
  assert.deepEqual(keysOf(MARK), ["calendar", "people", "playbooks", "reports_headline"], "Today");
  at("#/reports");
  assert.deepEqual(keysOf(MARK), ["calendar", "people", "reports"], "the overview");
  at("#/reports/people");
  assert.deepEqual(
    keysOf(MARK),
    ["calendar", "people", "reports", "reports_people"],
    "the People lens, on the report it draws from",
  );
  at("#/reports/receptionist");
  assert.deepEqual(keysOf(MARK), ["calendar", "people", "reports", "reports_receptionist"], "the Receptionist lens");
  at("#/today");
});

test("marked on the Calendar, the composers are left for the pages that draw them, and read once as one comes on screen: Today, which draws the playbooks and owns none, or each one's own page (S10-6)", () => {
  // Today's day strip prints each visit playbook's "N people"; Today owns none of them, so a keep that waited for their own pages
  // (whereDrawn) would have left the strip on the old count. Its queue draws Sent's runs, which count no visit, and none of the
  // audiences, which are the composer's.
  const win = {
    // A move's owed reads are made once its motion is over (legacy-bridge/hearing/after-the-move.ts): no motion here.
    __afterTheMoveMs: 0,
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  const read = [];
  const stop = readWhatWasMissed([playbooksOverride, audiencesOverride], (k) => read.push(...k), win);
  try {
    // What the tests above left for these pages is read once; then nothing is owed.
    at("#/today");
    win.on?.();
    read.length = 0;
    at("#/calendar");
    keysOf(MARK);
    win.on?.();
    assert.deepEqual(read, [], "nothing of them is read on the Calendar");
    at("#/today");
    win.on?.();
    assert.deepEqual(
      read,
      ["playbooks"],
      "the playbooks, once, as Today comes on screen; the audiences are not drawn there",
    );
    at("#/outbound");
    win.on?.();
    assert.deepEqual(read, ["playbooks"], "and nothing is owed once they are read");
    at("#/broadcasts");
    win.on?.();
    assert.deepEqual(
      read,
      ["playbooks", "audiences"],
      "the audiences as Sent's page comes on screen, which draws them",
    );
    at("#/calendar");
    win.on?.();
    keysOf(MARK);
    at("#/campaigns");
    win.on?.();
    assert.deepEqual(read, ["playbooks", "audiences"], "Campaigns' landing draws neither: still owed");
    at("#/campaigns/sequences/new:once");
    win.on?.();
    assert.deepEqual(
      read,
      ["playbooks", "audiences", "playbooks"],
      "or the playbooks as New comes on screen, which counts with them (decision 0065)",
    );
    at("#/outbound");
    win.on?.();
    assert.deepEqual(read, ["playbooks", "audiences", "playbooks"], "and nothing more as their own page does");
  } finally {
    stop();
    at("#/today");
  }
});

test("off those pages the reads are forgotten, not made: each is read as its page comes on screen", async () => {
  for (const hash of ["#/inbox", "#/clients", "#/calendar", "#/campaigns"]) {
    at(hash);
    heldLenses();
    keepReportPeriod("7d");
    await reportsOverride.apply();
    assert.equal(paintHeldReports(), true, `${hash}: a read of Reports is held before the mark`);
    const keys = keysOf(MARK);
    for (const key of ["reports_headline", "reports", "reports_people", "reports_receptionist"])
      assert.equal(keys.includes(key), false, `${hash}: ${key} is not read from here`);
    assert.deepEqual(
      forgottenLenses(),
      ["reports_headline", "reports_people", "reports_receptionist"],
      `${hash}: and what the three held is dropped`,
    );
    assert.equal(headline.isStale(), true, `${hash}: so Today reads the headline as it comes on screen`);
    assert.equal(paintHeldReports(), false, `${hash}: and no pick paints a Reports read from before the mark`);
  }
  at("#/today");
});

test("a Reports read forgotten off its page is kept for it: the overview reads once as Reports comes on screen", () => {
  const win = {
    // A move's owed reads are made once its motion is over (legacy-bridge/hearing/after-the-move.ts): no motion here.
    __afterTheMoveMs: 0,
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  const read = [];
  setStatus("reports", "live");
  const stop = readWhatWasMissed(
    [{ key: "reports", onDemand: true, isStale: () => false }],
    (k) => read.push(...k),
    win,
  );
  try {
    // What the earlier tests left owed is read once; then, without the mark, nothing is owed and nothing is read on arrival.
    at("#/inbox");
    win.on?.();
    at("#/reports");
    win.on?.();
    read.length = 0;
    at("#/inbox");
    win.on?.();
    at("#/reports");
    win.on?.();
    assert.deepEqual(read, [], "a Reports read that nothing made old is not read again on arrival");
    at("#/inbox");
    win.on?.();
    keysOf(MARK);
    assert.deepEqual(read, [], "nothing is read from the Inbox");
    at("#/reports");
    win.on?.();
    assert.deepEqual(read, ["reports"], "Reports reads what the mark made old, once, as it comes on screen");
  } finally {
    stop();
    at("#/today");
  }
});

test("People hears the appointments the live feed tells a workspace of on every page, and its messages on its own page alone", () => {
  assert.ok(
    watchedTables().includes("appointments"),
    "the database already tells a workspace about its visits (00345)",
  );
  assert.ok(peopleOverride.refreshOnTables.includes("appointments"), "People names the table");
  assert.equal(wantsRefresh(peopleOverride, "appointments"), true, "and wants it");
  // The Inbox's visit chip and Today's "Asked, never booked" are drawn from People's read, so a visit that moves is read wherever the
  // owner is: the page the chip is on is not People's.
  for (const route of ["#/clients", "#/inbox", "#/today", "#/calendar", "#/campaigns", "#/reports"]) {
    at(route);
    for (const event of ["INSERT", "UPDATE", "DELETE"])
      assert.equal(
        wantsRefresh(peopleOverride, "appointments", change("appointments", event)),
        true,
        `${event} on ${route}`,
      );
  }
  // And nothing is kept for People's page: a message is still its page's alone.
  at("#/inbox");
  assert.equal(
    wantsRefresh(peopleOverride, "messages", change("messages", "INSERT")),
    false,
    "a message waits for People",
  );
  at("#/clients");
  assert.equal(wantsRefresh(peopleOverride, "messages", change("messages", "INSERT")), true, "and is heard on it");
  at("#/today");
});

test("the playbooks and the audiences hear the appointments the live feed tells a workspace of, each on its own page", () => {
  for (const [o, home, away] of [
    [playbooksOverride, "#/outbound", "#/inbox"],
    // Who each audience reaches leaves a missed visit's person out: away is the Inbox, which draws Sent's runs alone.
    [audiencesOverride, "#/broadcasts", "#/inbox"],
  ]) {
    assert.ok(o.refreshOnTables.includes("appointments"), `${o.key} names the table`);
    assert.equal(wantsRefresh(o, "appointments"), true, `${o.key} wants it`);
    at(home);
    for (const event of ["INSERT", "UPDATE", "DELETE"])
      assert.equal(
        wantsRefresh(o, "appointments", change("appointments", event)),
        true,
        `${o.key}: ${event} on ${home}`,
      );
    at(away);
    assert.equal(
      wantsRefresh(o, "appointments", change("appointments")),
      false,
      `${o.key}: kept for its page on ${away}`,
    );
    // The tables a surface heard before are heard as they were.
    assert.equal(
      wantsRefresh(o, "messages", change("messages", "INSERT")),
      false,
      `${o.key}: a message, still its page's`,
    );
  }
  at("#/today");
});

test("an appointment passed over on another page is read once when the playbooks' page comes on screen; People owes nothing", () => {
  const win = {
    // A move's owed reads are made once its motion is over (legacy-bridge/hearing/after-the-move.ts): no motion here.
    __afterTheMoveMs: 0,
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  const read = [];
  const stop = readWhatWasMissed([peopleOverride, playbooksOverride], (k) => read.push(...k), win);
  try {
    // What the tests above left owed (a message kept for People's page) is read once; then nothing is owed.
    at("#/clients");
    win.on?.();
    read.length = 0;
    at("#/inbox");
    win.on?.();
    assert.equal(
      peopleOverride.refreshWhen(change("appointments")),
      true,
      "People hears it here, and reads it at once",
    );
    playbooksOverride.refreshWhen(change("appointments"));
    assert.deepEqual(read, [], "nothing is read from the Inbox");
    at("#/clients");
    win.on?.();
    assert.deepEqual(read, [], "People was not kept for its page: it was read when the visit moved");
    at("#/inbox");
    win.on?.();
    at("#/campaigns");
    win.on?.();
    assert.deepEqual(read, [], "Campaigns' landing draws no playbook");
    at("#/campaigns/sequences/new:once");
    win.on?.();
    assert.deepEqual(
      read,
      ["playbooks"],
      "the playbooks once, as New comes on screen, which counts with them (decision 0065)",
    );
    at("#/outbound");
    win.on?.();
    assert.deepEqual(read, ["playbooks"], "and nothing more on their own page");
  } finally {
    stop();
    at("#/today");
  }
});

test("the Receptionist lens counts links booked from visits, so it hears them while it is on screen", () => {
  assert.ok(receptionistOverride.refreshOnTables.includes("appointments"));
  assert.equal(wantsRefresh(receptionistOverride, "appointments"), true);
  at("#/reports/receptionist");
  assert.equal(wantsRefresh(receptionistOverride, "appointments", change("appointments")), true);
  at("#/reports/people");
  assert.equal(wantsRefresh(receptionistOverride, "appointments", change("appointments")), false, "kept for the lens");
  assert.equal(receptionistOverride.debounceMs, 800, "and waits as it did");
  assert.equal(typeof receptionist.forget, "function");
  at("#/today");
});

test("the Reports overview hears deals and visits, which its Deals section and booking line count, while it is on screen", () => {
  for (const table of ["deals", "appointments"]) {
    assert.ok(reportsOverride.refreshOnTables.includes(table), `${table} is named`);
    assert.equal(wantsRefresh(reportsOverride, table), true, `${table} is wanted`);
    at("#/reports");
    assert.equal(wantsRefresh(reportsOverride, table, change(table)), true, `${table}: heard on Reports`);
    at("#/reports/receptionist");
    assert.equal(
      wantsRefresh(reportsOverride, table, change(table)),
      true,
      `${table}: and on a lens, which draws from it`,
    );
    at("#/today");
    assert.equal(wantsRefresh(reportsOverride, table, change(table)), false, `${table}: kept for Reports on Today`);
  }
  // The messages it heard before, by the rule it had.
  for (const table of ["messages", "conversations", "escalations"])
    assert.equal(wantsRefresh(reportsOverride, table), true, `${table} is still heard`);
  assert.equal(reportsOverride.debounceMs, 800);
  // The sends are the Campaigns lens's own read, which this one does not make: a run finishing moves nothing here.
  assert.equal(wantsRefresh(reportsOverride, "broadcasts"), false);
});

test("a deal recorded and the zone saved read the Reports overview only where it is on screen, and forget it elsewhere; a yes, a stop and a merge no longer name it", async () => {
  // The write made while Reports is open reads it at once; made anywhere else it is forgotten, and Reports reads it as it comes on
  // screen (the lenses' rule). The consent writes no longer name it at all (the campaigns are the lens's); a deal and the zone do.
  for (const route of ["POST contacts/[id]/deal", "PATCH workspaces"]) {
    at("#/inbox");
    keepReportPeriod("7d");
    await reportsOverride.apply();
    assert.equal(paintHeldReports(), true, `${route}: a read of Reports is held`);
    assert.equal(keysOf(route).includes("reports"), false, `${route}: not read from the Inbox`);
    assert.equal(paintHeldReports(), false, `${route}: and what was held is dropped`);
    at("#/reports");
    assert.equal(keysOf(route).filter((k) => k === "reports").length, 1, `${route}: read once on Reports`);
    at("#/reports/receptionist");
    assert.equal(keysOf(route).filter((k) => k === "reports").length, 1, `${route}: and on a lens`);
  }
  // A yes, a stop and a merge do not count in it: they neither read it, wherever the tab is, nor make what it holds old.
  for (const route of [
    "PUT contacts/[id]/consent",
    "PUT contacts/[id]/marketing-consent",
    "PUT contacts/consent",
    "PUT contacts/marketing-consent",
    "POST contacts/[id]/merge",
  ]) {
    for (const hash of ["#/inbox", "#/reports"]) {
      at(hash);
      keepReportPeriod("7d");
      await reportsOverride.apply();
      assert.equal(keysOf(route).includes("reports"), false, `${route} on ${hash}: the overview is not read`);
      assert.equal(paintHeldReports(), true, `${route} on ${hash}: and what it holds is not made old`);
    }
  }
  at("#/today");
});
