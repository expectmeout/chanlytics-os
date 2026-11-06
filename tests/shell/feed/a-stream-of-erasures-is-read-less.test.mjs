/**
 * A stream of erasures is read less (00549, decision 0019), and nothing else is read later.
 *
 * Delete… for many hands its people to the ledger, which erases them one after another, and each erasure tells the
 * workspace's open tabs what it changed: a thread gone and a tombstone, two notices in the same few milliseconds. The press
 * of fifty on 5 Nov 2026 was 100 notices in 15.4 s; a third of the gaps between erasures were longer than the runner's 400 ms,
 * so each surface was read again in each of them, a dear read's twelve seconds never reached: 1,167 of a member's requests in
 * 16 s from one press. Paced 300 ms apart, a press of 5,000 runs for 25 minutes.
 *
 * Run on the real runner over the surfaces the shell registers, each read recorded and the clock by hand. The same notices with
 * no word of the erasure are what a tab reads today (and what a database before 00549 still tells), so each case holds the
 * before beside the after. A person erased alone, a customer's message and a teammate's edit are read as fast as ever.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { changesOf } from "../../_live-feed.mjs";
import { historyOf, legacyAddress } from "../address/_address.mjs";
import { registeredSurfaces } from "../hearing/_reads.mjs";

const listening = new Map();
const win = {
  __afterTheMoveMs: 0,
  __ACTIVE_WORKSPACE: "ws-1",
  location: { pathname: "/w/acme", search: "", hash: "#/people", assign() {}, replace() {}, reload() {} },
  addEventListener(type, fn) {
    if (!listening.has(type)) listening.set(type, new Set());
    listening.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    listening.get(type)?.delete(fn);
  },
  dispatchEvent(ev) {
    for (const fn of [...(listening.get(ev.type) ?? [])]) fn(ev);
    return true;
  },
};
globalThis.window = win;
historyOf(win);
globalThis.document = { visibilityState: "visible", title: "", addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
win.__shell = (await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts")).addressApi(win);
win.CHANLY = { nav() {}, address: await legacyAddress() };
const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const REAL = [];
for (const { name, file } of registeredSurfaces()) REAL.push((await importSrc(file))[name]);

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const TICK = 25;
const THREAD_GONE = ["conversations", "DELETE"];
const TOMBSTONE = ["contacts", "UPDATE"];

/**
 * The press of fifty as the topic told it: each notice's clock on realtime.messages, 5 Nov 2026 from 14:50:48.051Z, in ms from
 * the first, `d` a thread gone and `c` a tombstone. The clocks alone: a notice never names a row (00265).
 */
const PRESS_OF_50 = (
  "0d,2c,16d,17c,92d,100c,1130d,1131c,1205d,1206c,1327d,1328c,2213d,2214c,2489d,2490c,2528d,2529c,3301d,3301c,3580d,3580c," +
  "3626d,3627c,4248d,4250c,4532d,4533c,4655c,4655d,5034d,5036c,5471d,5471c,5550d,5553c,6169d,6170c,6412d,6413c,6448d,6449c," +
  "6993d,6994c,7299d,7299c,7372d,7373c,7896d,7897c,8007c,8007d,8083d,8084c,8887d,8887c,8924c,8924d,8992c,8992d,9776d,9778c," +
  "9817d,9818c,9908d,9909c,10531d,10533c,10639c,10639d,10680d,10681c,11361d,11362c,11444d,11445c,11485d,11486c,12320d,12321c," +
  "12334d,12334c,12494d,12494c,13169d,13169c,13217d,13218c,13374d,13375c,14311d,14312c,14431d,14431c,14728d,14729c,15333d," +
  "15334c,15377d,15377c"
)
  .split(",")
  .map((n) => ({ at: Number.parseInt(n, 10), says: n.endsWith("d") ? THREAD_GONE : TOMBSTONE }));

/** A press as the ledger's pace would run it: `people` erased `apart` ms from each other, a thread and a tombstone each. */
const paced = (people, apart) =>
  Array.from({ length: people }, (_, i) => [
    { at: i * apart, says: THREAD_GONE },
    { at: i * apart + 1, says: TOMBSTONE },
  ]).flat();

/** Enough turns of the loop for a read's recorded apply to settle: the clock is the test's, so nothing else is waited for. */
const settled = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

/**
 * The real runner over the shell's surfaces, or `surfaces` where a case makes its own, on the page `hash` names; each read
 * recorded rather than made, the feed held here, the clock by hand from before the runner starts.
 */
async function tab(t, hash, surfaces = REAL, tick = TICK) {
  win.location.hash = hash;
  win.location.pathname = `/w/acme/${hash.slice(2)}`;
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const reads = [];
  let feed = null;
  const stop = startSurfaces(
    surfaces.map((o) => ({
      ...o,
      isStale: () => false,
      apply: async () => void reads.push({ key: o.key, at: Date.now() }),
    })),
    (onChange) => {
      feed = onChange;
      return () => {};
    },
  );
  // In small steps: a read is recorded as its timer's turn settles, on the clock the tick left, so a long tick would date it late.
  const advance = async (ms) => {
    for (let left = ms; left > 0; left -= tick) {
      t.mock.timers.tick(Math.min(left, tick));
      await settled();
    }
  };
  // The boot in, the join's catch-up read, and every wait they left behind them: from here on a read is a notice's.
  for (let i = 0; i < 40; i += 1) await settled();
  t.mock.timers.tick(MINUTE);
  await settled();
  assert.ok(feed, "the feed is joined once the boot is in");
  reads.length = 0;
  return {
    reads,
    advance,
    /** A notice as the feed hands it on, on this moment's clock; with `erasure`, one 00549 marked. */
    tell: async ([table, event], { erasure = false } = {}) => {
      const row = { tenant_id: "ws-1", ...(erasure ? { erasure: true } : {}) };
      feed(row, table, event, new Date(Date.now()).toISOString());
      await settled();
    },
    /** These notices, each at its moment from now, and the clock left at the last. */
    replay: async (notices, { erasure = false } = {}) => {
      let now = 0;
      for (const n of notices) {
        if (n.at > now) await advance(n.at - now);
        now = Math.max(now, n.at);
        const row = { tenant_id: "ws-1", ...(erasure ? { erasure: true } : {}) };
        feed(row, n.says[0], n.says[1], new Date(Date.now()).toISOString());
      }
      await settled();
    },
    readsOf: (key) => reads.filter((r) => r.key === key),
    /** Each surface's reads, by its key. */
    counts: () => {
      const by = {};
      for (const r of reads) by[r.key] = (by[r.key] ?? 0) + 1;
      return by;
    },
    // The clock back first: a timer the runner clears at its stop is the test clock's no longer (shell/hearing/runner-clocks.test.mjs).
    done: () => {
      t.mock.timers.reset();
      stop();
    },
  };
}

/** What a tab on `hash` reads for these notices, the quiet after them included: how many, so the clock moves by the notice. */
async function readFor(t, hash, notices, { erasure }) {
  const r = await tab(t, hash, REAL, MINUTE);
  await r.replay(notices, { erasure });
  await r.advance(MINUTE);
  const out = { total: r.reads.length, counts: r.counts() };
  r.done();
  return out;
}

test("the press of fifty, on People: ten reads where it was seventy-five, and each surface twice", async (t) => {
  const before = await readFor(t, "#/people", PRESS_OF_50, { erasure: false });
  const after = await readFor(t, "#/people", PRESS_OF_50, { erasure: true });
  t.diagnostic(`press of 50 on People, before: ${before.total} reads ${JSON.stringify(before.counts)}`);
  t.diagnostic(`press of 50 on People, after: ${after.total} reads ${JSON.stringify(after.counts)}`);
  assert.deepEqual(
    before.counts,
    { calendar: 17, conversations: 17, inbox: 17, people: 17, today: 7 },
    "with no word of the erasure a tab reads as it did on 5 Nov: people_list 43 times is these 17 reads at 2.5 pages each",
  );
  assert.deepEqual(
    after.counts,
    { calendar: 2, conversations: 2, inbox: 2, people: 2, today: 2 },
    "REGRESSION: every surface read again in each gap longer than its 400 ms",
  );
});

test("the press of fifty, on Today and on the Inbox: the same few reads, wherever the owner is looking", async (t) => {
  for (const hash of ["#/today", "#/inbox"]) {
    const before = await readFor(t, hash, PRESS_OF_50, { erasure: false });
    const after = await readFor(t, hash, PRESS_OF_50, { erasure: true });
    t.diagnostic(`press of 50 on ${hash}, before: ${before.total} ${JSON.stringify(before.counts)}`);
    t.diagnostic(`press of 50 on ${hash}, after: ${after.total} ${JSON.stringify(after.counts)}`);
    assert.ok(after.total * 5 <= before.total, `${hash}: ${after.total} reads, was ${before.total}`);
    for (const [key, n] of Object.entries(after.counts)) assert.ok(n <= 2, `${hash}: ${key} read ${n} times`);
  }
});

test("a press of 5,000 paced 300 ms apart: 25 minutes, and a read of each surface every half a minute", async (t) => {
  const press = paced(5_000, 300);
  const before = await readFor(t, "#/people", press, { erasure: false });
  const after = await readFor(t, "#/people", press, { erasure: true });
  t.diagnostic(`press of 5,000 on People, before: ${before.total} reads ${JSON.stringify(before.counts)}`);
  t.diagnostic(`press of 5,000 on People, after: ${after.total} reads ${JSON.stringify(after.counts)}`);
  for (const key of ["calendar", "conversations", "inbox", "today"]) assert.equal(before.counts[key], 500, key);
  assert.equal(before.counts.people, 125, "a dear read's twelve seconds");
  for (const [key, n] of Object.entries(after.counts)) assert.ok(n <= 52, `${key} read ${n} times in 25 minutes`);
  assert.ok(after.total * 8 <= before.total, `${after.total} reads, was ${before.total}`);
});

test("a stream is never starved: while it runs each surface is read within half a minute of the last", async (t) => {
  const r = await tab(t, "#/people");
  try {
    await r.replay(paced(1_000, 300), { erasure: true });
    for (const key of ["people", "inbox", "today", "calendar", "conversations"]) {
      const at = r.readsOf(key).map((x) => x.at);
      assert.ok(at.length >= 9, `${key}: ${at.length} reads in five minutes`);
      for (let i = 1; i < at.length; i += 1)
        assert.ok(at[i] - at[i - 1] <= 30 * SECOND, `${key}: ${at[i] - at[i - 1]} ms`);
    }
  } finally {
    r.done();
  }
});

test("a stream's end is read five seconds after its last notice, and nothing after", async (t) => {
  const r = await tab(t, "#/people");
  try {
    await r.replay(PRESS_OF_50, { erasure: true });
    const ended = Date.now();
    await r.advance(4_999);
    assert.deepEqual(
      r.readsOf("people").filter((x) => x.at >= ended),
      [],
      "not before the five seconds",
    );
    await r.advance(1);
    assert.deepEqual(
      r
        .readsOf("people")
        .filter((x) => x.at >= ended)
        .map((x) => x.at - ended),
      [5_000],
    );
    const so = r.reads.length;
    await r.advance(2 * MINUTE);
    assert.equal(r.reads.length, so, "the stream asks for nothing more");
  } finally {
    r.done();
  }
});

test("a person erased alone is read as fast as ever: a teammate's Delete leaves the other tab in 400 ms", async (t) => {
  const r = await tab(t, "#/people");
  try {
    const told = Date.now();
    await r.tell(THREAD_GONE, { erasure: true });
    await r.tell(TOMBSTONE, { erasure: true });
    await r.advance(399);
    assert.deepEqual(r.readsOf("people"), []);
    await r.advance(1);
    assert.deepEqual(
      r.readsOf("people").map((x) => x.at - told),
      [400],
      "the runner's own wait",
    );
    assert.deepEqual(
      r.readsOf("inbox").map((x) => x.at - told),
      [400],
    );
    await r.advance(400);
    assert.deepEqual(
      r.readsOf("today").map((x) => x.at - told),
      [800],
      "Today's own",
    );
  } finally {
    r.done();
  }
});

test("a press of two is no stream, and a Delete every few seconds is none either: each is read as it comes", async (t) => {
  const r = await tab(t, "#/people");
  try {
    // Two people, 100 ms apart, as the first press on the new build ran (5 Nov 2026 14:47Z).
    const told = Date.now();
    await r.replay(paced(2, 100), { erasure: true });
    await r.advance(400);
    assert.deepEqual(
      r.readsOf("people").map((x) => x.at - told),
      [501],
      "400 ms after the last of them",
    );

    // One at a time, each past the five seconds that end a stream.
    for (let i = 0; i < 3; i += 1) {
      await r.advance(6 * SECOND);
      r.reads.length = 0;
      const again = Date.now();
      await r.tell(THREAD_GONE, { erasure: true });
      await r.tell(TOMBSTONE, { erasure: true });
      await r.advance(400);
      assert.deepEqual(
        r.readsOf("people").map((x) => x.at - again),
        [400],
        `Delete ${i + 1}`,
      );
    }
  } finally {
    r.done();
  }
});

/** A surface's read after a notice told now: how long it took, at most `ceiling` of the clock. */
async function readAfterTold(r, key, ceiling) {
  const told = Date.now();
  const before = r.readsOf(key).length;
  for (let ms = 0; ms < ceiling && r.readsOf(key).length === before; ms += 100) await r.advance(100);
  const read = r.readsOf(key)[before];
  assert.ok(read, `${key} was not read within ${ceiling} ms of the notice`);
  return read.at - told;
}

for (const [what, notice, heardBy] of [
  ["a customer's message", ["messages", "INSERT"], ["inbox", "conversations"]],
  ["a thread's own change", ["conversations", "UPDATE"], ["inbox", "conversations"]],
  ["a teammate's rename", TOMBSTONE, ["inbox", "conversations", "calendar"]],
  ["a hold opened", ["escalations", "INSERT"], ["inbox", "conversations"]],
]) {
  test(`${what} in the middle of a stream is read at once, not at the stream's pace`, async (t) => {
    for (const key of heardBy) {
      const r = await tab(t, "#/people");
      try {
        // Twenty seconds in, the read the stream is waiting out is long overdue by the runner's own three seconds.
        await r.replay(paced(66, 300), { erasure: true });
        await r.tell(notice);
        const took = await readAfterTold(r, key, 3 * SECOND);
        assert.ok(took <= 400, `${key} read ${took} ms after ${what}`);
      } finally {
        r.done();
      }
    }
  });
}

/**
 * The longest `key` waits for this notice, the stream going on around it, told at each moment of the three seconds after a
 * read and with one long overdue: a stream's notices restart a wait until three seconds after the first, today as now, so that
 * is the speed to hold.
 */
async function longestWait(t, notice, key, { erasure }) {
  let most = 0;
  for (const people of [66, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]) {
    const r = await tab(t, "#/people");
    try {
      await r.replay(paced(people, 300), { erasure });
      await r.tell(notice);
      const told = Date.now();
      const before = r.readsOf(key).length;
      await r.replay(paced(12, 300), { erasure });
      await r.advance(400);
      const read = r.readsOf(key)[before];
      assert.ok(read, `${key} unread 4 s after the notice, ${people} people in`);
      most = Math.max(most, read.at - told);
    } finally {
      r.done();
    }
  }
  return most;
}

for (const [what, notice] of [
  ["a customer's message", ["messages", "INSERT"]],
  ["a teammate's rename", TOMBSTONE],
]) {
  test(`${what} is never later in a stream than it is today, whenever in the stream it comes`, async (t) => {
    const today = await longestWait(t, notice, "inbox", { erasure: false });
    const now = await longestWait(t, notice, "inbox", { erasure: true });
    t.diagnostic(`${what}, the Inbox's longest wait in a stream: today ${today} ms, now ${now} ms`);
    assert.ok(now <= today, `${now} ms, today ${today} ms`);
  });
}

test("a teammate's rename on People, in a stream, is read at People's own pace, never the stream's", async (t) => {
  const r = await tab(t, "#/people");
  try {
    await r.replay(paced(66, 300), { erasure: true });
    await r.tell(TOMBSTONE);
    assert.ok((await readAfterTold(r, "people", 12 * SECOND)) <= 400, "People's read was already overdue");
  } finally {
    r.done();
  }
});

test("a read asked for by an erasure and something else goes at the something else's pace, and the stream resumes after it", async (t) => {
  const r = await tab(t, "#/people");
  try {
    await r.replay(paced(40, 300), { erasure: true });
    await r.tell(["messages", "INSERT"]);
    await r.advance(400);
    r.reads.length = 0;
    await r.replay(paced(40, 300), { erasure: true });
    assert.deepEqual(r.readsOf("inbox"), [], "twelve more seconds of the stream ask for no read: back to its own wait");
  } finally {
    r.done();
  }
});

test("a surface that waits longer than the stream keeps its own wait", async (t) => {
  const r = await tab(t, "#/people", [
    { key: "slow", refreshOnTables: ["contacts"], debounceMs: 60 * SECOND, maxWaitMs: 2 * MINUTE },
  ]);
  try {
    const told = Date.now();
    await r.replay(paced(6, 400), { erasure: true });
    assert.deepEqual(r.reads, []);
    await r.advance(60 * SECOND - 1);
    assert.deepEqual(r.reads, [], "the stream's five seconds shorten nothing");
    await r.advance(1);
    assert.deepEqual(
      r.reads.map((x) => x.at - told),
      [2_001 + 60_000],
      "sixty seconds after the last, as it asked",
    );
  } finally {
    r.done();
  }
});

test("the feed hands a tab the notice's word of the erasure, and no word where it said none", async () => {
  const told = { table: "contacts", op: "UPDATE", at: "2026-11-05T14:50:48.053Z" };
  const said = await changesOf({ event: "UPDATE", payload: { ...told, erasure: true } });
  assert.deepEqual(
    said.map((c) => c.row),
    [{ tenant_id: "ws-1", erasure: true }],
  );
  const plain = await changesOf({ event: "UPDATE", payload: told });
  assert.deepEqual(
    plain.map((c) => c.row),
    [{ tenant_id: "ws-1" }],
    "a database before 00549, and any other write",
  );
  const odd = await changesOf({ event: "UPDATE", payload: { ...told, erasure: "yes" } });
  assert.deepEqual(
    odd.map((c) => c.row),
    [{ tenant_id: "ws-1" }],
    "only the word itself",
  );
  // A call's notice, each status a change of its own, carries it on each.
  const call = await changesOf({
    event: "DELETE",
    payload: { table: "calls", op: "DELETE", statuses: ["ended", "ongoing"], erasure: true },
  });
  assert.deepEqual(
    call.map((c) => c.row),
    [
      { tenant_id: "ws-1", status: "ended", erasure: true },
      { tenant_id: "ws-1", status: "ongoing", erasure: true },
    ],
  );
});
