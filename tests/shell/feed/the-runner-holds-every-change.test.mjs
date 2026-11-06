/**
 * The runner holds every change it is told of, whatever order the world does things in (the page-open PRD of 3 Nov 2026,
 * L4): a model of the world beside the real runner (legacy-bridge/surface-runner.ts), run over many seeded sequences.
 *
 * The world: tables whose versions move as writes commit, each write a transaction of its own length; the feed, which
 * delivers each commit's notice late, sometimes twice, and loses every one told while the tab is loading, joining or
 * dropped; reads that take their time and sometimes fail; a page put away and brought back. The tab: three surfaces, each
 * hearing its own tables, on the real runner with the topic's catch-up (hearing/catch-up.ts) handed in.
 *
 * The invariant, once the world goes quiet for a minute (well inside the 15-minute heal, which is never relied on): every
 * surface's last read holds the newest version of every table it hears. Two counter-models prove the test can fail: with a
 * notice's clock its transaction's first statement (as before 00507), and with no catch-up on a join (as before 0019's
 * step 4), some seed leaves a surface stale.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
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
  if (doc.visibilityState === state) return;
  doc.visibilityState = state;
  for (const fn of [...docListeners]) fn({ type: "visibilitychange" });
};

const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");

/** A small, seeded generator: the same seed, the same world. */
function rng(seed) {
  let x = seed * 2654435761 + 1;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const flush = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
};

const TABLES = ["messages", "deals", "person_notes", "appointments"];
const STEP_MS = 50;
const BUSY_MS = 15_000;
const QUIET_MS = 60_000;

/**
 * One world, run to its end: what each surface last held of each table it hears, against the tables' versions.
 * `clock`: "commit" (00507) or "first-statement" (before it); `catchUp`: whether the runner is handed the topic's catch-up.
 */
async function world(t, seed, { clock = "commit", catchUp = true } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  setVisibility("visible");
  const r = rng(seed);
  const version = Object.fromEntries(TABLES.map((x) => [x, 0]));
  /** Every notice the topic told: its table and its clock, as the catch-up reads them back. */
  const told = [];
  let feed = null;
  let report = null;
  let subscribed = false;
  let up = true;
  let failing = false;
  const held = new Map();
  const later = (ms, fn) => setTimeout(fn, ms);

  const specs = [
    { name: "threads", hears: ["messages"] },
    { name: "book", hears: ["deals", "person_notes"] },
    { name: "visits", hears: ["appointments"], debounceMs: 800, maxWaitMs: 6_000 },
  ];
  const overrides = specs.map(({ name, hears, ...rest }) => {
    const key = `${name}-${seed}-${clock}-${catchUp}`;
    return {
      key,
      hears,
      refreshOnTables: hears,
      ...rest,
      apply: async () => {
        const took = between(r, 40, 600);
        const fails = failing && r() < 0.6;
        await new Promise((res) => later(Math.floor(took / 2), res));
        if (fails) throw new Error("busy");
        const seen = Object.fromEntries(hears.map((x) => [x, version[x]]));
        await new Promise((res) => later(Math.ceil(took / 2), res));
        held.set(key, seen);
      },
    };
  });

  const deliver = (notice) => {
    if (feed && subscribed && up) feed({ tenant_id: "t1" }, notice.table, "INSERT", notice.at);
  };
  /** A write: a transaction `long` ms long, committed at its end; the notice goes at the commit, late, maybe twice. */
  const write = (table, long) => {
    const began = Date.now();
    later(long, () => {
      version[table] += 1;
      const at = new Date(clock === "commit" ? Date.now() : began).toISOString();
      const notice = { table, at, atMs: Date.parse(at) };
      told.push(notice);
      const late = between(r, 20, 300);
      later(late, () => deliver(notice));
      if (r() < 0.2) later(late + between(r, 10, 400), () => deliver(notice));
    });
  };

  const stop = startSurfaces(
    overrides,
    (onChange, opts) => {
      feed = onChange;
      report = opts.onStatus;
      // The join is answered a moment later.
      later(between(r, 100, 1_500), () => {
        subscribed = true;
        report?.("SUBSCRIBED");
      });
      return () => {};
    },
    catchUp
      ? async (sinceMs) =>
          told.filter((n) => n.atMs >= sinceMs - 250).map((n) => ({ ...n, event: "INSERT", statuses: null }))
      : undefined,
  );

  // The busy part: writes from the first moment (the boot is reading), drops and rejoins, the page put away, reads failing.
  for (let at = 0; at < BUSY_MS; at += STEP_MS) {
    const p = r();
    if (p < 0.06) write(TABLES[between(r, 0, TABLES.length - 1)], between(r, 0, 1_500));
    else if (p < 0.065 && up && subscribed) {
      up = false;
      report?.("CHANNEL_ERROR");
      later(between(r, 1_000, 4_000), () => {
        up = true;
        report?.("SUBSCRIBED");
      });
    } else if (p < 0.07 && doc.visibilityState === "visible") {
      setVisibility("hidden");
      later(between(r, 1_000, 40_000), () => setVisibility("visible"));
    } else if (p < 0.073) failing = !failing;
    t.mock.timers.tick(STEP_MS);
    await flush();
  }
  // The world goes quiet: nothing written, the feed up, the page in front, reads answered.
  failing = false;
  for (let at = 0; at < QUIET_MS; at += STEP_MS) {
    if (at === 45_000) setVisibility("visible");
    t.mock.timers.tick(STEP_MS);
    await flush();
  }
  stop();
  setVisibility("visible");
  return overrides.flatMap((o) =>
    o.hears
      .filter((x) => (held.get(o.key)?.[x] ?? -1) !== version[x])
      .map((x) => `${o.key} holds ${x} v${held.get(o.key)?.[x] ?? "none"} of v${version[x]}`),
  );
}

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

test("whatever the order, every surface holds the newest of what it hears once the world goes quiet", async (t) => {
  for (const seed of SEEDS)
    await t.test(`seed ${seed}`, async (tt) => {
      assert.deepEqual(await world(tt, seed), [], `seed ${seed}: a surface left stale`);
    });
});

test("the model can fail: a notice clocked at its transaction's first statement leaves some surface stale (before 00507)", async (t) => {
  let stale = 0;
  for (const seed of SEEDS)
    await t.test(`seed ${seed}`, async (tt) => {
      if ((await world(tt, seed, { clock: "first-statement" })).length) stale += 1;
    });
  assert.ok(stale > 0, "no seed caught a read begun inside a long transaction dropping its notice");
});

test("a change made after the boot read and before the join is read on the join, by the catch-up (0019 step 4)", async (t) => {
  for (const catchUp of [true, false])
    await t.test(catchUp ? "with the catch-up: read" : "without it, as before step 4: missed", async (tt) => {
      tt.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
      setVisibility("visible");
      let version = 0;
      const told = [];
      let held = -1;
      let report = null;
      const key = `visits-joined-${catchUp}`;
      const stop = startSurfaces(
        [
          {
            key,
            refreshOnTables: ["appointments"],
            apply: async () => {
              held = version;
            },
          },
        ],
        (_onChange, opts) => {
          report = opts.onStatus;
          return () => {};
        },
        catchUp ? async (since) => told.filter((n) => n.atMs >= since - 250) : undefined,
      );
      await flush();
      assert.equal(held, 0, "the boot read the visits");
      // A visit is booked while the tab is still joining: its notice is told before the join, and never delivered.
      tt.mock.timers.tick(300);
      version += 1;
      const at = new Date().toISOString();
      told.push({ table: "appointments", event: "INSERT", statuses: null, at, atMs: Date.parse(at) });
      tt.mock.timers.tick(700);
      report?.("SUBSCRIBED");
      for (let i = 0; i < 40; i += 1) {
        tt.mock.timers.tick(STEP_MS);
        await flush();
      }
      stop();
      assert.equal(held === version, catchUp, catchUp ? "the catch-up read the visit" : "the join read nothing for it");
    });
});
