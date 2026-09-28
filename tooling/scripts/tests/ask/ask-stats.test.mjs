/**
 * The arithmetic the Ask scripts share (eval-ask.mjs, ask-day.mjs): a spread
 * over timings and a Wilson interval on a pass rate. Pure; executed here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spread, wilson, pct, ms, missTally } from "../../ask-stats.mjs";

test("the stats: a spread is the median and the slowest tenth over the numbers that exist; a Wilson interval brackets a pass rate and never leaves 0..1", () => {
  assert.deepEqual(spread([5, 1, 3, null, undefined, NaN]), { n: 3, median: 3, p90: 5 });
  assert.deepEqual(spread([]), { n: 0, median: null, p90: null });
  const [lo, hi] = wilson(27, 28);
  assert.ok(lo > 0.8 && lo < 0.9 && hi > 0.99 && hi <= 1, `27 of 28 is about 82–99%, got ${lo}–${hi}`);
  assert.deepEqual(wilson(0, 0), [0, 0]);
  assert.deepEqual(
    wilson(3, 3).map((x) => x <= 1 && x >= 0),
    [true, true],
  );
  assert.equal(pct(0.964), "96%");
  assert.deepEqual([ms(1234.4), ms(null)], ["1234 ms", "—"]);
});

test("why rounds missed the cache (the Phase 6 plan, D2): each reason the API gave, counted by round, the most first; a round that said nothing, and a turn from before, are not counted", () => {
  assert.deepEqual(
    missTally([
      { cache_miss: [null, "tools_changed"] },
      { cache_miss: ["tools_changed", "pending"] },
      { cache_miss: ["system_changed"] },
      {},
      { cache_miss: null },
    ]),
    [
      { reason: "tools_changed", rounds: 2 },
      { reason: "pending", rounds: 1 },
      { reason: "system_changed", rounds: 1 },
    ],
  );
  assert.deepEqual(missTally([]), []);
});

test("the nightly's verdict on Ask's day (the Phase 6 plan, D4): a forced miss crosses the cache line and names the most-given reason, a slow day crosses the first-text line, too few turns judge nothing, and a day on its lines holds", async () => {
  const { askDayVerdict, ASK_DAY_LINES } = await import("../../ask-stats.mjs");
  assert.deepEqual(ASK_DAY_LINES, { minTurns: 10, cacheHit: 0.5, firstTextMs: 6_000 });
  const missed = askDayVerdict({
    turns: 16,
    cacheHit: 0.04,
    firstTextMs: 3_400,
    misses: [
      { reason: "tools_changed", rounds: 21 },
      { reason: "pending", rounds: 2 },
    ],
  });
  assert.equal(missed.ok, false);
  assert.equal(
    missed.line,
    "Ask's day crossed a line: median cache hit 4%, under 50%, over 16 turns. The most-given cache miss: tools_changed (21 rounds).",
  );
  const slow = askDayVerdict({ turns: 12, cacheHit: 0.8, firstTextMs: 7_250 });
  assert.equal(slow.ok, false);
  assert.equal(slow.line, "Ask's day crossed a line: median first text 7250 ms, over 6000 ms, over 12 turns.");
  const both = askDayVerdict({ turns: 12, cacheHit: 0.3, firstTextMs: 9_000 });
  assert.match(both.line, /median cache hit 30%, under 50%; median first text 9000 ms, over 6000 ms/);
  assert.deepEqual(askDayVerdict({ turns: 9, cacheHit: 0, firstTextMs: 60_000 }), {
    ok: true,
    line: "Ask's day: 9 answered turns, under the 10 a median needs; nothing judged.",
  });
  const held = askDayVerdict({ turns: 16, cacheHit: 0.5, firstTextMs: 6_000 });
  assert.equal(held.ok, true, "on the line is not over it");
  assert.equal(
    held.line,
    "Ask's day holds its lines: 16 turns, median cache hit 50% (line 50%), median first text 6000 ms (line 6000 ms).",
  );
  assert.equal(
    askDayVerdict({ turns: 16, cacheHit: null, firstTextMs: null }).ok,
    true,
    "nothing measured crosses nothing",
  );
});
