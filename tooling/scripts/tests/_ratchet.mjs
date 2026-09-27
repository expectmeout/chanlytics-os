/**
 * A ratchet: a measurement the build holds at its current number, which may
 * only fall. The pattern is source-scan-ratchet.test.mjs's, made reusable:
 *
 *   - `measure()` returns `{ key: number | { field: number } }` — one entry per
 *     offender (a function, a file, a name, a directory), by a key that survives
 *     edits elsewhere;
 *   - a key not in the baseline is a new offender, and fails;
 *   - a key whose numbers rose fails; one whose numbers fell, or that is gone,
 *     also fails, with the instruction to bank it;
 *   - `UPDATE_BASELINES=1 pnpm test` rewrites every baseline from the measure.
 *
 * Failing on a reduction that was not banked is deliberate and is the whole
 * device: a reduction nobody wrote down is a reduction the next pull request
 * can spend without anyone seeing the total move. The baselines live under
 * tooling/scripts/tests/baselines/ and docs/debt.md names each one.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./_source.mjs";

export const BASELINES_DIR = "tooling/scripts/tests/baselines";
export const BANK = process.env.UPDATE_BASELINES === "1";
export const BANK_HINT = "UPDATE_BASELINES=1 pnpm test";

const sortedKeys = (o) =>
  Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, o[k]]),
  );

export function readBaseline(file) {
  const p = path.join(ROOT, BASELINES_DIR, file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

function rose(now, was) {
  if (typeof now === "number") return now > (typeof was === "number" ? was : 0);
  return Object.keys(now).some((f) => now[f] > (was && typeof was === "object" ? (was[f] ?? 0) : 0));
}

function fell(now, was) {
  if (typeof was === "number") return typeof now === "number" && now < was;
  return Object.keys(was).some((f) => (typeof now === "object" && now ? (now[f] ?? 0) : 0) < was[f]);
}

const show = (v) =>
  typeof v === "number"
    ? String(v)
    : Object.entries(v)
        .map(([f, n]) => `${f} ${n}`)
        .join(", ");

/**
 * Register the two tests of one ratchet.
 *
 * `advice` is what to do when the number rose: the sentence a failing build shows.
 * `mode` is "count" (each key's numbers may only fall) or "set" (the keys may
 * only go away; the numbers beside them are a record, not a limit — a global's
 * reader count may rise, a new global may not appear).
 */
export function ratchet({ name, file, measure, advice, mode = "count" }) {
  const now = sortedKeys(measure());
  const p = path.join(ROOT, BASELINES_DIR, file);
  if (BANK) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(now, null, 2) + "\n");
  }
  const baseline = readBaseline(file);

  test(`${name}: nothing got worse`, () => {
    assert.ok(baseline, `${BASELINES_DIR}/${file} is missing — seed it: ${BANK_HINT}`);
    const worse = [];
    for (const [k, v] of Object.entries(now)) {
      if (!(k in baseline)) worse.push(`${k}: new (${show(v)})`);
      else if (mode === "count" && rose(v, baseline[k]))
        worse.push(`${k}: now ${show(v)}, baseline ${show(baseline[k])}`);
    }
    assert.deepEqual(
      worse,
      [],
      `${advice} A number that must rise is raised in the baseline, in the same diff, with the reason in the pull request.`,
    );
  });

  test(`${name}: the baseline is not stale`, () => {
    assert.ok(baseline, `${BASELINES_DIR}/${file} is missing — seed it: ${BANK_HINT}`);
    const gone = [];
    const shrank = [];
    for (const [k, v] of Object.entries(baseline)) {
      if (!(k in now)) gone.push(`${k} (baseline ${show(v)})`);
      else if (fell(now[k], v)) shrank.push(`${k}: now ${show(now[k])}, baseline ${show(v)}`);
    }
    assert.deepEqual([...gone, ...shrank], [], `good — now bank it: ${BANK_HINT}`);
  });

  return { now, baseline };
}
