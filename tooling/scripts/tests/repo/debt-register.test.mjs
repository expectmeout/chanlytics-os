/**
 * docs/debt.md is the one register of what the code owes, and its numbers are
 * never typed by hand.
 *
 * Two things are held here. Every baseline the build ratchets is named by a row
 * of the register, so a number cannot be measured without being owed to anyone;
 * and the block of numbers at the end of the page is exactly what the baselines
 * say, so a count on the page cannot go stale — the failure mode
 * docs/takeover.md shows in fifteen places at the time of writing.
 *
 * In bank mode this file measures for itself (_measures.mjs) rather than reading
 * the baselines, because the runner starts test files in parallel and the
 * ratchets may still be writing them; the plain run then checks the page against
 * the files, which by then agree.
 *
 *   UPDATE_BASELINES=1 pnpm test   # rewrite the block after banking a reduction
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { BASELINES_DIR, BANK, BANK_HINT, readBaseline } from "../_ratchet.mjs";
import { MEASURES, sourceScan } from "../_measures.mjs";

const REGISTER = "docs/debt.md";
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
  // knip's and ESLint's baselines are written by their own scripts, never by the suite, so the file is the truth in both modes.
  const lint = readBaseline("lint-warnings.json") ?? {};
  const effects = Object.values(lint).reduce((a, rules) => a + (rules["react-hooks/exhaustive-deps"] ?? 0), 0);
  const rows = [
    ["functions over the limit", keys(complexity), `of which over 200 lines: ${over200}`],
    ["files over 800 lines", keys(by["file-length.json"]), ""],
    ["directories over 20 modules", keys(by["tree-shape.json"]), ""],
    ["window globals", keys(by["window-globals.json"]), "names"],
    ["window publishers", total(publishers), `sites in ${keys(publishers)} files`],
    ["copies", total(copies), `of ${keys(copies)} names`],
    ["as unknown as", total(by["casts.json"]), ""],
    ["table names outside packages/db", total(by["tables.json"]), ""],
    ["dead exports, types and modules", total(readBaseline("dead-exports.json")), ""],
    ["source-text reads in tests", total(scanCounts), ""],
    [
      "lint warnings",
      Object.values(lint).reduce((a, rules) => a + total(rules), 0),
      `in ${keys(lint)} files, ${effects} of them exhaustive-deps`,
    ],
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

if (BANK) {
  const p = path.join(ROOT, REGISTER);
  const now = page();
  const a = now.indexOf(START) + START.length;
  const b = now.indexOf(END);
  fs.writeFileSync(p, now.slice(0, a) + "\n\n" + fromMeasures() + "\n\n" + now.slice(b));
}

test("every baseline the build holds is a row of the register", () => {
  const text = page();
  const unnamed = baselineFiles.filter((f) => !text.includes(`baselines/${f}`));
  assert.deepEqual(unnamed, [], "add a row to docs/debt.md: what it measures, what retires it, the next step");
  assert.ok(text.includes("source-scan-baseline.json"), "the source-scan ratchet is owed a row too");
});

test(
  "the numbers on the register are the baselines' numbers",
  { skip: BANK && "banked from the measures; the next plain run checks the files" },
  () => {
    const text = page();
    const a = text.indexOf(START);
    const b = text.indexOf(END);
    assert.ok(a >= 0 && b > a, `${REGISTER} has no measured block`);
    const written = text.slice(a + START.length, b).trim();
    assert.equal(written, fromFiles(), `the register is stale — rewrite it: ${BANK_HINT}`);
  },
);
