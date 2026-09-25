/**
 * The arithmetic the Ask scripts share (eval-ask.mjs, ask-day.mjs): a spread
 * over timings and a Wilson interval on a pass rate. Pure; executed here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spread, wilson, pct, ms } from "../ask-stats.mjs";

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
