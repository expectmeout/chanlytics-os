/**
 * Your own change is read once (docs/decisions/0047, task 2.3 of the wiring plan; F9).
 *
 * A write re-reads the surfaces it names (refresh-map.ts), and the commits it made send notices the same surfaces hear, so the
 * change was read twice in the tab that made it: up to 22 requests for one reply and its ticks. A notice now carries the
 * database's clock (`at`, 00408) and the runner remembers when it started each surface's last read (surface-runner.ts):
 *  - a notice told more than the clocks may disagree (250 ms) before that read asks for nothing;
 *  - a refresh the live feed has pending, asked for only by notices that arrived before the read began, is let go by it;
 *  - a notice with no `at` (a database from before 00408) is read as it always was.
 * And the rule #1527 made stays true: a notice that does ask for a read forgets the reads still out first, so the read it asks for
 * shares none of them.
 *
 * Run on the real runner over surfaces whose read is recorded, the feed held here and the clock by hand.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.document ??= { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

const { startSurfaces, refreshSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { api } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
const { onlyOnItsPage, readWhatWasMissed } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");

const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};
const SECOND = 1_000;
const T0 = Date.parse("2026-10-12T09:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

/**
 * The real runner over these surfaces, each read recorded with the time it was made (`failing` names the ones whose read throws),
 * the feed held here and the clock by hand from T0. `write` is what a write does after its POST answers: the surfaces its refresh
 * names are read at once (refreshSurfaces). `told` is a notice as the feed hands it on: the table, its clock, its event.
 */
async function running(t, specs, failing = () => false) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
  const reads = [];
  let feed = null;
  const overrides = specs.map((spec) => ({
    ...spec,
    apply: async () => {
      reads.push({ key: spec.key, at: Date.now() });
      if (failing(spec.key)) throw new Error("the read failed");
    },
  }));
  const stop = startSurfaces(overrides, (onChange) => {
    feed = onChange;
    return () => {};
  });
  for (let i = 0; i < 10; i += 1) await flush();
  assert.ok(feed, "the feed is joined once the boot is in");
  reads.length = 0;
  return {
    reads,
    overrides,
    stop,
    told: (table, at, event = "INSERT") => feed({ tenant_id: "t1" }, table, event, at),
    write: (...keys) => refreshSurfaces(overrides.filter((o) => keys.includes(o.key))),
    advance: async (ms) => {
      t.mock.timers.tick(ms);
      await flush();
    },
  };
}

const keysOf = (r) => r.reads.map((x) => x.key);

test("the notice of your own change asks for nothing: a surface read after it was made is not read again, and a teammate's later notice still reads", async (t) => {
  const r = await running(t, [
    { key: "inbox", refreshOnTables: ["messages"] },
    { key: "today", refreshOnTables: ["messages"] },
  ]);
  try {
    await r.advance(10 * SECOND);
    const sent = Date.now();
    // The reply's write: the Inbox is read at once, after the POST answered.
    await r.write("inbox");
    assert.deepEqual(keysOf(r), ["inbox"]);
    r.reads.length = 0;
    await r.advance(100);
    // The reply's earlier commit, told a second before that read: the Inbox holds it. Today was last read at the boot, before it.
    r.told("messages", iso(sent - SECOND));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["today"], "REGRESSION: the Inbox read the reply twice, once for its notice");
    r.reads.length = 0;

    // A teammate's message, told after the write's read began: read as ever, by both.
    r.told("messages", iso(Date.now()));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r).sort(), ["inbox", "today"], "a later change is never taken for the one already read");
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("a notice that cannot be judged is read as it always was: no clock on it, or a clock inside the margin the two clocks may disagree by", async (t) => {
  const r = await running(t, [{ key: "inbox", refreshOnTables: ["messages"] }]);
  try {
    await r.advance(10 * SECOND);
    await r.write("inbox");
    r.reads.length = 0;
    // A database from before 00408 tells no clock.
    r.told("messages", undefined);
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["inbox"], "no `at`: as it was");
    r.reads.length = 0;

    // The clocks may disagree by 250 ms: a notice told 200 ms before the read is read, 300 ms before is not.
    const read = Date.now();
    await r.write("inbox");
    r.reads.length = 0;
    r.told("messages", iso(read - 200));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["inbox"], "within the margin: read, on the side of reading");
    r.reads.length = 0;
    const again = Date.now();
    await r.write("inbox");
    r.reads.length = 0;
    r.told("messages", iso(again - 300));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), [], "past it: the read holds the change");

    // And a clock that is no date is no clock.
    r.told("messages", "not a date");
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["inbox"], "unreadable: as it was");
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("the early commits of a multi-write verb, told before its POST answered, are covered by the write's re-read: one read, not two", async (t) => {
  const r = await running(t, [{ key: "inbox", refreshOnTables: ["messages"] }]);
  try {
    await r.advance(10 * SECOND);
    // The verb's first commit tells while it is still working: a refresh is pending behind the 400 ms wait.
    r.told("messages", iso(Date.now() - 200));
    await r.advance(100);
    // Its POST answers and the write reads the Inbox: every notice behind the pending refresh arrived before this read.
    await r.write("inbox");
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["inbox"], "REGRESSION: the write's read and its notice's were two reads of one reply");

    // A notice that carries no clock is not judged: its refresh stands beside the write's, as it always did.
    r.reads.length = 0;
    r.told("messages", undefined);
    await r.advance(100);
    await r.write("inbox");
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["inbox", "inbox"], "no `at`: the write's read and the notice's");

    // One that arrives after the read began is a change the read may not hold: it is read.
    r.reads.length = 0;
    await r.write("inbox");
    r.reads.length = 0;
    await r.advance(100);
    r.told("messages", iso(Date.now()));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["inbox"], "a change told after the read is read once");
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("a read that fails holds nothing: the notice it would have covered is read, and the refresh it let go is asked for again", async (t) => {
  const quiet = console.error;
  console.error = () => {};
  let down = false;
  const r = await running(t, [{ key: "inbox", refreshOnTables: ["messages"] }], () => down);
  try {
    await r.advance(10 * SECOND);
    const sent = Date.now();
    // The write's read fails: the Inbox holds what it held, so a notice told a second before it is not one it holds.
    down = true;
    await r.write("inbox");
    down = false;
    r.reads.length = 0;
    r.told("messages", iso(sent - SECOND));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["inbox"], "the failed read is no read of the change");

    // A refresh pending when the write's read fails is asked for again, not lost with it.
    r.reads.length = 0;
    r.told("messages", iso(Date.now()));
    await r.advance(100);
    down = true;
    await r.write("inbox");
    down = false;
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["inbox", "inbox"], "the write's read that failed, and the refresh asked for again");
  } finally {
    console.error = quiet;
    t.mock.timers.reset();
    r.stop();
  }
});

test("what a surface holds is judged by the view it is of: a read of the view left is no read of the view shown", async (t) => {
  let shown = "30d";
  const r = await running(t, [{ key: "report", refreshOnTables: ["messages"], view: () => shown }]);
  try {
    await r.advance(10 * SECOND);
    const sent = Date.now();
    // The week was read after the change; the month, which the page shows now, was last read at the boot.
    shown = "7d";
    await r.write("report");
    shown = "30d";
    r.reads.length = 0;
    r.told("messages", iso(sent - SECOND));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["report"], "the month does not hold it");

    shown = "7d";
    r.reads.length = 0;
    r.told("messages", iso(sent - SECOND));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), [], "and the week, read after it, does");
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("a notice that is read still forgets the reads out first, as #1527 made it; one that asks for nothing forgets nothing", async (t) => {
  const client = api();
  const forgotten = client.forget;
  let forgets = 0;
  client.forget = () => {
    forgets += 1;
    forgotten();
  };
  const r = await running(t, [{ key: "inbox", refreshOnTables: ["messages"] }]);
  try {
    await r.advance(10 * SECOND);
    const sent = Date.now();
    await r.write("inbox");
    await r.advance(100);
    forgets = 0;
    r.told("messages", iso(sent - SECOND));
    await r.advance(5 * SECOND);
    assert.equal(forgets, 0, "the notice of a change the read holds does not clear the reads out");
    r.told("messages", iso(Date.now()));
    assert.equal(forgets, 1, "a change it does not hold clears them before it asks for its read");
    await r.advance(5 * SECOND);
  } finally {
    client.forget = forgotten;
    t.mock.timers.reset();
    r.stop();
  }
});

test("what a read could be answered from is never newer than the oldest identical read it could share: that is what a surface is taken to hold", async () => {
  const { createApi } = await importSrc("apps/dashboard/src/client/api.ts");
  let clock = T0;
  /** A read that answers when the test lets it. */
  let release = () => {};
  const gate = () => new Promise((r) => (release = r));
  const client = createApi({
    fetch: async () => {
      await gate();
      return json({ ok: true, data: { conversations: [] } });
    },
    workspace: () => null,
    onSignedOut: () => {},
    refresh: async () => {},
    now: () => clock,
  });
  function json(body) {
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }
  assert.equal(client.sharesFrom(), T0, "nothing out: now");

  // A read goes out at T0 and is still out: one asked for inside the 2 s window shares it, so it is no newer than T0.
  const out = client("GET conversations");
  clock = T0 + 1_500;
  assert.equal(client.sharesFrom(), T0, "a read out and shareable: as old as that one");
  clock = T0 + 2_500;
  assert.equal(client.sharesFrom(), T0 + 2_500, "past the window it is shared by none: now");

  // A write, or the runner's own refresh of a notice, forgets what is out: nothing before the forgetting can be shared.
  clock = T0 + 1_000;
  assert.equal(client.sharesFrom(), T0, "inside the window again");
  client.forget();
  assert.equal(client.sharesFrom(), T0 + 1_000, "forgotten: the moment of the forgetting at the earliest");
  release();
  await out;

  // The boot's hold keeps an answered read for whoever asks next, whatever its age, until it is let go.
  clock = T0 + 10_000;
  const letGo = client.holdAnswers();
  const held = client("GET conversations");
  release();
  await held;
  clock = T0 + 60_000;
  assert.equal(client.sharesFrom(), T0 + 10_000, "held: as old as the read it would be answered by");
  letGo();
  assert.equal(client.sharesFrom(), T0 + 60_000, "and no older once the hold is let go");
});

test("a notice that arrives for a page that is elsewhere, about a change the surface already read, keeps nothing for its page; a later one does", async (t) => {
  const here = globalThis.location.hash;
  const win = {
    // A move's owed reads are made once its motion is over (legacy-bridge/hearing/after-the-move.ts): no motion here.
    __afterTheMoveMs: 0,
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  const people = { key: "people", refreshOnTables: ["messages"], refreshWhen: onlyOnItsPage("people", ["messages"]) };
  globalThis.location.hash = "#/calendar";
  const r = await running(t, [people]);
  const read = [];
  const stopMissed = readWhatWasMissed(r.overrides, (keys) => read.push(...keys), win);
  try {
    await r.advance(10 * SECOND);
    const sent = Date.now();
    // A write read People wherever the tab was (a consent change names it); its notice is that change's.
    await r.write("people");
    r.reads.length = 0;
    r.told("messages", iso(sent - SECOND));
    globalThis.location.hash = "#/clients";
    win.on?.();
    assert.deepEqual(read, [], "People holds the change: nothing is owed to its page");

    // A change by a teammate after that read, heard while the tab is on another page: People's own rule keeps it for its page.
    globalThis.location.hash = "#/calendar";
    win.on?.();
    r.told("messages", iso(Date.now()));
    globalThis.location.hash = "#/clients";
    win.on?.();
    assert.deepEqual(read, ["people"], "and this one is read once, as its page comes on screen");
  } finally {
    globalThis.location.hash = here;
    stopMissed();
    t.mock.timers.reset();
    r.stop();
  }
});

/**
 * Judged by one clock (the wiring's second audit, S2-1, S4-2, S10-1): every answer of the app plane carries the server's
 * clock when it began (contracts SERVED_AT_HEADER), and the tab's client measures how far its own clock leads the servers'
 * (client/api.ts clockLead). An answer read here through the tab's own client, with the server's clock `offset` behind this
 * one, is the measure; the notice is then told by the database's clock, which is the servers'.
 */
async function measured(offset) {
  const was = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true, data: { notifications: [], seen_at: null } }), {
      status: 200,
      headers: { "content-type": "application/json", "x-served-at": String(Date.now() - offset) },
    });
  try {
    await api()("GET notifications");
  } finally {
    globalThis.fetch = was;
  }
}

test("a browser whose clock runs ahead of the servers' still reads a change made just after its read began; its own change is read once", async (t) => {
  const r = await running(t, [{ key: "inbox", refreshOnTables: ["messages"] }]);
  try {
    await r.advance(10 * SECOND);
    // This browser is three seconds fast: the server began its answer three seconds before this clock says.
    await measured(3 * SECOND);
    assert.equal(api().clockLead(), 3 * SECOND, "the lead, measured on an answer");
    const read = Date.now();
    await r.write("inbox");
    r.reads.length = 0;
    // A teammate's message, committed a tenth of a second after the read began, in the database's clock.
    r.told("messages", iso(read - 3 * SECOND + 100));
    await r.advance(5 * SECOND);
    assert.deepEqual(
      keysOf(r),
      ["inbox"],
      "REGRESSION (S2-1): a fast clock took the teammate's message for one the read held, and nothing read it again",
    );
    r.reads.length = 0;
    // The tab's own change, committed a second before the read in the database's clock: held by the read, read once.
    const again = Date.now();
    await r.write("inbox");
    r.reads.length = 0;
    r.told("messages", iso(again - 3 * SECOND - SECOND));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), [], "the change the read holds is not read twice");

    // One slow answer is not a fast clock: the least of the measures stands.
    await measured(3 * 60 * SECOND);
    assert.equal(api().clockLead(), 3 * SECOND);
  } finally {
    // The least measure is the lead: one that says none puts the tab's client back where the other tests found it.
    await measured(0);
    assert.equal(api().clockLead(), 0);
    t.mock.timers.reset();
    r.stop();
  }
});

test("a clock three minutes fast is measured on the newest answers, and judged by as surely", async (t) => {
  const r = await running(t, [{ key: "inbox", refreshOnTables: ["messages"] }]);
  try {
    await r.advance(10 * SECOND);
    // The newest twenty answers are the measure: a clock set three minutes fast is followed within them.
    for (let i = 0; i < 20; i += 1) await measured(3 * 60 * SECOND);
    assert.equal(api().clockLead(), 3 * 60 * SECOND);
    const read = Date.now();
    await r.write("inbox");
    r.reads.length = 0;
    r.told("messages", iso(read - 3 * 60 * SECOND + 100));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["inbox"], "a change made just after the read is read");
    r.reads.length = 0;
    const again = Date.now();
    await r.write("inbox");
    r.reads.length = 0;
    r.told("messages", iso(again - 3 * 60 * SECOND - SECOND));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), [], "and the tab's own change, held by the read, is read once");
  } finally {
    await measured(0);
    t.mock.timers.reset();
    r.stop();
  }
});

test("a browser whose clock runs behind the servers' judges as before: its reads look older than they are, the side of reading", async (t) => {
  const r = await running(t, [{ key: "inbox", refreshOnTables: ["messages"] }]);
  try {
    await r.advance(10 * SECOND);
    await measured(-3 * SECOND);
    assert.equal(api().clockLead(), 0, "a clock behind leads by nothing");
    const read = Date.now();
    await r.write("inbox");
    r.reads.length = 0;
    // A change committed after the read began, three seconds ahead of this clock: read.
    r.told("messages", iso(read + 3 * SECOND + 100));
    await r.advance(5 * SECOND);
    assert.deepEqual(keysOf(r), ["inbox"]);
  } finally {
    await measured(0);
    t.mock.timers.reset();
    r.stop();
  }
});
