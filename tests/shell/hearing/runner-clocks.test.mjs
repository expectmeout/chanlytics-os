/**
 * The two clocks the runner keeps for a surface beyond the live feed's default (surface-runner.ts), run on the real runner over
 * surfaces whose read is recorded, the feed held here and the clock by hand.
 *
 * `maxWaitMs`: a burst of changes is read once, `debounceMs` after the last, and never later than the runner's longest wait
 * after the first (three seconds, unless the surface names its own). A read that is dear and moves by one in a hundred (Today's
 * headline) asks for a long wait and the runner honours it; one that names none is waited out for three seconds at most, as ever.
 *
 * `readAtMidnight`: a surface that counts "the day so far" is read again when the business's day turns, by the workspace's zone,
 * in a visible tab; the timer is armed again after each fire (a day is 23 or 25 hours twice a year), and goes with the runner.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
// The window's own events (the runner hears the network, and the workspace changing): a registry the test can tell.
const windowListeners = new Map();
globalThis.window.addEventListener = (type, fn) => {
  if (!windowListeners.has(type)) windowListeners.set(type, new Set());
  windowListeners.get(type).add(fn);
};
globalThis.window.removeEventListener = (type, fn) => windowListeners.get(type)?.delete(fn);
const tellWindow = (type) => {
  for (const fn of [...(windowListeners.get(type) ?? [])]) fn({ type });
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
const listeners = new Map();
const doc = {
  visibilityState: "visible",
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    listeners.get(type)?.delete(fn);
  },
};
globalThis.document = doc;
const tellDocument = (type) => {
  for (const fn of [...(listeners.get(type) ?? [])]) fn({ type });
};
const setVisibility = (state) => {
  doc.visibilityState = state;
  tellDocument("visibilitychange");
};

const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { readWhatWasMissed } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");

const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

/**
 * The real runner over these surfaces, each read recorded with the time it was made; the feed held here, and the clock by hand
 * from `from`, taken over before the runner starts so that every timer it sets is the test's.
 */
async function running(t, specs, from = 0) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: from });
  const reads = [];
  let feed = null;
  const overrides = specs.map((spec) => ({
    ...spec,
    apply: async () => void reads.push({ key: spec.key, at: Date.now() }),
  }));
  const stop = startSurfaces(overrides, (onChange) => {
    feed = onChange;
    return () => {};
  });
  for (let i = 0; i < 10; i += 1) await flush();
  if (specs.some((spec) => spec.refreshOnTables)) assert.ok(feed, "the feed is joined once the boot is in");
  reads.length = 0;
  return {
    reads,
    stop,
    heard: (table = "messages", event = "INSERT") => feed({ tenant_id: "t1" }, table, event),
    advance: async (ms) => {
      t.mock.timers.tick(ms);
      await flush();
    },
    overrides,
  };
}

const SECOND = 1_000;

test("a surface that names no longest wait is read three seconds after the first change of a burst at the latest, as it always was", async (t) => {
  const r = await running(t, [{ key: "a", refreshOnTables: ["messages"], debounceMs: 5_000 }]);
  try {
    r.heard();
    await r.advance(2_999);
    assert.deepEqual(r.reads, []);
    await r.advance(1);
    assert.deepEqual(
      r.reads.map((x) => x.at),
      [3_000],
      "the runner's own longest wait",
    );
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("a surface that asks for a long wait gets it: read once, fifteen seconds after the last change, never past thirty after the first", async (t) => {
  const r = await running(t, [
    { key: "a", refreshOnTables: ["messages"], debounceMs: 15 * SECOND, maxWaitMs: 30 * SECOND },
  ]);
  try {
    // One change: nothing at three seconds (the runner's own longest wait) nor at fourteen, the read at fifteen.
    r.heard();
    await r.advance(3_000);
    assert.deepEqual(r.reads, [], "REGRESSION: read at three seconds, whatever the surface asked for");
    await r.advance(11_999);
    assert.deepEqual(r.reads, [], "and not yet at fourteen");
    await r.advance(1);
    assert.deepEqual(
      r.reads.map((x) => x.at),
      [15_000],
      "read fifteen seconds after the change",
    );

    // Changes ten seconds apart restart the wait, until thirty seconds after the first ends it: one read for the three.
    r.reads.length = 0;
    const start = Date.now();
    r.heard();
    await r.advance(10 * SECOND);
    r.heard();
    await r.advance(10 * SECOND);
    r.heard();
    await r.advance(10 * SECOND);
    assert.deepEqual(
      r.reads.map((x) => x.at - start),
      [30_000],
      "one read for a burst, thirty seconds from its first change",
    );

    // A stream that never pauses is still read: about every thirty seconds, never starved.
    r.reads.length = 0;
    for (let ms = 0; ms < 120 * SECOND; ms += 5 * SECOND) {
      r.heard();
      await r.advance(5 * SECOND);
    }
    assert.ok(
      r.reads.length >= 3 && r.reads.length <= 4,
      `a read every thirty seconds of a steady stream: ${r.reads.length}`,
    );
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

const NY_MIDNIGHT = Date.parse("2026-10-12T04:00:00Z"); // midnight at the start of 12 October, New York (EDT, UTC-4)

test("a surface that counts the day so far is read again a second after the business's midnight, by the workspace's zone, and again after each", async (t) => {
  const r = await running(
    t,
    [
      { key: "today", readAtMidnight: true },
      { key: "inbox", refreshOnTables: ["messages"] },
    ],
    NY_MIDNIGHT - 10 * 60 * SECOND,
  );
  try {
    await r.advance(10 * 60 * SECOND);
    assert.deepEqual(r.reads, [], "not at midnight itself: a second past it");
    await r.advance(SECOND);
    assert.deepEqual(
      r.reads.map((x) => x.key),
      ["today"],
      "and only the surface that counts the day",
    );
    assert.equal(r.reads[0].at, NY_MIDNIGHT + SECOND, "a second past the business's midnight");

    // The next fire is the next midnight: a day later.
    r.reads.length = 0;
    await r.advance(24 * 60 * 60 * SECOND - 1);
    assert.deepEqual(r.reads, [], "armed again: not before the next midnight");
    await r.advance(1);
    assert.deepEqual(
      r.reads.map((x) => x.at),
      [NY_MIDNIGHT + 24 * 60 * 60 * SECOND + SECOND],
    );
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("the day the clocks go back is twenty-five hours long: the timer is armed again by the zone, not by a day's length", async (t) => {
  // New York puts its clocks back at 02:00 on 1 November 2026: midnight of the 1st is 04:00 UTC, midnight of the 2nd 05:00 UTC.
  const first = Date.parse("2026-11-01T04:00:00Z");
  const second = Date.parse("2026-11-02T05:00:00Z");
  const r = await running(t, [{ key: "today", readAtMidnight: true }], first - 60 * SECOND);
  try {
    await r.advance(60 * SECOND + SECOND);
    assert.deepEqual(
      r.reads.map((x) => x.at),
      [first + SECOND],
      "the first midnight",
    );
    r.reads.length = 0;
    await r.advance(second - first - 1);
    assert.deepEqual(r.reads, [], "twenty-five hours after the first midnight, not twenty-four");
    await r.advance(1);
    assert.deepEqual(
      r.reads.map((x) => x.at),
      [second + SECOND],
      "the second",
    );
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("a zone saved moves the next midnight: the timer is armed again by the new zone, and the old one does not fire", async (t) => {
  const zones = globalThis.__WORKSPACES;
  const r = await running(t, [{ key: "today", readAtMidnight: true }], NY_MIDNIGHT - 10 * 60 * SECOND);
  try {
    // The owner moves the business to Chicago (five hours behind UTC then): its next midnight is an hour after New York's. The
    // identity courier publishes the zone and then tells the window (identity.ts patch).
    globalThis.__WORKSPACES = [{ ...zones[0], timezone: "America/Chicago" }];
    tellWindow("workspace:changed");
    await flush();
    await r.advance(10 * 60 * SECOND + SECOND);
    assert.deepEqual(r.reads, [], "New York's midnight passes and nothing is read: the day has not turned in Chicago");
    await r.advance(60 * 60 * SECOND);
    assert.deepEqual(
      r.reads.map((x) => x.at),
      [NY_MIDNIGHT + 60 * 60 * SECOND + SECOND],
      "read a second past Chicago's midnight",
    );

    // And once, not twice: the workspace changing again with the same zone arms the one timer again, not a second.
    r.reads.length = 0;
    tellWindow("workspace:changed");
    tellWindow("workspace:changed");
    await flush();
    await r.advance(24 * 60 * 60 * SECOND);
    assert.equal(r.reads.length, 1, "one read for the next midnight");
  } finally {
    globalThis.__WORKSPACES = zones;
    t.mock.timers.reset();
    r.stop();
  }
});

test("a tab that is hidden when the day turns reads when it is shown again, once; one shown reads at once", async (t) => {
  const r = await running(t, [{ key: "today", readAtMidnight: true }], NY_MIDNIGHT - 10 * SECOND);
  try {
    setVisibility("hidden");
    await r.advance(11 * SECOND);
    assert.deepEqual(r.reads, [], "no read for a tab nobody is looking at");
    await r.advance(5 * SECOND);
    setVisibility("visible");
    await flush();
    assert.deepEqual(
      r.reads.map((x) => x.key),
      ["today"],
      "read as the tab comes back (away for less than the return's own measure)",
    );
    r.reads.length = 0;
    setVisibility("hidden");
    setVisibility("visible");
    await flush();
    assert.deepEqual(r.reads, [], "and owed no more: a later return reads nothing for the midnight");
  } finally {
    doc.visibilityState = "visible";
    t.mock.timers.reset();
    r.stop();
  }
});

test("a surface read only where it is drawn is read at midnight where its page is on screen, and kept for its page elsewhere", async (t) => {
  const here = globalThis.location.hash;
  const win = {
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  const specs = [
    { key: "today", readAtMidnight: true },
    { key: "reports_headline", readAtMidnight: true, onDemand: true, isStale: () => false },
  ];
  try {
    globalThis.location.hash = "#/inbox";
    const r = await running(t, specs, NY_MIDNIGHT - SECOND);
    try {
      const read = [];
      const stop = readWhatWasMissed(r.overrides, (keys) => read.push(...keys), win);
      await r.advance(2 * SECOND);
      assert.deepEqual(
        r.reads.map((x) => x.key),
        ["today"],
        "the headline is not read from the Inbox",
      );
      globalThis.location.hash = "#/today";
      win.on?.();
      assert.deepEqual(read, ["reports_headline"], "it is read once, as Today comes on screen");
      stop();
    } finally {
      t.mock.timers.reset();
      r.stop();
    }

    globalThis.location.hash = "#/today";
    const s = await running(t, specs, NY_MIDNIGHT - SECOND);
    try {
      await s.advance(2 * SECOND);
      assert.deepEqual(s.reads.map((x) => x.key).sort(), ["reports_headline", "today"], "on Today it is read with it");
    } finally {
      t.mock.timers.reset();
      s.stop();
    }
  } finally {
    globalThis.location.hash = here;
  }
});

test("the timer goes with the runner: stopped, the day turning reads nothing", async (t) => {
  const r = await running(t, [{ key: "today", readAtMidnight: true }], NY_MIDNIGHT - 60 * SECOND);
  try {
    r.stop();
    tellWindow("workspace:changed");
    await r.advance(3 * 60 * SECOND);
    assert.deepEqual(r.reads, [], "nor does a zone saved after it arm a timer of its own");
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});
