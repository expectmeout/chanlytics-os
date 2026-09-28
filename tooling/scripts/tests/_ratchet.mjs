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
 *   - `UPDATE_BASELINES=1 pnpm test` banks what fell and drops what is gone, and
 *     nothing else: a rise, or a new key, stays a red build;
 *   - `UPDATE_BASELINES=raise pnpm test` writes every baseline as measured, rises
 *     and new keys included. It is the one way a number goes up, and the change
 *     that uses it argues each rise in docs/debt.md ("Rises, each with its
 *     reason") and in its pull request.
 *
 * Failing on a reduction that was not banked is deliberate and is the whole
 * device: a reduction nobody wrote down is a reduction the next pull request
 * can spend without anyone seeing the total move. Banking only reductions is the
 * same device from the other side: the command that banks a fall used to bank a
 * rise too, silently, because it wrote the measure and then compared the measure
 * with itself. The baselines live under tooling/scripts/tests/baselines/ and
 * docs/debt.md names each one.
 *
 * `compare` and `bank` are also knip's (check-dead-exports.mjs), so a dead export
 * rises, falls and banks by the same rule as every other number.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./_source.mjs";

export const BASELINES_DIR = "tooling/scripts/tests/baselines";
/** `UPDATE_BASELINES=raise` also takes every rise; `=1` only the falls. */
export const RAISE = process.env.UPDATE_BASELINES === "raise";
export const BANK = process.env.UPDATE_BASELINES === "1" || RAISE;
export const BANK_HINT = "UPDATE_BASELINES=1 pnpm test";
export const RAISE_HINT = "UPDATE_BASELINES=raise pnpm test";

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

/**
 * Write a file whole or not at all: the register reads the baselines while the
 * ratchets bank them, and the docs' tests read the pages a bank rewrites (the
 * runner starts test files in parallel), and a rename is the one write a reader
 * never sees half done.
 */
function writeWhole(p, text) {
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
}

/** A baseline, written whole: the ratchets', the source-scan ratchet's and knip's (check-dead-exports.mjs). */
export function writeBaseline(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  writeWhole(p, JSON.stringify(value, null, 2) + "\n");
}

/*
 * The pages a bank writes. What a page holds between two markers (docs/debt.md's and docs/takeover.md's measured
 * block, docs/architecture.md's tree) is written by the command that banks, never typed by hand, and a plain run fails
 * when the block and what it is written from disagree.
 */

/** A page as text, normalised to LF: a page is prose, not code, and a Windows checkout must read the same. */
export const readPage = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").split("\r\n").join("\n");

/** What a page holds between its two markers, trimmed; null when it has not both, in that order. */
export function blockIn(rel, [start, end]) {
  const text = readPage(rel);
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  return a >= 0 && b > a ? text.slice(a + start.length, b).trim() : null;
}

/**
 * Write `block` between a page's markers, a blank line either side, and the page whole (`writeWhole`). A page without
 * its markers is left alone, and the plain run that reads it says so.
 */
export function writeBlock(rel, [start, end], block) {
  const now = readPage(rel);
  const a = now.indexOf(start);
  const b = now.indexOf(end);
  if (a < 0 || b < a) return;
  writeWhole(path.join(ROOT, rel), now.slice(0, a + start.length) + "\n\n" + block + "\n\n" + now.slice(b));
}

/** A number, or each field of a record, taken as the lower of now and was; a field was lacks is new, so 0. */
function lower(now, was) {
  if (typeof now === "number") return Math.min(now, typeof was === "number" ? was : 0);
  return Object.fromEntries(Object.entries(now).map(([f, n]) => [f, Math.min(n, was?.[f] ?? 0)]));
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
 * What changed between a measure and its baseline, as the lines a failing build prints.
 * `worse`: new keys and, in "count" mode, numbers that rose. `better`: keys gone and
 * numbers that fell, which are banked. In "set" mode the numbers beside a key are a
 * record, so a rise is not worse; a fall is still banked, so the record stays true.
 */
export function compare(now, baseline, mode = "count") {
  const worse = [];
  const better = [];
  for (const k of Object.keys(now).sort()) {
    if (!(k in baseline)) worse.push(`${k}: new (${show(now[k])})`);
    else if (mode === "count" && rose(now[k], baseline[k]))
      worse.push(`${k}: now ${show(now[k])}, baseline ${show(baseline[k])}`);
  }
  for (const k of Object.keys(baseline).sort()) {
    if (!(k in now)) better.push(`${k}: gone (baseline ${show(baseline[k])})`);
    else if (fell(now[k], baseline[k])) better.push(`${k}: now ${show(now[k])}, baseline ${show(baseline[k])}`);
  }
  return { worse, better };
}

/**
 * The baseline a bank writes. Plainly: each key both hold, at the lower of the two
 * (in "set" mode, at the measure: a record, not a limit); a key that went away is
 * dropped; a new key is not written. With `raise`: the measure as it is. A missing
 * baseline is seeded only by a raise (null otherwise: write nothing). Banking what
 * was just banked changes nothing, so a reader racing the writer reads the same.
 */
export function bank(now, baseline, { mode = "count", raise = false } = {}) {
  if (raise) return sortedKeys(now);
  if (!baseline) return null;
  const out = {};
  for (const k of Object.keys(now).sort()) {
    if (k in baseline) out[k] = mode === "set" ? now[k] : lower(now[k], baseline[k]);
  }
  return out;
}

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
    const banked = bank(now, readBaseline(file), { mode, raise: RAISE });
    if (banked) writeBaseline(p, banked);
  }
  const baseline = readBaseline(file);

  test(`${name}: nothing got worse`, () => {
    assert.ok(baseline, `${BASELINES_DIR}/${file} is missing — seed it: ${RAISE_HINT}`);
    assert.deepEqual(
      compare(now, baseline, mode).worse,
      [],
      `${advice} A number that must rise is raised with ${RAISE_HINT}, in the same diff as its row under "Rises" in docs/debt.md, with the reason in the pull request.`,
    );
  });

  test(`${name}: the baseline is not stale`, () => {
    assert.ok(baseline, `${BASELINES_DIR}/${file} is missing — seed it: ${RAISE_HINT}`);
    assert.deepEqual(compare(now, baseline, mode).better, [], `good — now bank it: ${BANK_HINT}`);
  });

  return { now, baseline };
}
