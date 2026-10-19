/**
 * A surface marked `onDemand` (surface-data.ts) is read where it is drawn and nowhere else: the boot's two passes leave it alone unless
 * the page on screen draws it, a return to the tab and the shell's Retry-all read only what is drawn here, and a page that draws it
 * has it read as it comes on screen: once, and again when it says it has aged. Run on the real runner and the real routes' registry
 * (`reports` is Reports' own surface; `reports_headline` is one Today draws; `reports_reviews`, `reports_receptionist` and
 * `reports_people` are ones only their own lens draws; `reports_campaigns` is the Campaigns lens's, which the Overview draws too, for
 * one fact; `google` is one Today and Settings' Connections pane draw, and no other page), the way LegacyApp wires
 * them, each read recorded rather than made. Campaigns' own 30 days went with the composer's Every time, their last
 * reader (the closed-loop audit of 17 Oct 2026, G). A surface not marked behaves as it always did.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { historyOf, legacyAddress } from "../../shell/address/_address.mjs";

const heard = new Map();
const win = {
  // A move's owed reads are made once its motion is over (legacy-bridge/hearing/after-the-move.ts): no motion here.
  __afterTheMoveMs: 0,
  __ACTIVE_WORKSPACE: "ws-1",
  location: { pathname: "/w/acme", search: "", hash: "#/today", assign() {}, replace() {}, reload() {} },
  addEventListener(type, fn) {
    if (!heard.has(type)) heard.set(type, new Set());
    heard.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    heard.get(type)?.delete(fn);
  },
  dispatchEvent(ev) {
    for (const fn of [...(heard.get(ev.type) ?? [])]) fn(ev);
    return true;
  },
};
globalThis.window = win;
historyOf(win);
const docHeard = new Map();
globalThis.document = {
  visibilityState: "visible",
  title: "",
  addEventListener: (type, fn) => docHeard.set(type, fn),
  removeEventListener: (type) => docHeard.delete(type),
};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 14) => {
  for (let i = 0; i < n; i += 1) await tick();
};
win.__shell = (await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts")).addressApi(win);
win.CHANLY = { nav() {}, address: await legacyAddress() };
const runner = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const status = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const registry = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { reportsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { reportsHeadlineOverride } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");
const { reviewsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/reviews-surface.ts");
const { receptionistOverride } = await importSrc("apps/dashboard/src/surfaces/reports/receptionist-surface.ts");
const { reportsPeopleOverride } = await importSrc("apps/dashboard/src/surfaces/reports/people-surface.ts");
const { reportsCampaignsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/campaigns-surface.ts");
const { googleOverride } = await importSrc("apps/dashboard/src/legacy-bridge/google.ts");
const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");

let aged = false;
let reviewsAged = false;
let receptionistAged = false;
let peopleAged = false;
let campaignsAged = false;
/** The real keys, so the registry's own routes decide what a page draws: the page's own, ones it draws, and ones it does not. */
const world = (asked) => {
  const read = (key, extra = {}) => ({ key, apply: async () => void asked.push(key), ...extra });
  return [
    read("workspace"),
    read("today"),
    read("inbox"),
    read("reports", { onDemand: true }),
    read("reports_headline", { onDemand: true, isStale: () => aged }),
    read("reports_reviews", { onDemand: true, isStale: () => reviewsAged }),
    read("reports_receptionist", { onDemand: true, isStale: () => receptionistAged }),
    read("reports_people", { onDemand: true, isStale: () => peopleAged }),
    // The Campaigns lens's, which the Overview draws for one fact too.
    read("reports_campaigns", { onDemand: true, isStale: () => campaignsAged }),
    // Google's own marks and its own measure of age, over a read that holds what the real one does: the answer, and when it was made.
    read("google", {
      onDemand: googleOverride.onDemand,
      isStale: googleOverride.isStale,
      apply: async () => {
        asked.push("google");
        setSurfaceValue("google", { dto: { listing: null }, fetchedAt: Date.now() });
      },
    }),
  ];
};
/** The Google read this tab holds, made `ms` ago. */
const heldGoogleFrom = (ms) => setSurfaceValue("google", { dto: { listing: null }, fetchedAt: Date.now() - ms });
/** A runner over them, wired as LegacyApp wires it; `go` moves the address as Back does, `away` leaves the tab and comes back. */
async function running(hash) {
  win.location.hash = hash;
  const asked = [];
  const overrides = world(asked);
  const stop = runner.startSurfaces(overrides, () => () => {});
  const off = registry.readWhatWasMissed(
    overrides,
    (keys) => void runner.refreshSurfaces(overrides.filter((o) => keys.includes(o.key))),
    win,
  );
  await settle(30);
  return {
    asked,
    overrides,
    take: () => asked.splice(0).sort(),
    go: async (to) => {
      win.location.hash = to;
      win.dispatchEvent({ type: "popstate" });
      await settle();
    },
    away: async (ms) => {
      const on = docHeard.get("visibilitychange");
      globalThis.document.visibilityState = "hidden";
      on();
      const real = Date.now;
      Date.now = () => real() + ms;
      globalThis.document.visibilityState = "visible";
      on();
      Date.now = real;
      await settle();
    },
    stop: () => {
      stop();
      off();
    },
  };
}

test("on Today neither pass reads Reports' three routes: what Today draws, and the strangers not marked, are read as ever", async () => {
  const r = await running("#/today");
  try {
    assert.deepEqual(
      r.take(),
      ["google", "inbox", "reports_headline", "today", "workspace"],
      "REGRESSION: every page's boot read the report beside its own (and `reports` is Reports' own surface: three routes)",
    );
    assert.equal(status.isSurfaceReady("reports"), false, "never read: nothing of it is held");
    assert.equal(
      status.isSurfaceReady("reports_reviews"),
      false,
      "nor the Reviews lens's, drawn on no page but its own",
    );
    assert.equal(
      status.isSurfaceReady("reports_receptionist"),
      false,
      "nor the Receptionist lens's, drawn on no page but its own",
    );
    assert.equal(status.isSurfaceReady("reports_people"), false, "nor the People lens's, drawn on no page but its own");
    assert.equal(
      status.isSurfaceReady("reports_campaigns"),
      false,
      "nor the Campaigns lens's, drawn on its lens and on the Overview alone",
    );
    // A quick return reads nothing while every surface that ought to be live is: an unread on-demand surface must not defeat that.
    await r.away(1_000);
    assert.deepEqual(r.take(), [], "REGRESSION: one unread surface made every return read every surface again");
    // A long absence reads what is drawn here, and still not what is not.
    await r.away(10 * 60_000);
    assert.deepEqual(
      r.take(),
      ["google", "inbox", "reports_headline", "today", "workspace"],
      "a return reads what Today draws",
    );
    // The shell's Retry-all, the same.
    await runner.refreshAllSurfaces();
    assert.deepEqual(
      r.take(),
      ["google", "inbox", "reports_headline", "today", "workspace"],
      "Retry-all on Today does not read Reports",
    );
  } finally {
    r.stop();
  }
});

test("moving to Reports reads its surface once and its gate opens; moving back to Today reads nothing new", async () => {
  const r = await running("#/today");
  try {
    r.take();
    assert.equal(status.isSurfaceReady("reports"), false);
    assert.equal(status.isSurfaceReady("reports_campaigns"), false);
    await r.go("#/reports");
    assert.deepEqual(
      r.take(),
      ["reports", "reports_campaigns"],
      "read as its page comes on screen, once, and the Campaigns read the Overview draws for one fact: not the Reviews lens's, which is not drawn",
    );
    assert.equal(
      status.isSurfaceReady("reports"),
      true,
      "the gate (`__surfaceGate`) opens when the read lands: no page waits for ever",
    );
    assert.equal(status.isSurfaceReady("reports_campaigns"), true, "and so does the Campaigns read's");
    await r.go("#/reports/pipeline");
    assert.deepEqual(r.take(), [], "a move between its lenses reads nothing");
    await r.go("#/reports/campaigns");
    assert.deepEqual(
      r.take(),
      [],
      "nor to the Campaigns lens: the Overview read what it draws, and it is held and fresh",
    );
    await r.go("#/today");
    assert.deepEqual(r.take(), [], "back on Today: the headline is held and fresh, and Reports is not read");
    // The headline aged while away: coming back to Today reads it again, once. Reports is not Today's, and is left.
    aged = true;
    await r.go("#/reports");
    r.take();
    await r.go("#/today");
    assert.deepEqual(r.take(), ["reports_headline"], "an aged headline is read again as Today comes back");
    aged = false;
    // What is asked for by name is made wherever the page is: a zone saved reads the report.
    await runner.refreshSurfaces([r.overrides.find((o) => o.key === "reports")]);
    assert.deepEqual(r.take(), ["reports"], "a named refresh is a request: the caller knows");
    await runner.refreshSurfaces([r.overrides.find((o) => o.key === "reports_reviews")]);
    assert.deepEqual(r.take(), ["reports_reviews"], "and the Reviews lens's read too, off its lens");
    await runner.refreshSurfaces([r.overrides.find((o) => o.key === "reports_receptionist")]);
    assert.deepEqual(r.take(), ["reports_receptionist"], "and the Receptionist lens's, off its lens");
    await runner.refreshSurfaces([r.overrides.find((o) => o.key === "reports_people")]);
    assert.deepEqual(r.take(), ["reports_people"], "and the People lens's, off its lens");
    await runner.refreshSurfaces([r.overrides.find((o) => o.key === "reports_campaigns")]);
    assert.deepEqual(r.take(), ["reports_campaigns"], "and the Campaigns lens's, off its pages (a write's refresh)");
  } finally {
    r.stop();
  }
});

test("a page that opens on Reports reads its surface in its own pass, and neither the headline nor an unmarked stranger is mistaken for it", async () => {
  status.setStatus("reports_campaigns", "seeded");
  const r = await running("#/reports");
  try {
    assert.deepEqual(
      r.take(),
      ["inbox", "reports", "reports_campaigns", "today", "workspace"],
      "Reports' own, the Campaigns read the Overview draws for one fact, and the unmarked strangers: not the headline Today draws, and not the Reviews, Receptionist or People lens's read",
    );
    assert.equal(status.isSurfaceReady("reports_campaigns"), true, "its gate opens when its read lands");
  } finally {
    r.stop();
  }
});

test("a page that opens on the Campaigns lens reads Reports' surface and its own beside it, in its own pass, and neither the headline Today draws nor another lens's is part of it", async () => {
  status.setStatus("reports_campaigns", "seeded");
  const r = await running("#/reports/campaigns");
  try {
    assert.deepEqual(
      r.take(),
      ["inbox", "reports", "reports_campaigns", "today", "workspace"],
      "the frame's read (every lens draws from it) and the lens's own, which no other lens reads",
    );
    assert.equal(status.isSurfaceReady("reports_campaigns"), true, "its gate opens when its read lands");
  } finally {
    r.stop();
  }
});

test("a page that opens on the Reviews lens reads Reports' surface and its own beside it, in its own pass, and the headline Today draws is no part of it", async () => {
  const r = await running("#/reports/reviews");
  try {
    assert.deepEqual(
      r.take(),
      ["inbox", "reports", "reports_reviews", "today", "workspace"],
      "the frame's read (every lens draws from it) and the lens's own, which no other lens reads",
    );
    assert.equal(status.isSurfaceReady("reports_reviews"), true, "its gate opens when its read lands");
  } finally {
    r.stop();
  }
});

test("a page that opens on the Receptionist lens reads Reports' surface and its own beside it, in its own pass, and neither the headline Today draws nor the Reviews lens's is part of it", async () => {
  const r = await running("#/reports/receptionist");
  try {
    assert.deepEqual(
      r.take(),
      ["inbox", "reports", "reports_receptionist", "today", "workspace"],
      "the frame's read (every lens draws from it) and the lens's own, which no other lens reads",
    );
    assert.equal(status.isSurfaceReady("reports_receptionist"), true, "its gate opens when its read lands");
  } finally {
    r.stop();
  }
});

test("a page that opens on the People lens reads Reports' surface and its own beside it, in its own pass, and neither the headline Today draws nor another lens's is part of it", async () => {
  const r = await running("#/reports/people");
  try {
    assert.deepEqual(
      r.take(),
      ["inbox", "reports", "reports_people", "today", "workspace"],
      "the frame's read (every lens draws from it) and the lens's own, which no other lens reads",
    );
    assert.equal(status.isSurfaceReady("reports_people"), true, "its gate opens when its read lands");
  } finally {
    r.stop();
  }
});

test("moving to the Reviews lens reads its surface once, and leaving it and coming back reads nothing until it ages", async () => {
  // The tests before this one read both: it starts from the two never read, as a tab that opened on Today.
  for (const key of ["reports", "reports_reviews", "reports_campaigns"]) status.setStatus(key, "seeded");
  const r = await running("#/today");
  try {
    r.take();
    await r.go("#/reports");
    assert.deepEqual(
      r.take(),
      ["reports", "reports_campaigns"],
      "the Overview draws the report and the Campaigns read for one fact, not this lens's",
    );
    await r.go("#/reports/reviews");
    assert.deepEqual(
      r.take(),
      ["reports_reviews"],
      "read as its lens comes on screen: Reports' own is held, and is left",
    );
    assert.equal(status.isSurfaceReady("reports_reviews"), true);
    await r.go("#/reports/pipeline");
    assert.deepEqual(r.take(), [], "a move to another lens reads nothing");
    await r.go("#/reports/reviews");
    assert.deepEqual(r.take(), [], "back on the lens, held and fresh: nothing is read");
    await r.go("#/today");
    assert.deepEqual(r.take(), [], "and Today does not draw it");
    // It aged while away: coming back to the lens reads it again, once; Reports' own, with no `isStale`, is left.
    reviewsAged = true;
    await r.go("#/reports/reviews");
    assert.deepEqual(r.take(), ["reports_reviews"], "an aged read is made again as the lens comes back");
    reviewsAged = false;
    await r.go("#/reports/campaigns");
    await r.go("#/reports/reviews");
    assert.deepEqual(r.take(), [], "and once: the next arrival reads nothing new");
  } finally {
    reviewsAged = false;
    r.stop();
  }
});

test("moving to the Receptionist lens reads its surface once, and leaving it and coming back reads nothing until it ages; the Reviews lens beside it is another lens's read", async () => {
  // The tests before this one read them: it starts from the three never read, as a tab that opened on Today.
  for (const key of ["reports", "reports_reviews", "reports_receptionist", "reports_campaigns"])
    status.setStatus(key, "seeded");
  const r = await running("#/today");
  try {
    r.take();
    await r.go("#/reports");
    assert.deepEqual(
      r.take(),
      ["reports", "reports_campaigns"],
      "the Overview draws the report and the Campaigns read for one fact, not this lens's",
    );
    await r.go("#/reports/receptionist");
    assert.deepEqual(
      r.take(),
      ["reports_receptionist"],
      "read as its lens comes on screen: Reports' own is held, and is left",
    );
    assert.equal(status.isSurfaceReady("reports_receptionist"), true);
    await r.go("#/reports/pipeline");
    assert.deepEqual(r.take(), [], "a move to another lens reads nothing");
    await r.go("#/reports/receptionist");
    assert.deepEqual(r.take(), [], "back on the lens, held and fresh: nothing is read");
    await r.go("#/reports/reviews");
    assert.deepEqual(r.take(), ["reports_reviews"], "the Reviews lens reads its own, and not the Receptionist lens's");
    await r.go("#/reports/receptionist");
    assert.deepEqual(r.take(), [], "and back on the Receptionist lens, still held and fresh");
    await r.go("#/today");
    assert.deepEqual(r.take(), [], "and Today does not draw it");
    // It aged while away: coming back to the lens reads it again, once; Reports' own, with no `isStale`, is left.
    receptionistAged = true;
    await r.go("#/reports/receptionist");
    assert.deepEqual(r.take(), ["reports_receptionist"], "an aged read is made again as the lens comes back");
    receptionistAged = false;
    await r.go("#/reports/campaigns");
    await r.go("#/reports/receptionist");
    assert.deepEqual(r.take(), [], "and once: the next arrival reads nothing new");
  } finally {
    receptionistAged = false;
    reviewsAged = false;
    r.stop();
  }
});

test("moving to the People lens reads its surface once, and leaving it and coming back reads nothing until it ages; the Receptionist lens beside it is another lens's read", async () => {
  // The tests before this one read them: it starts from the four never read, as a tab that opened on Today.
  for (const key of ["reports", "reports_reviews", "reports_receptionist", "reports_people", "reports_campaigns"])
    status.setStatus(key, "seeded");
  const r = await running("#/today");
  try {
    r.take();
    await r.go("#/reports");
    assert.deepEqual(
      r.take(),
      ["reports", "reports_campaigns"],
      "the Overview draws the report and the Campaigns read for one fact, not this lens's",
    );
    await r.go("#/reports/people");
    assert.deepEqual(
      r.take(),
      ["reports_people"],
      "read as its lens comes on screen: Reports' own is held, and is left",
    );
    assert.equal(status.isSurfaceReady("reports_people"), true);
    await r.go("#/reports/pipeline");
    assert.deepEqual(r.take(), [], "a move to another lens reads nothing");
    await r.go("#/reports/people");
    assert.deepEqual(r.take(), [], "back on the lens, held and fresh: nothing is read");
    await r.go("#/reports/receptionist");
    assert.deepEqual(
      r.take(),
      ["reports_receptionist"],
      "the Receptionist lens reads its own, and not the People lens's",
    );
    await r.go("#/reports/people");
    assert.deepEqual(r.take(), [], "and back on the People lens, still held and fresh");
    await r.go("#/today");
    assert.deepEqual(r.take(), [], "and Today does not draw it");
    // It aged while away: coming back to the lens reads it again, once; Reports' own, with no `isStale`, is left.
    peopleAged = true;
    await r.go("#/reports/people");
    assert.deepEqual(r.take(), ["reports_people"], "an aged read is made again as the lens comes back");
    peopleAged = false;
    await r.go("#/reports/campaigns");
    await r.go("#/reports/people");
    assert.deepEqual(r.take(), [], "and once: the next arrival reads nothing new");
  } finally {
    peopleAged = false;
    receptionistAged = false;
    r.stop();
  }
});

test("the Campaigns read is the Overview's, for one fact, and its lens's: read as the first of them comes on screen, held for the other, and read again once it has aged by whichever is on screen; no other lens of Reports reads it", async () => {
  // The tests before this one read them: it starts from the five never read, as a tab that opened on Today.
  for (const key of ["reports", "reports_reviews", "reports_receptionist", "reports_people", "reports_campaigns"])
    status.setStatus(key, "seeded");
  const r = await running("#/today");
  try {
    r.take();
    await r.go("#/reports/campaigns");
    assert.deepEqual(
      r.take(),
      ["reports", "reports_campaigns"],
      "read as its lens comes on screen, with the report every lens draws from",
    );
    assert.equal(status.isSurfaceReady("reports_campaigns"), true);
    await r.go("#/reports");
    assert.deepEqual(r.take(), [], "the Overview draws it for one fact, and finds it held and fresh");
    await r.go("#/reports/pipeline");
    assert.deepEqual(r.take(), [], "the Pipeline lens draws none of it");
    await r.go("#/reports/people");
    assert.deepEqual(r.take(), ["reports_people"], "the People lens reads its own, and not the Campaigns lens's");
    await r.go("#/reports/campaigns");
    assert.deepEqual(r.take(), [], "back on the lens, still held and fresh");
    await r.go("#/today");
    assert.deepEqual(r.take(), [], "and Today does not draw it");
    // It aged while away: coming back to the Overview reads it again, once, and so does the lens when it has aged again.
    campaignsAged = true;
    await r.go("#/reports");
    assert.deepEqual(r.take(), ["reports_campaigns"], "an aged read is made again as the Overview comes on screen");
    campaignsAged = false;
    await r.go("#/reports/campaigns");
    assert.deepEqual(r.take(), [], "and once: the lens finds what the Overview read");
    await r.go("#/today");
    campaignsAged = true;
    await r.go("#/reports/campaigns");
    assert.deepEqual(r.take(), ["reports_campaigns"], "an aged read is made again as the lens comes back");
  } finally {
    campaignsAged = false;
    peopleAged = false;
    r.stop();
  }
});

test("Google is read where it is drawn, Today's line and Settings' Connections pane, and no other page's boot, return or arrival reads it", async () => {
  // A tab that opened on the Inbox: nothing of Google's was read, and nothing is held.
  status.setStatus("google", "seeded");
  setSurfaceValue("google", undefined);
  const r = await running("#/inbox");
  try {
    assert.equal(r.take().includes("google"), false, "the Inbox's boot, both passes, does not read it");
    assert.equal(surfaceValue("google"), undefined, "nothing of it is held");
    for (const hash of [
      "#/reports",
      "#/reports/reviews",
      "#/reports/receptionist",
      "#/reports/people",
      "#/calendar",
      "#/admin/workspace",
      "#/admin/team",
    ]) {
      await r.go(hash);
      assert.equal(r.take().includes("google"), false, `${hash} does not draw it`);
    }
    await r.away(10 * 60_000);
    assert.equal(r.take().includes("google"), false, "a return, off its pages, leaves it for them");
    await runner.refreshAllSurfaces();
    assert.equal(r.take().includes("google"), false, "and so does the shell's Retry-all");
    // Settings' Connections pane draws it: read as the pane comes on screen, once, and the Settings panes beside it do not.
    await r.go("#/admin/integrations");
    assert.deepEqual(r.take(), ["google"], "read as the pane comes on screen");
    assert.notEqual(surfaceValue("google"), undefined, "and held");
    await r.go("#/admin/team");
    await r.go("#/admin/integrations");
    assert.deepEqual(r.take(), [], "back on the pane, held and fresh: nothing is read");
    // Today's card draws it too, and finds it held.
    await r.go("#/today");
    assert.equal(r.take().includes("google"), false, "Today draws it, and what the pane read is held and fresh");
    // A refresh asked for by name is made wherever the page is (a write's, as the refresh map names it).
    await r.go("#/inbox");
    await runner.refreshSurfaces([r.overrides.find((o) => o.key === "google")]);
    assert.deepEqual(r.take(), ["google"], "a named refresh is a request: the caller knows");
  } finally {
    r.stop();
    setSurfaceValue("google", undefined);
  }
});

test("a page that opens on Settings' Connections pane reads Google in its own pass, and one that opens on another pane does not", async () => {
  status.setStatus("google", "seeded");
  setSurfaceValue("google", undefined);
  const pane = await running("#/admin/integrations");
  try {
    assert.deepEqual(
      pane.take(),
      ["google", "inbox", "today", "workspace"],
      "the pane's own pass reads it, beside the strangers not marked",
    );
    assert.notEqual(surfaceValue("google"), undefined, "and held");
  } finally {
    pane.stop();
  }
  status.setStatus("google", "seeded");
  setSurfaceValue("google", undefined);
  const other = await running("#/admin/team");
  try {
    assert.deepEqual(other.take(), ["inbox", "today", "workspace"], "Team draws nothing of Google's");
    assert.equal(surfaceValue("google"), undefined, "and nothing of it is held");
  } finally {
    other.stop();
    setSurfaceValue("google", undefined);
  }
});

test("Google's read ages by its own time: five minutes old it is read again as a page that draws it comes on screen, and not before", async () => {
  status.setStatus("google", "seeded");
  setSurfaceValue("google", undefined);
  const r = await running("#/today");
  try {
    assert.deepEqual(r.take(), ["google", "inbox", "reports_headline", "today", "workspace"], "read at Today's boot");
    await r.go("#/inbox");
    r.take();
    heldGoogleFrom(4 * 60_000);
    await r.go("#/today");
    assert.deepEqual(r.take(), [], "four minutes old: held, and Today comes back with it");
    await r.go("#/inbox");
    heldGoogleFrom(6 * 60_000);
    await r.go("#/today");
    assert.deepEqual(r.take(), ["google"], "six minutes old: read again as Today comes back");
    assert.equal(Date.now() - surfaceValue("google").fetchedAt < 60_000, true, "and held as of now");
    // The Connections pane asks the same of what Today read.
    await r.go("#/admin/team");
    heldGoogleFrom(6 * 60_000);
    await r.go("#/admin/integrations");
    assert.deepEqual(r.take(), ["google"], "an aged read is made again as the pane comes on screen");
    // Held at all is what a page that draws it asks first: a tab that lost it (a failed cache) reads it as the page arrives.
    await r.go("#/inbox");
    setSurfaceValue("google", undefined);
    await r.go("#/today");
    assert.deepEqual(r.take(), ["google"], "nothing held: read, as a read never made");
    // A page that does not draw it leaves an old one alone, however old.
    await r.go("#/inbox");
    heldGoogleFrom(60 * 60_000);
    await r.go("#/reports");
    await r.go("#/calendar");
    assert.equal(r.take().includes("google"), false, "an hour old, and no page on screen draws it: not read");
  } finally {
    r.stop();
    setSurfaceValue("google", undefined);
  }
});

test("the six overrides that read Reports are the six marked, and nothing else in this part is", () => {
  assert.equal(reportsOverride.onDemand, true, "the report, which the Campaigns lens's reads are no part of");
  assert.equal(reportsHeadlineOverride.onDemand, true);
  assert.equal(typeof reportsHeadlineOverride.isStale, "function", "a headline ages: the page that draws it asks");
  assert.equal(reviewsOverride.onDemand, true, "what the Reviews lens draws, read where it is drawn");
  assert.equal(typeof reviewsOverride.isStale, "function", "a read of reviews ages: the lens that draws it asks");
  assert.equal(receptionistOverride.onDemand, true, "what the Receptionist lens draws, read where it is drawn");
  assert.equal(
    typeof receptionistOverride.isStale,
    "function",
    "a read of the receptionist ages: the lens that draws it asks",
  );
  assert.equal(reportsPeopleOverride.onDemand, true, "what the People lens draws, read where it is drawn");
  assert.equal(
    typeof reportsPeopleOverride.isStale,
    "function",
    "a read of the people ages: the lens that draws it asks",
  );
  assert.equal(
    reportsCampaignsOverride.onDemand,
    true,
    "what the Campaigns lens draws, and the Overview for one fact, read where drawn",
  );
  assert.equal(
    typeof reportsCampaignsOverride.isStale,
    "function",
    "a read of the campaigns ages: the pages that draw it ask",
  );
  assert.equal(
    reportsOverride.isStale,
    undefined,
    "Reports' own is kept current by its live-feed rule and by its page's arrival",
  );
});

test("the real registry names the Reviews lens's read for that lens alone, and the page it draws it on owns it", () => {
  assert.deepEqual(registry.routeDrawsFor("reports", "reviews"), ["reports_reviews"]);
  assert.equal(registry.ownsTheScreen("reports_reviews", "reports/reviews"), true);
  assert.equal(
    registry.ownsTheScreen("reports_reviews", "reports/reviews:2026-09-01~2026-09-20"),
    true,
    "over days a member picked the lens is still the lens",
  );
  for (const route of [
    "reports",
    "reports/people",
    "reports/campaigns",
    "reports/2026-09-01~2026-09-20",
    "reports/people:2026-09-01~2026-09-20",
    "today",
    "inbox",
  ])
    assert.equal(registry.ownsTheScreen("reports_reviews", route), false, route);
  for (const route of ["reports/2026-09-01~2026-09-20", "reports/people:2026-09-01~2026-09-20"])
    assert.equal(registry.ownsTheScreen("reports", route), true, `${route}: Reports' own read is the page's`);
  assert.equal(
    registry.ownsTheScreen("reports_reviews", "reports/receptionist"),
    false,
    "and the Receptionist lens is not the Reviews lens's page",
  );
});

test("the real registry names the Receptionist lens's read for that lens alone, and the page it draws it on owns it", () => {
  assert.deepEqual(registry.routeDrawsFor("reports", "receptionist"), ["reports_receptionist"]);
  assert.deepEqual(
    registry.routeDrawsFor("reports", "receptionist:2026-09-01~2026-09-20"),
    ["reports_receptionist"],
    "over days a member picked it is still the lens's",
  );
  assert.equal(registry.ownsTheScreen("reports_receptionist", "reports/receptionist"), true);
  assert.equal(
    registry.ownsTheScreen("reports_receptionist", "reports/receptionist:2026-09-01~2026-09-20"),
    true,
    "over days a member picked the lens is still the lens",
  );
  for (const route of [
    "reports",
    "reports/people",
    "reports/reviews",
    "reports/campaigns",
    "reports/2026-09-01~2026-09-20",
    "reports/people:2026-09-01~2026-09-20",
    "today",
    "inbox",
  ])
    assert.equal(registry.ownsTheScreen("reports_receptionist", route), false, route);
  assert.equal(
    registry.ownsTheScreen("reports", "reports/receptionist"),
    true,
    "the page's own surface is still its own",
  );
  assert.equal(
    registry.ownsTheScreen("reports_people", "reports/receptionist"),
    false,
    "and the People lens's read is not drawn there",
  );
});

test("the real registry names the People lens's read for that lens alone, and the page it draws it on owns it", () => {
  assert.deepEqual(registry.routeDrawsFor("reports", "people"), ["reports_people"]);
  assert.deepEqual(
    registry.routeDrawsFor("reports", "people:2026-09-01~2026-09-20"),
    ["reports_people"],
    "over days a member picked it is still the lens's",
  );
  assert.equal(registry.ownsTheScreen("reports_people", "reports/people"), true);
  assert.equal(
    registry.ownsTheScreen("reports_people", "reports/people:2026-09-01~2026-09-20"),
    true,
    "over days a member picked the lens is still the lens",
  );
  for (const route of [
    "reports",
    "reports/receptionist",
    "reports/reviews",
    "reports/pipeline",
    "reports/campaigns",
    "reports/2026-09-01~2026-09-20",
    "reports/receptionist:2026-09-01~2026-09-20",
    "today",
    "inbox",
    "clients",
  ])
    assert.equal(registry.ownsTheScreen("reports_people", route), false, route);
  assert.equal(registry.ownsTheScreen("reports", "reports/people"), true, "the page's own surface is still its own");
  assert.equal(
    registry.ownsTheScreen("reports_reviews", "reports/people"),
    false,
    "the Reviews lens's is not drawn there",
  );
});

test("the real registry names the Campaigns read for that lens and for the Overview, and the pages it draws it on own it; the Pipeline lens and the other lenses do not", () => {
  const DAYS = "2026-09-01~2026-09-20";
  for (const [lens, param] of [
    ["the Overview", null],
    ["the Overview over days", DAYS],
    ["the Campaigns lens", "campaigns"],
    ["the Campaigns lens over days", `campaigns:${DAYS}`],
  ])
    assert.deepEqual(registry.routeDrawsFor("reports", param), ["reports_campaigns"], lens);
  for (const route of ["reports", `reports/${DAYS}`, "reports/campaigns", `reports/campaigns:${DAYS}`])
    assert.equal(registry.ownsTheScreen("reports_campaigns", route), true, route);
  for (const route of [
    "reports/people",
    "reports/receptionist",
    "reports/reviews",
    "reports/pipeline",
    `reports/people:${DAYS}`,
    `reports/pipeline:${DAYS}`,
    "today",
    "inbox",
    "campaigns",
    "broadcasts",
    "clients",
  ])
    assert.equal(registry.ownsTheScreen("reports_campaigns", route), false, route);
  assert.equal(registry.ownsTheScreen("reports", "reports/campaigns"), true, "the page's own surface is still its own");
  for (const key of ["reports_reviews", "reports_receptionist", "reports_people"])
    assert.equal(registry.ownsTheScreen(key, "reports/campaigns"), false, `${key} is not drawn there`);
  assert.equal(
    registry.ownsTheScreen("reports_campaigns", "campaigns"),
    false,
    "and Campaigns, Sequences' list, draws none of this lens's reads",
  );
});

test("Google is marked and ages by the read's own time, and the real registry names its read for Today and for the Connections pane alone", () => {
  assert.equal(
    googleOverride.onDemand,
    true,
    "what Today's line and Settings' Connections pane draw, read where drawn",
  );
  assert.equal(typeof googleOverride.isStale, "function", "a read of Google ages: the page that draws it asks");
  setSurfaceValue("google", undefined);
  assert.equal(googleOverride.isStale(), true, "nothing held: it wants a read");
  for (const [ms, stale] of [
    [0, false],
    [4 * 60_000, false],
    [6 * 60_000, true],
    [24 * 60 * 60_000, true],
  ]) {
    heldGoogleFrom(ms);
    assert.equal(
      googleOverride.isStale(),
      stale,
      `a read made ${ms / 60_000} minutes ago is ${stale ? "" : "not "}stale`,
    );
  }
  setSurfaceValue("google", undefined);
  assert.equal(registry.routeDrawsFor("today").includes("google"), true, "Today's card draws its review line from it");
  // Beside the channels' read, whose WhatsApp and phone rows it draws too (surfaces/channels/surface.ts).
  assert.deepEqual(
    registry.routeDrawsFor("admin", "integrations"),
    ["google", "channels"],
    "the Connections pane draws it",
  );
  assert.deepEqual(registry.routeSurfaces("admin", "integrations"), ["workspace", "settings", "google", "channels"]);
  // No other pane of Settings, no lens of Reports (the Reviews, Receptionist and People lenses draw their own reads) and no other page draws it.
  for (const [page, param] of [
    ["admin", null],
    ["admin", "workspace"],
    ["admin", "team"],
    ["admin", "billing"],
    ["reports", null],
    ["reports", "reviews"],
    ["reports", "receptionist"],
    ["reports", "people"],
    ["inbox", null],
    ["start", null],
  ])
    assert.equal(registry.routeSurfaces(page, param).includes("google"), false, `${page}/${param ?? ""}`);
});

test("a return that leaves Reports out keeps it for its page: after a long absence on Today, Reports is read once as it comes on screen", async () => {
  const r = await running("#/today");
  try {
    await r.go("#/reports");
    await r.go("#/today");
    r.take();
    // Away for long: the return reads what Today draws and leaves Reports, which it would have read, for its page.
    await r.away(10 * 60_000);
    assert.equal(r.take().includes("reports"), false, "Today's return does not read Reports");
    await r.go("#/reports");
    assert.deepEqual(
      r.take(),
      ["reports", "reports_campaigns"],
      "REGRESSION: Reports came on screen with what it held from before the absence, and was never read again (and the Campaigns read its Overview draws, with it)",
    );
    await r.go("#/today");
    r.take();
    await r.go("#/reports");
    assert.deepEqual(r.take(), [], "kept once: the next arrival reads nothing new");
  } finally {
    r.stop();
  }
});

test("a return that leaves the Reviews lens out keeps it for its lens: it is read once as the lens comes on screen, and by no other lens of Reports", async () => {
  const r = await running("#/today");
  try {
    await r.go("#/reports/reviews");
    await r.go("#/today");
    r.take();
    await r.away(10 * 60_000);
    assert.equal(r.take().includes("reports_reviews"), false, "Today's return does not read it");
    await r.go("#/reports/pipeline");
    assert.equal(r.take().includes("reports_reviews"), false, "nor does Reports' other lens");
    await r.go("#/reports/reviews");
    assert.deepEqual(
      r.take(),
      ["reports_reviews"],
      "REGRESSION: the lens came on screen with what it held from before the absence, and was never read again",
    );
    await r.go("#/reports/pipeline");
    await r.go("#/reports/reviews");
    assert.deepEqual(r.take(), [], "kept once: the next arrival reads nothing new");
  } finally {
    r.stop();
  }
});

test("a return that leaves the Receptionist lens out keeps it for its lens: it is read once as the lens comes on screen, and by no other lens of Reports", async () => {
  const r = await running("#/today");
  try {
    await r.go("#/reports/receptionist");
    await r.go("#/today");
    r.take();
    await r.away(10 * 60_000);
    assert.equal(r.take().includes("reports_receptionist"), false, "Today's return does not read it");
    await r.go("#/reports/pipeline");
    assert.equal(r.take().includes("reports_receptionist"), false, "nor does Reports' other lens");
    await r.go("#/reports/reviews");
    assert.equal(r.take().includes("reports_receptionist"), false, "nor does the Reviews lens");
    await r.go("#/reports/receptionist");
    assert.deepEqual(
      r.take(),
      ["reports_receptionist"],
      "REGRESSION: the lens came on screen with what it held from before the absence, and was never read again",
    );
    await r.go("#/reports/pipeline");
    await r.go("#/reports/receptionist");
    assert.deepEqual(r.take(), [], "kept once: the next arrival reads nothing new");
  } finally {
    r.stop();
  }
});

test("a return that leaves the People lens out keeps it for its lens: it is read once as the lens comes on screen, and by no other lens of Reports", async () => {
  const r = await running("#/today");
  try {
    await r.go("#/reports/people");
    await r.go("#/today");
    r.take();
    await r.away(10 * 60_000);
    assert.equal(r.take().includes("reports_people"), false, "Today's return does not read it");
    await r.go("#/reports/pipeline");
    assert.equal(r.take().includes("reports_people"), false, "nor does Reports' other lens");
    await r.go("#/reports/receptionist");
    assert.equal(r.take().includes("reports_people"), false, "nor does the Receptionist lens");
    await r.go("#/reports/people");
    assert.deepEqual(
      r.take(),
      ["reports_people"],
      "REGRESSION: the lens came on screen with what it held from before the absence, and was never read again",
    );
    await r.go("#/reports/pipeline");
    await r.go("#/reports/people");
    assert.deepEqual(r.take(), [], "kept once: the next arrival reads nothing new");
  } finally {
    r.stop();
  }
});

test("a return that leaves the Campaigns read out keeps it for the pages that draw it: it is read once as its lens or the Overview comes on screen, and by no other lens of Reports", async () => {
  const r = await running("#/today");
  try {
    await r.go("#/reports/campaigns");
    await r.go("#/today");
    r.take();
    await r.away(10 * 60_000);
    assert.equal(r.take().includes("reports_campaigns"), false, "Today's return does not read it");
    await r.go("#/reports/pipeline");
    assert.equal(r.take().includes("reports_campaigns"), false, "nor does Reports' Pipeline lens");
    await r.go("#/reports/people");
    assert.equal(r.take().includes("reports_campaigns"), false, "nor does the People lens");
    await r.go("#/reports/campaigns");
    assert.deepEqual(
      r.take(),
      ["reports_campaigns"],
      "REGRESSION: the lens came on screen with what it held from before the absence, and was never read again",
    );
    await r.go("#/reports/pipeline");
    await r.go("#/reports/campaigns");
    assert.deepEqual(r.take(), [], "kept once: the next arrival reads nothing new");
    // The Overview draws it for one fact, and is the page that reads what a long absence left, as the lens is.
    await r.go("#/today");
    r.take();
    await r.away(10 * 60_000);
    r.take();
    await r.go("#/reports");
    assert.equal(r.take().includes("reports_campaigns"), true, "the Overview reads it once, as it comes on screen");
    await r.go("#/reports/campaigns");
    assert.deepEqual(r.take(), [], "and the lens finds it held and fresh");
  } finally {
    r.stop();
  }
});

test("a rejoin of the live feed reads the gap of what is drawn here, and keeps Reports for its page", async () => {
  win.location.hash = "#/today";
  const asked = [];
  // The feed's statuses, as the runner's join hears them.
  let onStatus = () => {};
  const read = (key, extra = {}) => ({ key, debounceMs: 0, apply: async () => void asked.push(key), ...extra });
  const overrides = [
    read("workspace"),
    read("today", { refreshOnMessageInserts: true }),
    read("inbox", { refreshOnMessageInserts: true }),
    read("reports", { onDemand: true, refreshOnMessageInserts: true }),
    read("reports_reviews", { onDemand: true, refreshOnMessageInserts: true }),
    read("reports_receptionist", { onDemand: true, refreshOnMessageInserts: true }),
    read("reports_people", { onDemand: true, refreshOnMessageInserts: true }),
    read("reports_campaigns", { onDemand: true, refreshOnMessageInserts: true }),
  ];
  const stop = runner.startSurfaces(overrides, (_onChange, opts) => {
    onStatus = opts.onStatus;
    return () => {};
  });
  const off = registry.readWhatWasMissed(
    overrides,
    (keys) => void runner.refreshSurfaces(overrides.filter((o) => keys.includes(o.key))),
    win,
  );
  try {
    await settle(30);
    asked.length = 0;
    onStatus("SUBSCRIBED");
    onStatus("CHANNEL_ERROR");
    onStatus("SUBSCRIBED");
    await settle(30);
    assert.deepEqual(
      asked.splice(0).sort(),
      ["inbox", "today"],
      "REGRESSION: every rejoin of the feed read Reports' three routes on whatever page was on screen",
    );
    win.location.hash = "#/reports";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      asked.splice(0).sort(),
      ["reports", "reports_campaigns"],
      "the gap is read where Reports is drawn, as it comes on screen: the report, and the Campaigns read the Overview draws for one fact",
    );
    win.location.hash = "#/reports/reviews";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      asked.splice(0),
      ["reports_reviews"],
      "and the Reviews lens's, where it is drawn: Reports' own is held",
    );
    win.location.hash = "#/reports/receptionist";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      asked.splice(0),
      ["reports_receptionist"],
      "and the Receptionist lens's, where it is drawn: neither Reports' own nor the Reviews lens's is read again",
    );
    win.location.hash = "#/reports/people";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      asked.splice(0),
      ["reports_people"],
      "and the People lens's, where it is drawn: none of the others' is read again",
    );
    win.location.hash = "#/reports/campaigns";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      asked.splice(0),
      [],
      "and the Campaigns lens finds what the Overview read for its fact: held, and read again by no rejoin",
    );
  } finally {
    stop();
    off();
  }
});

test("Retry reads what the status line names: a surface read only where it is drawn, stopped refreshing off its page, is read by Retry wherever it is", async () => {
  const r = await running("#/today");
  try {
    r.take();
    // Reports' last read failed after a good one (a write's refresh by name, made on another page): the line says Reports
    // stopped refreshing, with its Retry, on whatever page is on screen.
    status.setStatus("reports", "degraded");
    await runner.refreshAllSurfaces();
    assert.equal(
      r.take().includes("reports"),
      true,
      "REGRESSION: Retry read everything but what the line said had stopped, and the line stayed",
    );
    assert.equal(status.getSurfaceStatuses().get("reports"), "live", "and the line has nothing left to say");
    // One that has not stopped is still left for its page.
    await runner.refreshAllSurfaces();
    assert.equal(r.take().includes("reports"), false, "Retry on Today does not read a Reports that is live");
  } finally {
    r.stop();
  }
});

test("a page reached for reads what it draws only when drawn, before the press: Reports is in when it is opened, and nothing is read for it twice", async () => {
  // Reports is read on no other page's boot, so its first press in a session read its three routes behind "Reading…"
  // (9 Oct 2026, production: 470 to 700 ms on a desk, where a page read at boot drew in under 60).
  for (const key of ["reports", "reports_reviews", "reports_receptionist", "reports_people", "reports_campaigns"])
    status.setStatus(key, "seeded");
  const { onRouteReachedFor } = await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");
  const r = await running("#/today");
  try {
    r.take();
    // As LegacyApp wires it: a reach is the address's `warm`, which the sidebar's rows and the phone's drawer call.
    onRouteReachedFor(
      registry.warmWhatItDraws(
        r.overrides,
        (keys) => void runner.refreshSurfaces(r.overrides.filter((o) => keys.includes(o.key))),
      ),
    );
    win.__shell.warm("reports");
    await settle();
    assert.deepEqual(
      r.take(),
      ["reports", "reports_campaigns"],
      "read as it is reached for, with the Campaigns read its Overview draws for one fact; the Reviews lens's own is its lens's",
    );
    assert.equal(status.getSurfaceStatuses().get("reports"), "live", "so it is in before its page is asked for");
    assert.equal(status.getSurfaceStatuses().get("reports_campaigns"), "live", "and so is the Campaigns read");
    // Reached for again, then opened: it is in, and neither reads it a second time.
    win.__shell.warm("reports");
    await settle();
    await r.go("#/reports");
    assert.deepEqual(r.take(), [], "REGRESSION: the press read the report again behind Reading…");
    await r.go("#/today");
    r.take();
    // A page read at boot is nobody's to warm: its surface is in. Nor is one whose on-demand reads are already in.
    for (const route of ["inbox", "today", "admin/workspace", "nowhere"]) win.__shell.warm(route);
    await settle();
    assert.deepEqual(r.take(), [], "a reach for a page the boot read asks for nothing");
    // The lens with a read of its own is reached for by its own address.
    win.__shell.warm("reports/reviews");
    await settle();
    assert.deepEqual(r.take(), ["reports_reviews"], "and Reports' own is not read again for it");
    win.__shell.warm("reports/receptionist");
    await settle();
    assert.deepEqual(r.take(), ["reports_receptionist"], "the Receptionist lens, the same: by its own address alone");
    win.__shell.warm("reports/people");
    await settle();
    assert.deepEqual(r.take(), ["reports_people"], "and the People lens, the same: by its own address alone");
    win.__shell.warm("reports/campaigns");
    await settle();
    assert.deepEqual(
      r.take(),
      [],
      "the Campaigns lens shares the Overview's read, which is in: nothing is asked twice",
    );
    // A long absence on Today leaves Reports for its page (keepForItsPage). Reached for, it is read then, and owes the
    // press nothing: it used to be read as it was reached for and again as its page arrived.
    await r.away(10 * 60_000);
    r.take();
    win.__shell.warm("reports");
    await settle();
    assert.deepEqual(
      r.take(),
      ["reports", "reports_campaigns"],
      "what a pass left for its page is read as the page is reached for",
    );
    await r.go("#/reports");
    assert.deepEqual(r.take(), [], "REGRESSION: read as it was reached for, and again as it arrived");
  } finally {
    onRouteReachedFor(null);
    r.stop();
  }
});

test("a warm that failed is asked for once, and the page still reads its surface as it comes on screen", async () => {
  status.setStatus("reports", "seeded");
  status.setStatus("reports_campaigns", "seeded");
  const { onRouteReachedFor } = await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");
  const r = await running("#/today");
  const reports = r.overrides.find((o) => o.key === "reports");
  const real = reports.apply;
  try {
    r.take();
    let fail = true;
    reports.apply = async () => {
      r.asked.push("reports");
      if (fail) throw new Error("offline");
    };
    onRouteReachedFor(
      registry.warmWhatItDraws(
        r.overrides,
        (keys) => void runner.refreshSurfaces(r.overrides.filter((o) => keys.includes(o.key))),
      ),
    );
    win.__shell.warm("reports");
    await settle();
    assert.deepEqual(
      r.take(),
      ["reports", "reports_campaigns"],
      "the report fails; the Campaigns read beside it is its own",
    );
    assert.notEqual(status.getSurfaceStatuses().get("reports"), "live", "a read that failed is not a read");
    assert.equal(status.getSurfaceStatuses().get("reports_campaigns"), "live", "and the other is in");
    win.__shell.warm("reports");
    await settle();
    assert.deepEqual(r.take(), [], "a pointer that crosses the row again does not ask again");
    fail = false;
    await r.go("#/reports");
    assert.deepEqual(r.take(), ["reports"], "its page reads it as it always did");
    assert.equal(status.getSurfaceStatuses().get("reports"), "live");
  } finally {
    reports.apply = real;
    onRouteReachedFor(null);
    r.stop();
  }
});
