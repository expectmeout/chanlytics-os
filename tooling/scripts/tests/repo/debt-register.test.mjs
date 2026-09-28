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
 * In bank mode this file works out what the bank writes, from the measures
 * (_measures.mjs) banked against the baselines by the ratchets' own `bank`, rather
 * than waiting for the ratchets to write it: the runner starts test files in
 * parallel. A baseline is written whole, by a rename, and banking what was just
 * banked changes nothing, so the block is the same whether a baseline is read
 * before its ratchet banked it or after. A rise that was not raised is therefore
 * not printed either: the page says what the baselines hold, never what the code
 * would like them to. The plain run then checks the page against the files.
 *
 *   UPDATE_BASELINES=1 pnpm test       # rewrite both blocks after banking a reduction
 *   UPDATE_BASELINES=raise pnpm test   # and after raising a number
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { BASELINES_DIR, BANK, RAISE, BANK_HINT, bank, readBaseline } from "../_ratchet.mjs";
import {
  MEASURES,
  WIRE_CASING,
  wireCounts,
  sourceScan,
  bankedSourceScan,
  SOURCE_SCAN_BASELINE,
} from "../_measures.mjs";

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
  // knip's, ESLint's and the bundle's baselines are written by their own scripts, never by the suite, so the file is the truth in both modes.
  const lint = readBaseline("lint-warnings.json") ?? {};
  const budget = readBaseline("bundle-budget.json") ?? {};
  const effects = Object.values(lint).reduce((a, rules) => a + (rules["react-hooks/exhaustive-deps"] ?? 0), 0);
  const wire = wireCounts(by["wire-casing.json"]);
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
    ["wire names not in snake_case", wire.names, `in ${wire.routes} routes`],
    ["dead exports, types and modules", total(readBaseline("dead-exports.json")), ""],
    ["source-text reads in tests", total(scanCounts), ""],
    [
      "lint warnings",
      Object.values(lint).reduce((a, rules) => a + total(rules), 0),
      `in ${keys(lint)} files, ${effects} of them exhaustive-deps`,
    ],
    ["workspace route JS, KB gzipped", Math.round(budget.js / 1024), "the shell included"],
    ["workspace route CSS, KB gzipped", Math.round(budget.css / 1024), ""],
  ];
  const lines = rows.map(
    ([label, n, note]) => `${label.padEnd(34)}${String(n).padStart(5)}${note ? "   " + note : ""}`,
  );
  return "```text\n" + lines.join("\n") + "\n```";
}

const sourceScanBaseline = () => JSON.parse(readText(SOURCE_SCAN_BASELINE));

const fromFiles = () =>
  blockFrom(Object.fromEntries(baselineFiles.map((f) => [f, readBaseline(f)])), sourceScanBaseline().counts);

/**
 * What the bank is writing: each measure banked against its baseline, as its ratchet banks it. The wire's among them,
 * though its ratchet is a file of its own (routes/wire-casing.test.mjs): it builds the dashboard's program, which this
 * file asks for only when it banks.
 */
const fromBank = () =>
  blockFrom(
    Object.fromEntries(
      [...MEASURES, WIRE_CASING].map((m) => [
        m.file,
        bank(m.measure(), readBaseline(m.file), { mode: m.mode, raise: RAISE }),
      ]),
    ),
    bankedSourceScan(sourceScan().counts, sourceScanBaseline(), RAISE),
  );

const page = () => readText(REGISTER);

/** What a page has between the markers, or null when it has no block. */
function written(rel) {
  const text = readText(rel);
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  return a >= 0 && b > a ? text.slice(a + START.length, b).trim() : null;
}

if (BANK) {
  const block = fromBank();
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
});

for (const rel of PAGES) {
  test(
    rel === REGISTER
      ? "the numbers on the register are the baselines' numbers"
      : `the numbers on ${rel} are the register's numbers`,
    { skip: BANK && "written from the bank; the next plain run checks the files" },
    () => {
      const block = written(rel);
      assert.ok(block !== null, `${rel} has no measured block (${START} … ${END})`);
      assert.equal(block, fromFiles(), `${rel} is stale — rewrite it: ${BANK_HINT}`);
    },
  );
}
