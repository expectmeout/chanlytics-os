/**
 * docs/debt.md is the one register of what the code owes, and its numbers are
 * never typed by hand.
 *
 * Two things are held here. Every baseline the build ratchets is named by a row
 * of the register, so a number cannot be measured without being owed to anyone;
 * and the block of numbers at the end of the page is exactly what the baselines
 * say, so a count on the page cannot go stale. docs/takeover.md, the checklist
 * scored from the register, carries the same block between the same markers and
 * is held the same way: it was typed by hand on 21 September, and by the 26th
 * the scorecard found it stale in fifteen places.
 *
 * In bank mode this file measures for itself (_measures.mjs) rather than reading
 * the baselines, because the runner starts test files in parallel and the
 * ratchets may still be writing them; the plain run then checks the page against
 * the files, which by then agree.
 *
 *   UPDATE_BASELINES=1 pnpm test   # rewrite both blocks after banking a reduction
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { BASELINES_DIR, BANK, BANK_HINT, readBaseline } from "../_ratchet.mjs";
import { MEASURES, sourceScan } from "../_measures.mjs";

const REGISTER = "docs/debt.md";
/** The pages that print the numbers: the register, and the takeover checklist scored from it. */
const PAGES = [REGISTER, "docs/takeover.md"];
const START = "<!-- measured:start -->";
const END = "<!-- measured:end -->";

/** Read normalised to LF: the register is prose, not code, and a Windows checkout must measure the same. */
const readText = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

const baselineFiles = fs
  .readdirSync(path.join(ROOT, BASELINES_DIR))
  .filter((f) => f.endsWith(".json"))
  .sort();

const total = (o) => Object.values(o ?? {}).reduce((a, v) => a + (typeof v === "number" ? v : 1), 0);
const keys = (o) => Object.keys(o ?? {}).length;

/** The block, from a map of baseline file → its numbers, and the source-scan counts. */
function blockFrom(by, scanCounts) {
  const complexity = by["complexity.json"] ?? {};
  const over200 = Object.values(complexity).filter((v) => v.lines > 200).length;
  const publishers = by["window-publishers.json"] ?? {};
  const copies = by["copies.json"] ?? {};
  const lint = JSON.parse(readText("package.json")).scripts.lint.match(/--max-warnings (\d+)/);
  const rows = [
    ["functions over the limit", keys(complexity), `of which over 200 lines: ${over200}`],
    ["files over 800 lines", keys(by["file-length.json"]), ""],
    ["directories over 20 modules", keys(by["tree-shape.json"]), ""],
    ["window globals", keys(by["window-globals.json"]), "names"],
    ["window publishers", total(publishers), `sites in ${keys(publishers)} files`],
    ["copies", total(copies), `of ${keys(copies)} names`],
    ["as unknown as", total(by["casts.json"]), ""],
    ["table names outside packages/db", total(by["tables.json"]), ""],
    ["unnamed durations", total(by["durations.json"]), `in ${keys(by["durations.json"])} files`],
    // knip's baseline is written by its own script, never by the suite, so the file is the truth in both modes.
    ["dead exports, types and modules", total(readBaseline("dead-exports.json")), ""],
    ["source-text reads in tests", total(scanCounts), ""],
    ["lint warnings allowed", lint ? Number(lint[1]) : NaN, ""],
  ];
  const lines = rows.map(
    ([label, n, note]) => `${label.padEnd(34)}${String(n).padStart(5)}${note ? "   " + note : ""}`,
  );
  return "```text\n" + lines.join("\n") + "\n```";
}

const fromFiles = () =>
  blockFrom(
    Object.fromEntries(baselineFiles.map((f) => [f, readBaseline(f)])),
    JSON.parse(readText("tooling/scripts/tests/source-scan-baseline.json")).counts,
  );

const fromMeasures = () =>
  blockFrom(Object.fromEntries(MEASURES.map((m) => [m.file, m.measure()])), sourceScan().counts);

const page = () => readText(REGISTER);

/** What a page has between the markers, or null when it has no block. */
function written(rel) {
  const text = readText(rel);
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  return a >= 0 && b > a ? text.slice(a + START.length, b).trim() : null;
}

if (BANK) {
  const block = fromMeasures();
  for (const rel of PAGES) {
    const now = readText(rel);
    const a = now.indexOf(START);
    const b = now.indexOf(END);
    // A page without its markers is left alone, and the plain run says so.
    if (a < 0 || b < a) continue;
    fs.writeFileSync(path.join(ROOT, rel), now.slice(0, a + START.length) + "\n\n" + block + "\n\n" + now.slice(b));
  }
}

test("every baseline the build holds is a row of the register", () => {
  const text = page();
  const unnamed = baselineFiles.filter((f) => !text.includes(`baselines/${f}`));
  assert.deepEqual(unnamed, [], "add a row to docs/debt.md: what it measures, what retires it, the next step");
  assert.ok(text.includes("source-scan-baseline.json"), "the source-scan ratchet is owed a row too");
  assert.ok(text.includes("--max-warnings"), "the lint warnings ceiling is owed a row too");
});

for (const rel of PAGES) {
  test(
    rel === REGISTER
      ? "the numbers on the register are the baselines' numbers"
      : `the numbers on ${rel} are the register's numbers`,
    { skip: BANK && "banked from the measures; the next plain run checks the files" },
    () => {
      const block = written(rel);
      assert.ok(block !== null, `${rel} has no measured block (${START} … ${END})`);
      assert.equal(block, fromFiles(), `${rel} is stale — rewrite it: ${BANK_HINT}`);
    },
  );
}
