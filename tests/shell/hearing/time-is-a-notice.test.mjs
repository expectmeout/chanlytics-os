/**
 * Time is a notice nobody sends (decision 0058, amended for the wiring's second audit, lane R8): what a page says of the clock
 * moves with no record changing, so no notice of the feed ever tells it. The runner keeps one clock (legacy-bridge/hearing/
 * clock.ts), and every surface whose view model is made with the moment says how it keeps up with it.
 *
 *  1. The clock, run with a stand-in window and a clock of the test's own: a surface that is made again from what it holds
 *     (`rederive`) is made again each minute where a page that draws it is on screen, as such a page comes on screen and as the
 *     tab comes back, and anywhere once the business's day has turned since it was made; a hidden tab makes nothing. A surface
 *     whose source tells nothing (`readEveryMs`) is read again once it is that old where it is drawn; one holding a fact the
 *     server made by the read's clock (`validUntil`) is read again once that has passed, once.
 *     And anything the feed tells of that the page draws is read again once its last read is a quarter of an hour old (the
 *     rolling heal, lane R9).
 *  2. Who keeps up: every surface the shell registers whose module hands the moment to a builder (a call given `new Date()`,
 *     `Date.now()` or a `now`) says how it keeps up with it, a re-make, a read at midnight, an aged read or the rolling heal
 *     (the feed tells of it), or is listed below with why. The list may only fall. And the surfaces the findings named carry what they were given: Today, the Calendar,
 *     People, the playbooks and Sent's runs are made again; the Calendar is read every five minutes where it is drawn and at
 *     midnight; People is read again once its first next visit has ended; the playbooks are read at midnight.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { MIN_MS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { parse } from "../../_ast.mjs";
import { registeredSurfaces } from "./_reads.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
globalThis.location.pathname = "/w/studio";
globalThis.document ??= { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
globalThis.window.dispatchEvent ??= () => true;
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "A", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

const { watchTheClock, HEAL_AFTER_MS } = await importSrc("apps/dashboard/src/legacy-bridge/hearing/clock.ts");
const { surfaceMoved } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 1. The clock                                                                                                             *
 * ------------------------------------------------------------------------------------------------------------------------ */

/** A window the clock reads: an address, its listeners, and what it is told. */
function standInWindow(hash) {
  const heard = new Map();
  return {
    location: { pathname: "/w/studio", hash },
    __WORKSPACES: [{ id: "t1", slug: "studio", name: "A", status: "active", timezone: "America/New_York" }],
    __ACTIVE_WORKSPACE: "t1",
    localStorage: { getItem: () => null, setItem() {} },
    told: [],
    addEventListener(type, fn) {
      heard.set(type, [...(heard.get(type) ?? []), fn]);
    },
    removeEventListener(type, fn) {
      heard.set(
        type,
        (heard.get(type) ?? []).filter((f) => f !== fn),
      );
    },
    dispatchEvent(e) {
      this.told.push(e.type);
      return true;
    },
    /** Move to another page, as a Back press does. */
    go(to) {
      this.location.hash = `#/${to}`;
      for (const fn of heard.get("popstate") ?? []) fn();
    },
  };
}

/** A tab's visibility, and its listeners, as the document says them. */
function standInDocument(state = "visible") {
  const heard = [];
  const doc = {
    visibilityState: state,
    addEventListener: (_t, fn) => heard.push(fn),
    removeEventListener: (_t, fn) => heard.splice(heard.indexOf(fn), 1),
    show() {
      doc.visibilityState = "visible";
      for (const fn of [...heard]) fn();
    },
  };
  return doc;
}

/** A surface that records each time it is made again, and says it moved. */
const remade = (key, made, extra = {}) => ({
  key,
  events: [`surface:${key}`],
  reads: [],
  fresh: "live",
  apply: async () => {},
  rederive: (now) => {
    made.push([key, now.getTime()]);
    return true;
  },
  ...extra,
});

/** 2 PM in New York, 3 October 2026, a hair past a minute's turn. */
const T0 = Date.parse("2026-10-03T18:00:00.000Z") + 100;

test("a surface drawn on the page on screen is made again at each minute's turn; one not drawn there is not", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
  const was = globalThis.document;
  globalThis.document = standInDocument();
  const win = standInWindow("#/today");
  const made = [];
  // The calendar and the playbooks are drawn on Today (ROUTE_DRAWS); Leads is not.
  const run = {
    overrides: [remade("calendar", made), remade("playbooks", made), remade("leads", made)],
    readFrom: () => undefined,
    asked: () => false,
    read: () => {},
    stopped: () => false,
  };
  const stop = watchTheClock(run, win);
  try {
    t.mock.timers.tick(MIN_MS);
    assert.deepEqual(
      made.map(([k]) => k),
      ["calendar", "playbooks"],
      "the two Today draws, once",
    );
    assert.deepEqual(win.told, ["surface:calendar", "surface:playbooks"], "and the pages that draw them are told");
    t.mock.timers.tick(MIN_MS);
    assert.equal(made.length, 4, "again at the next minute's turn");
    assert.equal(
      made.some(([k]) => k === "leads"),
      false,
      "never Leads, which Today does not draw",
    );
  } finally {
    stop();
    globalThis.document = was;
  }
});

test("a page coming on screen makes again what it draws, and a surface made by a read is not made again that minute", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
  const was = globalThis.document;
  globalThis.document = standInDocument();
  const win = standInWindow("#/today");
  const made = [];
  const run = {
    overrides: [remade("leads", made), remade("calendar", made)],
    readFrom: () => undefined,
    asked: () => false,
    read: () => {},
    stopped: () => false,
  };
  const stop = watchTheClock(run, win);
  try {
    // The calendar's read lands this minute: it was made with the moment.
    surfaceMoved("calendar");
    win.go("clients/leads");
    assert.deepEqual(
      made.map(([k]) => k),
      ["leads"],
      "Leads, as its page comes on screen",
    );
    win.go("calendar");
    assert.deepEqual(
      made.map(([k]) => k),
      ["leads"],
      "the calendar was made by its read this minute",
    );
  } finally {
    stop();
    globalThis.document = was;
  }
});

test("once the business's day has turned, a surface is made again wherever it is drawn, on a page that does not draw it too", (t) => {
  // 11:59 PM in New York on the 3rd: the day turns a minute on.
  const lateEvening = Date.parse("2026-10-04T03:59:00.000Z") + 100;
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: lateEvening });
  const was = globalThis.document;
  globalThis.document = standInDocument();
  const win = standInWindow("#/inbox");
  const made = [];
  const run = {
    overrides: [remade("people", made)],
    readFrom: () => undefined,
    asked: () => false,
    read: () => {},
    stopped: () => false,
  };
  const stop = watchTheClock(run, win);
  try {
    // People was made by its read on the 3rd, and the Inbox does not draw it.
    surfaceMoved("people");
    t.mock.timers.tick(MIN_MS);
    assert.deepEqual(
      made.map(([k]) => k),
      ["people"],
      "a step due at midnight is said on the thread's header",
    );
    t.mock.timers.tick(MIN_MS);
    assert.equal(made.length, 1, "and once: the day has not turned again");
  } finally {
    stop();
    globalThis.document = was;
  }
});

test("a hidden tab makes nothing, and makes what is due as it is shown", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
  const was = globalThis.document;
  const doc = standInDocument("hidden");
  globalThis.document = doc;
  const win = standInWindow("#/today");
  const made = [];
  const run = {
    overrides: [remade("calendar", made)],
    readFrom: () => undefined,
    asked: () => false,
    read: () => {},
    stopped: () => false,
  };
  const stop = watchTheClock(run, win);
  try {
    t.mock.timers.tick(3 * MIN_MS);
    assert.deepEqual(made, [], "hidden: nothing");
    doc.show();
    assert.equal(made.length, 1, "shown: made once, at once");
  } finally {
    stop();
    globalThis.document = was;
  }
});

test("a surface whose source tells nothing is read again once it is that old, where it is drawn; one past what it holds was true until, once", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
  const was = globalThis.document;
  globalThis.document = standInDocument();
  const win = standInWindow("#/today");
  const reads = [];
  // Each read began a second before the clock started, so its ages fall on the minute's turns.
  const began = T0 - 1_000;
  const from = new Map([
    ["calendar", began],
    ["people", began],
    ["leads", began],
  ]);
  const surface = (key, extra) => ({ key, reads: [], fresh: "live", apply: async () => {}, ...extra });
  const until = began + 7 * MIN_MS;
  const run = {
    overrides: [
      surface("calendar", { readEveryMs: 5 * MIN_MS }),
      surface("people", { validUntil: () => until }),
      // Leads is not drawn on Today: never read by the clock there.
      surface("leads", { readEveryMs: 5 * MIN_MS }),
    ],
    readFrom: (o) => from.get(o.key),
    asked: () => false,
    read: (o) => {
      reads.push(o.key);
      from.set(o.key, Date.now());
    },
    stopped: () => false,
  };
  const stop = watchTheClock(run, win);
  try {
    t.mock.timers.tick(4 * MIN_MS);
    assert.deepEqual(reads, [], "four minutes: nothing is old yet");
    t.mock.timers.tick(MIN_MS);
    assert.deepEqual(reads, ["calendar"], "five: the Calendar, drawn on Today");
    t.mock.timers.tick(2 * MIN_MS);
    assert.deepEqual(reads, ["calendar", "people"], "seven: People, past its first next visit's end");
    t.mock.timers.tick(MIN_MS);
    assert.deepEqual(reads, ["calendar", "people"], "and once: its read began after that instant");
    t.mock.timers.tick(2 * MIN_MS);
    assert.deepEqual(reads, ["calendar", "people", "calendar"], "the Calendar again, five minutes on");
  } finally {
    stop();
    globalThis.document = was;
  }
});

test("anything the feed tells of that the page draws is read again once its last read is a quarter of an hour old: the rolling heal", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
  const was = globalThis.document;
  globalThis.document = standInDocument();
  const win = standInWindow("#/today");
  const reads = [];
  const began = T0 - 1_000;
  const from = new Map([
    ["today", began],
    ["leads", began],
    ["alerts", began],
  ]);
  const run = {
    overrides: [
      { key: "today", reads: [], fresh: "live", apply: async () => {} },
      // Leads is heard on its page alone, and Today does not draw it: kept for its page, never healed from here.
      { key: "leads", reads: [], fresh: "its-page", apply: async () => {} },
      // One read only where it is drawn says its own age as its page comes on screen: the heal leaves it.
      { key: "alerts", reads: [], fresh: "live", onDemand: true, apply: async () => {} },
    ],
    readFrom: (o) => from.get(o.key),
    asked: () => false,
    read: (o) => {
      reads.push(o.key);
      from.set(o.key, Date.now());
    },
    stopped: () => false,
  };
  const stop = watchTheClock(run, win);
  try {
    t.mock.timers.tick(HEAL_AFTER_MS - MIN_MS);
    assert.deepEqual(reads, [], "fourteen minutes: nothing");
    t.mock.timers.tick(MIN_MS);
    assert.deepEqual(reads, ["today"], "fifteen: Today, which the feed tells of and the page draws");
    t.mock.timers.tick(MIN_MS);
    assert.deepEqual(reads, ["today"], "and not again until its read is that old once more");
  } finally {
    stop();
    globalThis.document = was;
  }
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 2. Who keeps up                                                                                                          *
 * ------------------------------------------------------------------------------------------------------------------------ */

const surfaces = [];
for (const { name, file } of registeredSurfaces()) {
  const override = (await importSrc(file))[name];
  surfaces.push({ key: override.key, name, file, override });
}

/** Whether a node is the moment: `new Date()`, `Date.now()`, or a value named `now`. */
const isClock = (n) =>
  (ts.isNewExpression(n) && n.expression.getText() === "Date" && (n.arguments?.length ?? 0) === 0) ||
  (ts.isCallExpression(n) && n.expression.getText() === "Date.now") ||
  (ts.isIdentifier(n) && /^now(Ms)?$/.test(n.text)) ||
  (ts.isPropertyAccessExpression(n) && /^now(Ms)?$/.test(n.name.text));

/** The builders a module hands the moment to: each call given it. */
function buildersOf(file) {
  const out = new Set();
  const visit = (n) => {
    if (ts.isCallExpression(n) && n.arguments.some(isClock)) out.add(n.expression.getText());
    ts.forEachChild(n, visit);
  };
  visit(parse(file));
  return [...out];
}

/**
 * Whether a surface keeps up with the clock: a re-make, a read at midnight, an aged read, or the rolling heal, which reads anything
 * the feed tells of that the page draws once it is a quarter of an hour old (hearing/clock.ts).
 */
const keepsUp = (o) =>
  typeof o.rederive === "function" ||
  o.readAtMidnight === true ||
  typeof o.isStale === "function" ||
  typeof o.readEveryMs === "number" ||
  typeof o.validUntil === "function" ||
  (!o.onDemand && (o.fresh === "live" || o.fresh === "its-page"));

/**
 * The surfaces whose module hands the moment to a builder and that say no way of keeping up with it, each with why, and the
 * lane it is owed to where it is owed. May only fall.
 */
const CLOCK_LEFT = {
  partner: {
    why: "The partner's workspaces and handovers, each with its age: read when the pane opens and after the partner's own acts (own-change), which the feed cannot tell of (other workspaces' rows), never kept open for a day.",
  },
};

test("every surface whose module hands the moment to a builder says how it keeps up with it, or is listed with why", () => {
  assert.ok(surfaces.length > 20, `the shell's surfaces are read: ${surfaces.length}`);
  const behind = surfaces
    .filter((s) => buildersOf(s.file).length > 0 && !keepsUp(s.override))
    .map((s) => s.key)
    .filter((key) => !(key in CLOCK_LEFT));
  assert.deepEqual(
    behind,
    [],
    "made with the moment and kept up with by nothing: give it a re-make (`rederive`), a read at midnight or an aged read, or list it in CLOCK_LEFT with why",
  );
});

test("the surfaces listed as left behind still are, each says why, and an owed one names its lane", () => {
  for (const [key, { why, finding }] of Object.entries(CLOCK_LEFT)) {
    const s = surfaces.find((x) => x.key === key);
    assert.ok(s, `${key} is no surface the shell registers`);
    assert.ok(buildersOf(s.file).length > 0, `${key} hands the moment to no builder now: take it off`);
    assert.equal(keepsUp(s.override), false, `${key} keeps up with the clock now: take it off`);
    assert.ok(why.trim().length >= 60, `${key}: say why in a sentence`);
    if (finding !== undefined) assert.match(finding, /^R\d+$/, `${key}: a lane of the audit`);
  }
});

test("the surfaces the findings named carry what they were given", () => {
  const o = (key) => surfaces.find((s) => s.key === key)?.override;
  for (const key of ["today", "calendar", "people", "playbooks", "broadcasts"])
    assert.equal(typeof o(key)?.rederive, "function", `${key} is made again from what it holds`);
  assert.equal(o("calendar").readEveryMs, 5 * MIN_MS, "the Calendar, read every five minutes where it is drawn");
  assert.equal(o("calendar").readAtMidnight, true, "and at midnight");
  assert.equal(o("playbooks").readAtMidnight, true, "the playbooks' counts of the day, at midnight");
  assert.equal(typeof o("people").validUntil, "function", "People, read again once its first next visit has ended");
  assert.equal(o("person").readEveryMs, 5 * MIN_MS, "a person's page, every five minutes while it is open");
  for (const key of ["today", "calendar", "people", "playbooks", "broadcasts"])
    assert.equal(o(key).rederive(new Date()), false, `${key}: holding no read yet, it publishes nothing`);
});
