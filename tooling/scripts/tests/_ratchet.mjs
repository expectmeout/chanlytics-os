/**
 * What the numbers the build holds share: how a measure is compared with the main it stands on, and the two lists a
 * person keeps by hand beside them.
 *
 * A measure returns `{ key: number | { field: number } }`, one entry per offender (a function, a file, a name, a
 * directory) by a key that survives edits elsewhere. Since 28 October 2026 (decision 0074) a number is held change by
 * change: check:debt (tooling/scripts/checks/debt.mjs) measures a change's base and its head, and `compare` says what
 * the head adds (a new key; in "count" mode, a number that rose) and what it takes away. Nothing is banked: a fall
 * needs no file to be written down in, since the next change is compared with the main it stands on.
 *
 * Two lists under tooling/scripts/tests/baselines/ are still kept by hand, because each entry is a person's reason, not
 * a number: reads-not-heard.json and on-demand-reads.json (the hearing tests). They may only fall, and
 * `UPDATE_BASELINES=1` takes an entry the code no longer needs out of them (`BANK`); `UPDATE_BASELINES=raise` writes
 * one that rose (`RAISE`), argued in its pull request. The bundle's ceilings and the coverage floors there are
 * decisions, each moved by its own command; the hearing goldens are written by `UPDATE_HEARING=1`.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./_source.mjs";

export const BASELINES_DIR = "tooling/scripts/tests/baselines";
/** `UPDATE_BASELINES=raise` also takes every rise; `=1` only the falls. */
export const RAISE = process.env.UPDATE_BASELINES === "raise";
export const BANK = process.env.UPDATE_BASELINES === "1" || RAISE;
export const BANK_HINT = "UPDATE_BASELINES=1 pnpm test";

export function readBaseline(file) {
  const p = path.join(ROOT, BASELINES_DIR, file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

/**
 * Write a file whole or not at all: the runner starts test files in parallel, and a rename is the one write a reader
 * never sees half done.
 */
function writeWhole(p, text) {
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
}

/** A list under baselines/, written whole. */
export function writeBaseline(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  writeWhole(p, JSON.stringify(value, null, 2) + "\n");
}

/** A page as text, normalised to LF: a page is prose, not code, and a Windows checkout must read the same. */
export const readPage = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").split("\r\n").join("\n");

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
 * What changed between a measure and the one it is held to, as the lines a failing check prints. `worse`: new keys
 * and, in "count" mode, numbers that rose. `better`: keys gone and numbers that fell. In "set" mode the numbers beside
 * a key are a record, so a rise is not worse.
 */
export function compare(now, baseline, mode = "count") {
  const worse = [];
  const better = [];
  for (const k of Object.keys(now).sort()) {
    if (!(k in baseline)) worse.push(`${k}: new (${show(now[k])})`);
    else if (mode === "count" && rose(now[k], baseline[k]))
      worse.push(`${k}: now ${show(now[k])}, base ${show(baseline[k])}`);
  }
  for (const k of Object.keys(baseline).sort()) {
    if (!(k in now)) better.push(`${k}: gone (base ${show(baseline[k])})`);
    else if (fell(now[k], baseline[k])) better.push(`${k}: now ${show(now[k])}, base ${show(baseline[k])}`);
  }
  return { worse, better };
}
