/**
 * Waiting on work outside the page has one pace (bridge/hearing/wait-for.ts, the page-open PRD of 3 Nov 2026, L2):
 * it asks again at the page's first wait, slower each time (×1.5 up to the ceiling), never while the page is hidden (once as
 * it comes back), never twice at once, and stops when what it waited for has come or when it has waited too long. And a
 * read the server refused with a wait (a limit's `retry-after`) is asked again no sooner than the server said.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const { waitFor } = await importSrc("apps/dashboard/src/bridge/hearing/wait-for.ts");

/** A world with a clock a test moves, its timers, a page shown or hidden, and the page's return heard. */
function world() {
  let now = 0;
  let timers = [];
  let hidden = false;
  const shown = new Set();
  return {
    w: {
      now: () => now,
      later: (fn, ms) => {
        const t = { at: now + ms, fn };
        timers.push(t);
        return () => (timers = timers.filter((x) => x !== t));
      },
      hidden: () => hidden,
      onShown: (fn) => (shown.add(fn), () => shown.delete(fn)),
    },
    /** Move the clock by `ms`, running each timer due on the way, in order. */
    async pass(ms) {
      const end = now + ms;
      for (;;) {
        const next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        timers = timers.filter((t) => t !== next);
        now = next.at;
        next.fn();
        for (let i = 0; i < 5; i += 1) await Promise.resolve();
      }
      now = end;
    },
    hide: () => (hidden = true),
    show() {
      hidden = false;
      for (const fn of shown) fn();
    },
    pending: () => timers.length,
  };
}

test("it asks at the first wait, then slower each time, to the ceiling", async () => {
  const at = [];
  const W = world();
  const stop = waitFor({ everyMs: 1000, ceilingMs: 3000, read: () => at.push(W.w.now()) }, W.w);
  await W.pass(12_000);
  assert.deepEqual(at, [1000, 2500, 4750, 7750, 10_750], "1 s, then 1.5, 2.25, then 3 s at the ceiling");
  stop();
  assert.equal(W.pending(), 0, "the stop takes its timer back");
});

test("it stops when what it waits for has come, and when it has waited too long", async () => {
  const W = world();
  let come = false;
  let asked = 0;
  waitFor({ everyMs: 1000, read: () => (asked += 1), until: () => come }, W.w);
  await W.pass(1000);
  come = true;
  await W.pass(10_000);
  assert.equal(asked, 1, "nothing asked once it came");

  const L = world();
  let late = 0;
  waitFor({ everyMs: 1000, ceilingMs: 1000, maxMs: 3500, read: () => (late += 1) }, L.w);
  await L.pass(60_000);
  assert.equal(late, 3, "three asks, then the wait ran out");
  assert.equal(L.pending(), 0);
});

test("a hidden page asks nothing, and asks once as it comes back in front", async () => {
  const W = world();
  let asked = 0;
  waitFor({ everyMs: 1000, read: () => (asked += 1) }, W.w);
  W.hide();
  await W.pass(30_000);
  assert.equal(asked, 0, "nobody is looking");
  W.show();
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  assert.equal(asked, 1, "back in front: asked at once");
});

test("a read still out is never asked again beside it", async () => {
  const W = world();
  let asked = 0;
  let land = () => {};
  waitFor({ everyMs: 1000, ceilingMs: 1000, read: () => ((asked += 1), new Promise((r) => (land = r))) }, W.w);
  await W.pass(5000);
  assert.equal(asked, 1, "one read out, however long it takes");
  land();
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await W.pass(1500);
  assert.equal(asked, 2, "the next ask waits its pace from when the read landed");
});

test("a read refused with a wait is asked again no sooner than the server said", async () => {
  const { ApiError } = await importSrc("apps/dashboard/src/client/api.ts");
  const { activateOverride, readRefusedFor } = await importSrc("apps/dashboard/src/bridge/surface-data.ts");
  const was = console.error;
  console.error = () => {};
  try {
    const o = {
      key: "limited",
      reads: [],
      fresh: "live",
      apply: async () => {
        throw new ApiError("rate_limited", 429, "Too many at once.", 30);
      },
    };
    assert.equal(await activateOverride(o), false);
    assert.equal(readRefusedFor("limited"), 30_000, "the server's 30 s, kept for the runner's retry");
    o.apply = async () => {};
    assert.equal(await activateOverride(o), true);
    assert.equal(readRefusedFor("limited"), null, "a read that lands forgets it");
  } finally {
    console.error = was;
  }
});
