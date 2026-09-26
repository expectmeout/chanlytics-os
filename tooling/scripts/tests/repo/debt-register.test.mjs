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
 *   UPDATE_BASELINES=1 pnpm test   # rewrite the block after banking a reduction
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { BASELINES_DIR, BANK, BANK_HINT, readBaseline } from "../_ratchet.mjs";

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

function measured() {
  const complexity = readBaseline("complexity.json") ?? {};
  const over200 = Object.values(complexity).filter((v) => v.lines > 200).length;
  const publishers = readBaseline("window-publishers.json") ?? {};
  const copies = readBaseline("copies.json") ?? {};
  const scan = JSON.parse(readText("tooling/scripts/tests/source-scan-baseline.json"));
  const lint = JSON.parse(readText("package.json")).scripts.lint.match(/--max-warnings (\d+)/);
  const rows = [
    ["functions over the limit", keys(complexity), `of which over 200 lines: ${over200}`],
    ["files over 800 lines", keys(readBaseline("file-length.json")), ""],
    ["directories over 20 modules", keys(readBaseline("tree-shape.json")), ""],
    ["window globals", keys(readBaseline("window-globals.json")), "names"],
    ["window publishers", total(publishers), `sites in ${keys(publishers)} files`],
    ["copies", total(copies), `of ${keys(copies)} names`],
    ["as unknown as", total(readBaseline("casts.json")), ""],
    ["table names outside packages/db", total(readBaseline("tables.json")), ""],
    ["dead exports, types and modules", total(readBaseline("dead-exports.json")), ""],
    ["source-text reads in tests", total(scan.counts), ""],
    ["lint warnings allowed", lint ? Number(lint[1]) : NaN, ""],
  ];
  return rows
    .map(([label, n, note]) => `${label.padEnd(34)}${String(n).padStart(5)}${note ? "   " + note : ""}`)
    .join("\n");
}

const block = "```text\n" + measured() + "\n```";
const page = () => readText(REGISTER);

if (BANK) {
  const p = path.join(ROOT, REGISTER);
  const now = page();
  const a = now.indexOf(START) + START.length;
  const b = now.indexOf(END);
  fs.writeFileSync(p, now.slice(0, a) + "\n\n" + block + "\n\n" + now.slice(b));
}

test("every baseline the build holds is a row of the register", () => {
  const text = page();
  const unnamed = baselineFiles.filter((f) => !text.includes(`baselines/${f}`));
  assert.deepEqual(unnamed, [], "add a row to docs/debt.md: what it measures, what retires it, the next step");
  assert.ok(text.includes("source-scan-baseline.json"), "the source-scan ratchet is owed a row too");
  assert.ok(text.includes("--max-warnings"), "the lint warnings ceiling is owed a row too");
});

test("the numbers on the register are the baselines' numbers", () => {
  const text = page();
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  assert.ok(a >= 0 && b > a, `${REGISTER} has no measured block`);
  const written = text.slice(a + START.length, b).trim();
  assert.equal(written, block, `the register is stale — rewrite it: ${BANK_HINT}`);
});
