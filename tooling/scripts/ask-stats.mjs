/**
 * The arithmetic the Ask scripts share (eval-ask.mjs, ask-day.mjs): a spread
 * over a list of timings, and a Wilson interval on a pass rate, so a run of
 * twenty-eight cases says "27 of 28 (95%: 82–99%)" and not "96%". Pure;
 * executed in tooling/scripts/tests/ask/ask-stats.test.mjs.
 */

/** The median and the slowest tenth of the numbers that exist in `xs`. */
export function spread(xs) {
  const s = xs.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return { n: 0, median: null, p90: null };
  return {
    n: s.length,
    median: s[Math.floor(s.length / 2)],
    p90: s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * 0.9) - 1))],
  };
}

/** The 95% Wilson score interval on k passes of n, as [low, high] in 0..1; [0, 0] for no trials. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

/** A ratio as a whole percent. */
export const pct = (x) => `${Math.round(x * 100)}%`;

/** A millisecond figure for a table cell; a dash where there is none. */
export const ms = (n) => (typeof n === "number" ? `${Math.round(n)} ms` : "—");
