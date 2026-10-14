/**
 * One pass reads everything again (legacy-bridge/hearing/passes.ts; the wiring's second audit, lane R9: S2-7, S10-3, S10-7),
 * run over a runner stood in for: each read recorded, held open until the test lets it land, and when each surface's last read
 * began kept by the test, on a clock the test holds.
 *
 *  1. A pass reads in the page's order, never more than the lanes at once, and skips a surface read since the moment it was
 *     asked for. A pass asked for while one is out is that pass's next round; a return asked for meanwhile joins it.
 *  2. A page hidden holds what the feed said, and reads only that as it comes back within half a minute with every surface live
 *     and the feed up; after longer, or with the feed down, it reads everything again.
 *  3. The network back reads everything again; the network gone is said at once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const docListeners = new Set();
const doc = {
  visibilityState: "visible",
  addEventListener: (_t, fn) => docListeners.add(fn),
  removeEventListener: (_t, fn) => docListeners.delete(fn),
};
globalThis.document = doc;
const setVisibility = (state) => {
  doc.visibilityState = state;
  for (const fn of [...docListeners]) fn();
};

const { passesOf } = await importSrc("apps/dashboard/src/legacy-bridge/hearing/passes.ts");
const { setStatus, getConnection, setConnection } = await importSrc(
  "apps/dashboard/src/legacy-bridge/surface-status.ts",
);

const SECOND = 1_000;

/** A window the pass hears the network on, and the page in front. */
function standInWindow() {
  const heard = new Map();
  return {
    addEventListener: (type, fn) => heard.set(type, [...(heard.get(type) ?? []), fn]),
    removeEventListener: (type, fn) =>
      heard.set(
        type,
        (heard.get(type) ?? []).filter((f) => f !== fn),
      ),
    dispatchEvent: (e) => {
      for (const fn of heard.get(e.type) ?? []) fn(e);
      return true;
    },
    tell: (type) => {
      for (const fn of heard.get(type) ?? []) fn({ type });
    },
  };
}

/** Every promise the pass has chained settles: a turn of the loop runs the microtasks out (the tests mock Date alone). */
const flush = async () => {
  for (let i = 0; i < 3; i += 1) await new Promise((r) => setImmediate(r));
};

/**
 * A runner stood in for over these keys, on the test's clock: each read recorded, held open until `land` lets it go, and when
 * it began kept (`from`); the keys read in the order they are named in, and none kept for another page unless `kept` names it.
 */
function standInRun(keys, { lanes = 2, kept = [] } = {}) {
  const overrides = keys.map((key) => ({ key, reads: [], fresh: "live", apply: async () => {} }));
  const from = new Map();
  const reads = [];
  const open = new Map();
  const run = {
    overrides,
    lanes,
    read: (o) => {
      reads.push(o.key);
      from.set(o.key, Date.now());
      return new Promise((resolve) => open.set(o.key, resolve));
    },
    readFrom: (o) => from.get(o.key),
    here: (list) => list.filter((o) => !kept.includes(o.key)),
    drawn: (o) => !kept.includes(o.key),
    order: () => (o) => keys.indexOf(o.key),
    stopped: () => false,
  };
  return {
    run,
    reads,
    from,
    byKey: (key) => overrides.find((o) => o.key === key),
    /** How many reads are out. */
    out: () => open.size,
    /** Let these reads land. */
    land: async (...landed) => {
      for (const key of landed) {
        open.get(key)?.();
        open.delete(key);
      }
      await flush();
    },
    /** Let every read out land, again and again until none is. */
    landAll: async () => {
      await flush();
      while (open.size) {
        for (const [key, resolve] of [...open]) {
          resolve();
          open.delete(key);
        }
        await flush();
      }
    },
  };
}

test("a pass reads in the page's order, never more than the lanes at once", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10 * SECOND });
  const r = standInRun(["today", "inbox", "people", "calendar", "settings"], { lanes: 2 });
  const passes = passesOf(r.run, standInWindow());
  try {
    const done = passes.again("return");
    await flush();
    assert.deepEqual(r.reads, ["today", "inbox"], "the page's own first, two at once");
    assert.equal(r.out(), 2);
    await r.land("today");
    assert.deepEqual(r.reads, ["today", "inbox", "people"], "a lane takes the next as one lands");
    await r.landAll();
    await done;
    assert.deepEqual(r.reads, ["today", "inbox", "people", "calendar", "settings"], "each once");
    assert.equal(passes.lastReason(), "return");
  } finally {
    passes.stop();
    t.mock.timers.reset();
  }
});

test("a surface read since the moment a pass was asked for is not read again by it", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10 * SECOND });
  const r = standInRun(["today", "inbox", "people"], { lanes: 3 });
  const passes = passesOf(r.run, standInWindow());
  try {
    // The feed rejoined a second ago, and the Inbox was read since (a notice's read, a write's).
    const rejoined = Date.now();
    t.mock.timers.tick(SECOND);
    r.from.set("inbox", Date.now());
    const done = passes.again("rejoin", undefined, rejoined);
    await r.landAll();
    await done;
    assert.deepEqual(r.reads, ["today", "people"], "the Inbox already holds what the rejoin asks for");
  } finally {
    passes.stop();
    t.mock.timers.reset();
  }
});

test("a rejoin asked for while a pass is out is its next round: what it read before the rejoin is read again, what it read after is not", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10 * SECOND });
  const r = standInRun(["today", "inbox", "people"], { lanes: 1 });
  const passes = passesOf(r.run, standInWindow());
  try {
    const first = passes.again("return");
    await flush();
    assert.deepEqual(r.reads, ["today"]);
    // The feed rejoins while Today's read is out: Today began before the rejoin, so it owes one more; the rest are read after.
    t.mock.timers.tick(SECOND);
    const second = passes.again("rejoin", undefined, Date.now());
    assert.equal(second, first, "the same pass");
    await r.landAll();
    await second;
    assert.deepEqual(r.reads, ["today", "inbox", "people", "today"], "Today once more, the others once");
  } finally {
    passes.stop();
    t.mock.timers.reset();
  }
});

test("a return, or the network back, asked for while a pass is out joins it: two returns in quick succession are one pass, not a pass and a half", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10 * SECOND });
  const r = standInRun(["today", "inbox", "people"], { lanes: 1 });
  const passes = passesOf(r.run, standInWindow());
  try {
    const first = passes.again("return");
    await flush();
    assert.deepEqual(r.reads, ["today"]);
    // A phone's resume: the return, then the network back a moment later, while Today's read is out.
    t.mock.timers.tick(5);
    assert.equal(passes.again("online"), first, "the same pass");
    await r.landAll();
    await first;
    assert.deepEqual(
      r.reads,
      ["today", "inbox", "people"],
      "each once: Today's read, begun as the pass did, holds both",
    );

    // Once the pass is done, a return is a pass of its own.
    t.mock.timers.tick(SECOND);
    const later = passes.again("return");
    await r.landAll();
    await later;
    assert.deepEqual(r.reads, ["today", "inbox", "people", "today", "inbox", "people"]);
  } finally {
    passes.stop();
    t.mock.timers.reset();
  }
});

test("a pass reads only what the page on screen draws of what it is asked for; the rest are kept for their pages", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10 * SECOND });
  const r = standInRun(["today", "people", "playbooks"], { lanes: 3, kept: ["people", "playbooks"] });
  const passes = passesOf(r.run, standInWindow());
  try {
    const done = passes.again("return");
    await r.landAll();
    await done;
    assert.deepEqual(r.reads, ["today"], "People and the playbooks, heard on their pages alone, wait for them (S10-7)");
  } finally {
    passes.stop();
    t.mock.timers.reset();
  }
});

test("a page hidden holds what the feed said, and back within half a minute reads that alone; after longer, or with the feed down, everything", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 50 * SECOND });
  const r = standInRun(["today", "inbox", "people"], { lanes: 3 });
  for (const key of ["today", "inbox", "people"]) setStatus(key, "live");
  const passes = passesOf(r.run, standInWindow());
  try {
    setVisibility("hidden");
    passes.holdWhileHidden(r.byKey("people"));
    t.mock.timers.tick(10 * SECOND);
    setVisibility("visible");
    await r.landAll();
    assert.deepEqual(r.reads, ["people"], "what the feed said meanwhile, and nothing else");
    assert.equal(passes.lastReason(), "shown");

    r.reads.length = 0;
    setVisibility("hidden");
    t.mock.timers.tick(31 * SECOND);
    setVisibility("visible");
    await r.landAll();
    assert.deepEqual(r.reads, ["today", "inbox", "people"], "half a minute away: everything");
    assert.equal(passes.lastReason(), "return");

    r.reads.length = 0;
    setVisibility("hidden");
    setConnection({ realtimeDown: true });
    t.mock.timers.tick(5 * SECOND);
    setVisibility("visible");
    await r.landAll();
    assert.deepEqual(r.reads, ["today", "inbox", "people"], "the feed dropped meanwhile: everything");
  } finally {
    passes.stop();
    setConnection({ realtimeDown: false });
    setVisibility("visible");
    t.mock.timers.reset();
  }
});

test("the network gone is said at once, and back it reads everything again", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10 * SECOND });
  const win = standInWindow();
  const r = standInRun(["today", "inbox"], { lanes: 2 });
  const passes = passesOf(r.run, win);
  try {
    win.tell("offline");
    assert.equal(getConnection().offline, true);
    win.tell("online");
    assert.equal(getConnection().offline, false);
    await r.landAll();
    assert.deepEqual(r.reads, ["today", "inbox"]);
    assert.equal(passes.lastReason(), "online");
  } finally {
    passes.stop();
    t.mock.timers.reset();
  }
  win.tell("online");
  assert.equal(r.reads.length, 2, "a stopped pass hears nothing");
});
