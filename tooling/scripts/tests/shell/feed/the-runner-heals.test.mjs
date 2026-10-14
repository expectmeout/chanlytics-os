/**
 * The runner heals what it missed (legacy-bridge/surface-runner.ts; the wiring's second audit, lane R9: S2-4, S2-5, S2-6, S10-2,
 * S10-3), run on the real runner over surfaces whose answers the test says, the feed held here and the clock by hand.
 *
 *  1. A read asked for after the boot that fails is asked for again two seconds on and ten after that, then left to the status
 *     line; one that lands in part stands as not refreshing, and the rest is asked for.
 *  2. The feed's first join reads again, once the boot is in, what tells of a customer's message or a call and was read before it
 *     (the feed replays nothing from before a join), and not the dear reads nor the whole boot; a rejoin reads all it missed;
 *     neither reads a surface the feed tells nothing of.
 *  3. A tab that could not say its workspace says the feed is down, and joins it as soon as a later read says the workspace.
 *  4. A hidden page reads, of what the feed tells, only what says itself in the tab's title and badge, and the rest as it comes
 *     back in front.
 *  5. What the feed told a refresh of reaches its read, so a delivery's receipts can read the threads alone; a read nobody heard
 *     of is told nothing, and reads everything.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
// The window's own events (the runner hears the network, the page in front): a registry the test can tell.
const windowListeners = new Map();
globalThis.window.addEventListener = (type, fn) => {
  if (!windowListeners.has(type)) windowListeners.set(type, new Set());
  windowListeners.get(type).add(fn);
};
globalThis.window.removeEventListener = (type, fn) => windowListeners.get(type)?.delete(fn);
globalThis.window.dispatchEvent = (e) => {
  for (const fn of [...(windowListeners.get(e.type) ?? [])]) fn(e);
  return true;
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
const docListeners = new Set();
const doc = {
  visibilityState: "visible",
  addEventListener: (_t, fn) => docListeners.add(fn),
  removeEventListener: (_t, fn) => docListeners.delete(fn),
};
globalThis.document = doc;
const setVisibility = (state) => {
  doc.visibilityState = state;
  for (const fn of [...docListeners]) fn({ type: "visibilitychange" });
};

const { startSurfaces, refreshAllSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { getSurfaceStatuses, getConnection } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const { deliveryTicksOnly } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");

const SECOND = 1_000;
/** The runner's own wait before a notice's read: REFRESH_DEBOUNCE_MS. */
const NOTICE_WAIT_MS = 400;

/** Every promise the runner has chained settles: a turn of the loop runs the microtasks out (the tests mock setTimeout alone). */
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};
const statusOf = (key) => getSurfaceStatuses().get(key);

/**
 * The real runner over these surfaces, each read recorded with the time it was made and what the feed told it of; each answers
 * as its `answer` says, given how many times it has been read (1 is the boot's), throwing for a read that fails. The feed is held
 * here: what it is told (`heard`), its reports (`status`), and the workspace each join named. The clock is the test's from `from`.
 */
async function running(t, specs, from = 0) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: from });
  const reads = [];
  const tries = new Map();
  let feed = null;
  let report = null;
  const joins = [];
  const overrides = specs.map(({ answer, ...spec }) => ({
    ...spec,
    apply: async (heard) => {
      const n = (tries.get(spec.key) ?? 0) + 1;
      tries.set(spec.key, n);
      reads.push({ key: spec.key, at: Date.now(), heard });
      return answer?.(n);
    },
  }));
  const stop = startSurfaces(overrides, (onChange, opts) => {
    feed = onChange;
    report = opts.onStatus;
    joins.push(opts.tenantId);
    return () => {};
  });
  await flush();
  reads.length = 0;
  return {
    reads,
    stop,
    joins,
    keys: () => reads.map((x) => x.key),
    at: (key) => reads.filter((x) => x.key === key).map((x) => x.at),
    heard: (table = "messages", event = "INSERT", row = {}) => feed({ tenant_id: "t1", ...row }, table, event),
    status: (s) => report(s),
    advance: async (ms) => {
      t.mock.timers.tick(ms);
      await flush();
    },
  };
}

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 1. Retries                                                                                                               *
 * ------------------------------------------------------------------------------------------------------------------------ */

test("a notice's read that fails is asked for again two seconds on and ten after that, then left to the status line (S2-5)", async (t) => {
  t.mock.method(console, "error", () => {});
  let failing = false;
  const r = await running(t, [
    {
      key: "retried",
      refreshOnTables: ["messages"],
      answer: () => {
        if (failing) throw new Error("busy");
      },
    },
  ]);
  try {
    failing = true;
    r.heard();
    await r.advance(NOTICE_WAIT_MS);
    assert.deepEqual(r.at("retried"), [NOTICE_WAIT_MS], "the notice's read, which fails");
    assert.equal(statusOf("retried"), "degraded", "what it held stands, said as not refreshing");
    await r.advance(2 * SECOND);
    assert.deepEqual(r.at("retried"), [NOTICE_WAIT_MS, NOTICE_WAIT_MS + 2 * SECOND], "asked for again two seconds on");
    await r.advance(10 * SECOND);
    assert.deepEqual(
      r.at("retried"),
      [NOTICE_WAIT_MS, NOTICE_WAIT_MS + 2 * SECOND, NOTICE_WAIT_MS + 12 * SECOND],
      "and ten seconds after that",
    );
    await r.advance(60 * SECOND);
    assert.equal(r.at("retried").length, 3, "then no more: the status line says it, and Retry is the owner's");

    failing = false;
    r.heard();
    await r.advance(NOTICE_WAIT_MS);
    assert.equal(statusOf("retried"), "live", "the next read that lands says it is current again");
    await r.advance(30 * SECOND);
    assert.equal(r.at("retried").length, 4, "and a read that landed is asked for no more");
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("a read that lands in part stands as not refreshing, and the rest is asked for (S2-5: Today with its calls unread)", async (t) => {
  let partial = true;
  const r = await running(t, [{ key: "partly", answer: () => (partial ? "partial" : undefined) }]);
  try {
    assert.equal(
      statusOf("partly"),
      "degraded",
      "what landed is drawn, and the status line says the rest is not current",
    );
    partial = false;
    await r.advance(2 * SECOND);
    assert.deepEqual(r.at("partly"), [2 * SECOND], "the rest is asked for two seconds on");
    assert.equal(statusOf("partly"), "live");
    await r.advance(30 * SECOND);
    assert.equal(r.at("partly").length, 1, "and once whole, asked for no more");
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 2. Joins                                                                                                                 *
 * ------------------------------------------------------------------------------------------------------------------------ */

test("the feed's first join reads again what tells of a customer's message or a call; a rejoin reads all it missed; neither reads what the feed tells nothing of", async (t) => {
  const r = await running(t, [
    { key: "messages_heard", refreshOnTables: ["messages"] },
    { key: "calls_heard", refreshOnTables: ["calls"] },
    // A dear read (People's, Sent's runs'): its next notice or the rolling heal, not every cold open, reads it again.
    { key: "dear", refreshOnTables: ["messages"], maxWaitMs: 12 * SECOND },
    // A teammate's change in the moment of a load: the same.
    { key: "rules_heard", refreshOnTables: ["tenant_rules"] },
    // Told nothing by the feed: no join owes it a read.
    { key: "untold" },
  ]);
  try {
    assert.deepEqual(r.joins, ["t1"], "joined on the workspace on screen");
    // The join lands a second after the boot's reads: a message or a call between them was never heard (S2-4).
    await r.advance(SECOND);
    r.status("SUBSCRIBED");
    await r.advance(0);
    assert.deepEqual(
      r.keys().sort(),
      ["calls_heard", "messages_heard"],
      "what tells of a message or a call, read again once the feed is joined, and nothing else: never the whole boot twice",
    );

    // A drop the feed comes back from within its grace: everything it tells of is read, since the gap may be any length.
    r.reads.length = 0;
    await r.advance(5 * SECOND);
    r.status("CHANNEL_ERROR");
    await r.advance(SECOND);
    r.status("SUBSCRIBED");
    await r.advance(0);
    assert.deepEqual(
      r.keys().sort(),
      ["calls_heard", "dear", "messages_heard", "rules_heard"],
      "the rejoin reads what the feed tells of, and nothing else",
    );
    assert.equal(getConnection().realtimeDown, false, "a blip it came back from is not news");
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("a tab that could not say its workspace says the feed is down, and joins it as soon as a later read says the workspace (S2-6)", async (t) => {
  t.mock.method(console, "error", () => {});
  const was = globalThis.__ACTIVE_WORKSPACE;
  delete globalThis.__ACTIVE_WORKSPACE;
  let reachable = false;
  const r = await running(t, [
    {
      key: "workspace",
      // Who is looking: the read that says the workspace on screen, and with it the feed's topic.
      answer: () => {
        if (!reachable) throw new Error("unreachable");
        globalThis.__ACTIVE_WORKSPACE = "t1";
      },
    },
    { key: "late", refreshOnTables: ["messages"] },
  ]);
  try {
    // The boot's one retry of the workspace, which fails too.
    await r.advance(SECOND);
    assert.deepEqual(r.joins, [], "no topic, so no feed");
    assert.equal(getConnection().realtimeDown, true, "and the status line says so, rather than nothing at all");

    // The owner presses Retry (or comes back to the tab): the workspace is read, and the feed is joined on it.
    reachable = true;
    await refreshAllSurfaces();
    await r.advance(0);
    assert.deepEqual(r.joins, ["t1"], "joined as the workspace is known");
    r.reads.length = 0;
    await r.advance(SECOND);
    r.status("SUBSCRIBED");
    await r.advance(0);
    assert.equal(getConnection().realtimeDown, false, "up, and said");
    assert.deepEqual(
      r.keys(),
      ["late"],
      "and what the feed tells of is read, since nothing was heard while it was not joined",
    );
  } finally {
    globalThis.__ACTIVE_WORKSPACE = was;
    t.mock.timers.reset();
    r.stop();
  }
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 3. A hidden page                                                                                                         *
 * ------------------------------------------------------------------------------------------------------------------------ */

test("a hidden page reads the Inbox as the feed tells of it, and holds the rest until it is in front (S10-3)", async (t) => {
  const r = await running(t, [
    { key: "inbox", refreshOnTables: ["messages"] },
    { key: "held_back", refreshOnTables: ["messages"] },
  ]);
  try {
    setVisibility("hidden");
    r.heard();
    await r.advance(3 * SECOND);
    assert.deepEqual(r.keys(), ["inbox"], "the Inbox, which says itself in the tab's title; nothing else");
    setVisibility("visible");
    await r.advance(0);
    assert.deepEqual(r.keys(), ["inbox", "held_back"], "the rest as the page comes back, and nothing twice");
  } finally {
    t.mock.timers.reset();
    r.stop();
    doc.visibilityState = "visible";
  }
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 4. What the feed told a read                                                                                             *
 * ------------------------------------------------------------------------------------------------------------------------ */

test("what the feed told a refresh of reaches its read: a burst of receipts is one read, told of each (S10-2)", async (t) => {
  const r = await running(t, [
    { key: "ticked", refreshOnTables: ["messages"], refreshOnMessageStatuses: ["sent", "delivered", "read"] },
  ]);
  try {
    for (const status of ["sent", "delivered", "read"]) r.heard("messages", "UPDATE", { status });
    await r.advance(NOTICE_WAIT_MS);
    assert.equal(r.reads.length, 1, "one read for the three");
    assert.deepEqual(
      r.reads[0].heard.map((c) => c.row.status),
      ["sent", "delivered", "read"],
    );
    assert.equal(
      deliveryTicksOnly(r.reads[0].heard),
      true,
      "receipts alone: the read may keep the holds and the calls",
    );

    r.heard("messages", "UPDATE", { status: "delivered" });
    r.heard("messages", "INSERT");
    await r.advance(NOTICE_WAIT_MS);
    assert.equal(r.reads.length, 2);
    assert.equal(deliveryTicksOnly(r.reads[1].heard), false, "a new message among them reads everything");

    // A read nobody heard of (Retry, a pass, a write's): told nothing, and it reads everything.
    await refreshAllSurfaces();
    assert.equal(r.reads.length, 3);
    assert.equal(r.reads[2].heard, undefined);
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("a delivery's receipts are a message's update to sent, delivered or read, and nothing else", () => {
  const change = (table, event, status) => ({ table, event, row: { status } });
  assert.equal(deliveryTicksOnly(undefined), false, "a read nobody heard of");
  assert.equal(deliveryTicksOnly([]), false);
  assert.equal(deliveryTicksOnly([change("messages", "UPDATE", "read")]), true);
  assert.equal(deliveryTicksOnly([change("messages", "UPDATE", "failed")]), false, "a failure may move a hold");
  assert.equal(deliveryTicksOnly([change("messages", "INSERT", "sent")]), false, "a new message");
  assert.equal(deliveryTicksOnly([change("calls", "UPDATE", "read")]), false, "another table");
});
