/**
 * docs/debt.md is the one register of what the code owes, and its numbers are never typed by hand.
 *
 * Every number the build holds is a row of the register: each ratchet of _measures.mjs by its key, and check:debt's
 * other two parts, the lint's warnings and knip's dead exports. Until 28 October 2026 each was a baseline in git and the
 * register printed their numbers between two markers, rewritten by every change that banked one; now a change is held
 * to what it adds by check:debt (decision 0074), and the numbers are measured, never kept: `corepack pnpm check:debt --
 * --totals` prints them for any tree, and each night's reading of main says them (.github/workflows/register.yml). The
 * files still under tooling/scripts/tests/baselines/ are not numbers but decisions and reviewed lists, and each is named.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../_source.mjs";
import { BASELINES_DIR, readPage } from "../../_ratchet.mjs";
import { RATCHETS } from "../../_measures.mjs";

const REGISTER = "docs/debt.md";
const page = () => readPage(REGISTER);

/** What stays under baselines/: decisions (the bundle's ceilings, the coverage floors) and lists a review reads. */
const KEPT = fs
  .readdirSync(path.join(ROOT, BASELINES_DIR), { withFileTypes: true })
  .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
  .sort();

test("every number the build holds is a row of the register, by the key check:debt gives it", () => {
  const text = page();
  const keys = [...RATCHETS.map((r) => r.key), "lint", "knip"];
  assert.deepEqual(
    keys.filter((k) => !text.includes(`\`${k}\``)),
    [],
    "add a row to docs/debt.md naming the measure's key: what it measures, what retires it, the next step",
  );
  assert.ok(text.includes("corepack pnpm check:debt -- --totals"), "the register says where its numbers are read");
});

test("what stays under baselines/ is a decision or a reviewed list, and the register names each", () => {
  const text = page();
  assert.deepEqual(KEPT, [
    "bundle-ceiling.json",
    "coverage.json",
    "hearing/",
    "on-demand-reads.json",
    "reads-not-heard.json",
    "writes/",
  ]);
  assert.deepEqual(
    KEPT.filter((f) => !text.includes(`baselines/${f}`)),
    [],
    "name it in docs/debt.md, with what it holds",
  );
  const numbers = new Set(RATCHETS.map((r) => r.file).filter(Boolean));
  assert.deepEqual(
    KEPT.filter((f) => numbers.has(f)),
    [],
    "a ratchet's numbers are check:debt's, never a file",
  );
});

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
