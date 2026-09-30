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
import { LIMITED_TREES, WIDE_PARAMS } from "../../../../eslint.config.mjs";
import {
  BASELINES_DIR,
  BANK,
  RAISE,
  BANK_HINT,
  bank,
  readBaseline,
  readPage,
  blockIn,
  writeBlock,
} from "../_ratchet.mjs";
import {
  MEASURES,
  WIRE_CASING,
  UNCHECKED_INDEX,
  wireCounts,
  sourceScan,
  bankedSourceScan,
  SOURCE_SCAN_BASELINE,
  RPC_KEY,
} from "../_measures.mjs";

const REGISTER = "docs/debt.md";
/** The pages that print the numbers: the register, and the takeover checklist scored from it. */
const PAGES = [REGISTER, "docs/takeover.md"];
const MARKERS = ["<!-- measured:start -->", "<!-- measured:end -->"];

const baselineFiles = fs
  .readdirSync(path.join(ROOT, BASELINES_DIR))
  .filter((f) => f.endsWith(".json"))
  .sort();

const total = (o) => Object.values(o ?? {}).reduce((a, v) => a + (typeof v === "number" ? v : 1), 0);
const keys = (o) => Object.keys(o ?? {}).length;
/** Every field of every entry, summed: a stylesheet's literal values are counted by kind. */
const fieldsTotal = (o) => Object.values(o ?? {}).reduce((a, v) => a + Object.values(v).reduce((b, n) => b + n, 0), 0);
/** One field of every entry, summed: casts.json holds each module's casts by family. */
const fieldTotal = (o, field) => Object.values(o ?? {}).reduce((a, v) => a + (v[field] ?? 0), 0);

/** tables.json's entries: a file's `.from("…")` count under its path, its `.rpc("…")` count under `<path>::rpc`. */
const tableCalls = (o, rpc) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => k.endsWith(RPC_KEY) === rpc));

/** The block, from a map of baseline file → its numbers, and the source-scan counts. */
function blockFrom(by, scanCounts) {
  const complexity = by["complexity.json"] ?? {};
  const over200 = Object.values(complexity).filter((v) => v.lines > 200).length;
  const publishers = by["window-publishers.json"] ?? {};
  const copies = by["copies.json"] ?? {};
  // knip's, ESLint's and the bundle's baselines are written by their own scripts, never by the suite, so the file is the truth in both modes.
  const lint = readBaseline("lint-warnings.json") ?? {};
  const unchecked = by["unchecked-index.json"] ?? {};
  const casts = by["casts.json"] ?? {};
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
    ["as unknown as", fieldTotal(casts, "unknownAs"), ""],
    ["as never", fieldTotal(casts, "never"), ""],
    ["non-null assertions, x!", fieldTotal(casts, "nonNull"), ""],
    ["index reads the compiler lets pass", total(unchecked), `in ${keys(unchecked)} files`],
    ["table names outside packages/db", total(tableCalls(by["tables.json"], false)), ""],
    ["SQL functions outside packages/db", total(tableCalls(by["tables.json"], true)), "called by .rpc"],
    ["unnamed durations", total(by["durations.json"]), `in ${keys(by["durations.json"])} files`],
    ["literal style values", fieldsTotal(by["style-values.json"]), `in ${keys(by["style-values.json"])} stylesheets`],
    [
      "primitives outside the kit",
      total(by["kit-primitives.json"]),
      `selectors naming ${keys(by["kit-primitives.json"])} classes`,
    ],
    ["inline style props", total(by["inline-styles.json"]), `in ${keys(by["inline-styles.json"])} files`],
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
    // Not a debt: the trees the complexity ratchet has emptied, which the lint's limits hold (eslint.config.mjs), so
    // the register's prose never types how many.
    ["trees the lint's limits hold", LIMITED_TREES.length, `${WIDE_PARAMS.length} of them with max-params waiting`],
  ];
  const lines = rows.map(
    ([label, n, note]) => `${label.padEnd(34)}${String(n).padStart(5)}${note ? "   " + note : ""}`,
  );
  return "```text\n" + lines.join("\n") + "\n```";
}

const sourceScanBaseline = () => JSON.parse(readPage(SOURCE_SCAN_BASELINE));

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
      [...MEASURES, WIRE_CASING, UNCHECKED_INDEX].map((m) => [
        m.file,
        bank(m.measure(), readBaseline(m.file), { mode: m.mode, raise: RAISE }),
      ]),
    ),
    bankedSourceScan(sourceScan().counts, sourceScanBaseline(), RAISE),
  );

const page = () => readPage(REGISTER);

if (BANK) {
  const block = fromBank();
  // A page without its markers is left alone, and the plain run says so.
  for (const rel of PAGES) writeBlock(rel, MARKERS, block);
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
      const block = blockIn(rel, MARKERS);
      assert.ok(block !== null, `${rel} has no measured block (${MARKERS.join(" … ")})`);
      assert.equal(block, fromFiles(), `${rel} is stale — rewrite it: ${BANK_HINT}`);
    },
  );
}

/** The rows of the table under a page's `## heading`, each as its cells, trimmed; the header and its rule left out. */
function tableUnder(text, heading) {
  const lines = text.split("\n");
  const at = lines.indexOf(`## ${heading}`);
  assert.ok(at >= 0, `${REGISTER} has a "## ${heading}" section`);
  const end = lines.findIndex((l, i) => i > at && /^## /.test(l));
  const rows = lines.slice(at + 1, end < 0 ? undefined : end).filter((l) => l.startsWith("|"));
  return rows.slice(2).map((l) =>
    l
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.trim()),
  );
}

test("every rise says what rose, why, and what takes it back down", () => {
  const rows = tableUnder(page(), "Rises, each with its reason");
  assert.ok(rows.length > 0, "the Rises table was read");
  const short = rows
    .filter((cells) => cells.length !== 3 || cells.some((c) => c === ""))
    .map((cells) => (cells[0] ?? "").slice(0, 80));
  assert.deepEqual(
    short,
    [],
    'a row under "Rises" is three cells: the rise, why, and the "Falls when" that takes it down',
  );
});

/** Each decision's state, as docs/decisions/README.md's table says it (history/decisions.test.mjs holds that table). */
function decisionStates() {
  const states = new Map();
  for (const line of readPage("docs/decisions/README.md").split("\n")) {
    const m = /^\|\s*\[(\d{4})\]\([^)]+\)\s*\|[^|]*\|([^|]*)\|\s*$/.exec(line);
    if (m) states.set(m[1], /^\s*proposed\b/i.test(m[2]) ? "proposed" : "not proposed");
  }
  return states;
}

test("the register calls a decision proposed only while the decisions' index does", () => {
  const states = decisionStates();
  assert.ok(states.size > 20, "the index was read");
  const stale = [];
  for (const table of ["What is measured", "What is named and not yet measured"]) {
    for (const cells of tableUnder(page(), table)) {
      for (const cell of cells) {
        const named = [...cell.matchAll(/decisions\/(\d{4})-|decision (\d{4})/gi)].map((m) => m[1] ?? m[2]);
        for (const n of new Set(named)) {
          if (states.get(n) === "not proposed" && /\bproposed\b/i.test(cell)) stale.push(`${n}: ${cell.slice(0, 80)}`);
        }
      }
    }
  }
  assert.deepEqual(stale, [], "the decisions' index says these are decided: say so in the register, with the day");
});
