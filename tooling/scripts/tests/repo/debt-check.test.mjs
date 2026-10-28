/**
 * check:debt's decisions (tooling/scripts/checks/debt.mjs, decision 0074), on records written for them: what a change
 * adds to its base and what it takes away, the description's line that argues an addition, a base read from the
 * baselines a commit from before 28 October 2026 kept, the register's numbers from a record, and a week of main.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, reasonIn, recordFromBaselines, totalsOf, totalsText, weekOf, PARTS } from "../../checks/debt.mjs";

const measure = (entries, mode = "count") => ({ name: "x", mode, advice: "", entries });
const record = (parts) => ({ sha: "abc", at: null, parts });

test("a change adds a new offender and a number that rose, and takes away what fell or went", () => {
  const base = record({
    measures: {
      complexity: measure({ "a.ts::f": { lines: 200, branches: 40, depth: 6 }, "b.ts::g": { lines: 160, branches: 1, depth: 1 } }),
      "window-globals": measure({ __A: 2, __B: 1 }, "set"),
    },
    lint: { "a.ts::no-console": 2 },
    knip: { "c.ts": 1 },
  });
  const head = record({
    measures: {
      complexity: measure({ "a.ts::f": { lines: 210, branches: 40, depth: 6 }, "d.ts::h": { lines: 151, branches: 1, depth: 1 } }),
      "window-globals": measure({ __A: 5, __C: 1 }, "set"),
      "test-length": measure({ "big.test.mjs": 1700 }),
    },
    lint: { "a.ts::no-console": 1, "e.ts::no-console": 1 },
    knip: { "c.ts": 1 },
  });
  const { worse, better, notes } = judge(base, head);
  assert.deepEqual(worse, [
    "complexity a.ts::f: now lines 210, branches 40, depth 6, base lines 200, branches 40, depth 6",
    "complexity d.ts::h: new (lines 151, branches 1, depth 1)",
    "window-globals __C: new (1)",
    "test-length big.test.mjs: new (1700)",
    "lint e.ts::no-console: new (1)",
  ]);
  assert.deepEqual(better, [
    "complexity b.ts::g: gone (base lines 160, branches 1, depth 1)",
    "window-globals __B: gone (base 1)",
    "lint a.ts::no-console: now 1, base 2",
  ]);
  assert.deepEqual(notes, ["test-length: a measure the base did not have"]);
});

test("a part the base has no record of is said, and nothing of it judged", () => {
  const { worse, notes } = judge(record({ measures: {} }), record({ measures: {}, knip: { "c.ts": 3 } }));
  assert.deepEqual(worse, []);
  assert.deepEqual(notes, ["knip: the base has no knip record, so nothing of it is judged"]);
});

test("an addition is argued in a line `Debt: <why>` of the description, of a dozen characters or more", () => {
  assert.equal(reasonIn("Fixes the thing.\n\nDebt: the importer's mapping is one function until 0075 splits it"), "the importer's mapping is one function until 0075 splits it");
  assert.equal(reasonIn("- **Debt:** a measure seeded with what main holds"), "a measure seeded with what main holds");
  assert.equal(reasonIn("Debt: later"), null, "too short to be a reason");
  assert.equal(reasonIn("Bundle: a page grew"), null, "the bundle's line is the bundle's");
  assert.equal(reasonIn(undefined), null);
});

test("a base from before the numbers left git is read from the baselines it committed", () => {
  const files = {
    "tooling/scripts/tests/baselines/complexity.json": JSON.stringify({ "a.ts::f": { lines: 200, branches: 40, depth: 6 } }),
    "tooling/scripts/tests/baselines/window-globals.json": JSON.stringify({ __A: 2 }),
    "tooling/scripts/tests/baselines/lint-warnings.json": JSON.stringify({ "a.ts": { "no-console": 2, eqeqeq: 1 } }),
    "tooling/scripts/tests/baselines/dead-exports.json": JSON.stringify({ "c.ts": 1 }),
    "tooling/scripts/tests/source-scan-baseline.json": JSON.stringify({
      lint: ["repo/lint.test.mjs"],
      counts: { "a.test.mjs": 3, "repo/lint.test.mjs": 9 },
    }),
  };
  const show = (rel) => files[rel] ?? null;
  const ratchets = [
    { key: "complexity", file: "complexity.json", name: "c", mode: "count", advice: "" },
    { key: "window-globals", file: "window-globals.json", name: "w", mode: "set", advice: "" },
    { key: "durations", file: "durations.json", name: "d", mode: "count", advice: "" },
    { key: "source-scan", name: "s", mode: "count", advice: "" },
  ];
  const r = recordFromBaselines(show, ratchets, PARTS);
  assert.equal(r.from, "baselines");
  assert.deepEqual(r.parts.measures.complexity.entries, { "a.ts::f": { lines: 200, branches: 40, depth: 6 } });
  assert.equal(r.parts.measures["window-globals"].mode, "set");
  assert.deepEqual(r.parts.measures.durations.entries, {}, "a baseline the commit had not: nothing held");
  assert.deepEqual(r.parts.measures["source-scan"].entries, { "a.test.mjs": 3 }, "its repo-wide lints left out");
  assert.deepEqual(r.parts.lint, { "a.ts::eqeqeq": 1, "a.ts::no-console": 2 });
  assert.deepEqual(r.parts.knip, { "c.ts": 1 });
  assert.deepEqual(Object.keys(recordFromBaselines(show, ratchets, ["knip"]).parts), ["knip"], "the parts asked for alone");
});

test("the register's numbers are read from a record, a row for each measure", () => {
  const r = record({
    measures: {
      complexity: measure({ "a.ts::f": { lines: 210, branches: 1, depth: 1 }, "b.ts::g": { lines: 160, branches: 1, depth: 1 } }),
      casts: measure({ "a.ts": { unknownAs: 2, never: 1, nonNull: 0 } }),
      "window-globals": measure({ __A: 2, __B: 1 }, "set"),
      tables: measure({ "a.ts": 3, "a.ts::rpc": 2 }),
    },
    lint: { "a.ts::react-hooks/exhaustive-deps": 2, "a.ts::no-console": 1, "b.ts::no-console": 1 },
    knip: { "c.ts": 4 },
  });
  const rows = Object.fromEntries(totalsOf(r, { ceiling: { js: 1048576, css: 196608, page: 262144 }, trees: ["x", "y"], wide: ["x"] }).map(([l, n, note]) => [l, [n, note]]));
  assert.deepEqual(rows["functions over the limit"], [2, "of which over 200 lines: 1"]);
  assert.deepEqual(rows["as unknown as"], [2, ""]);
  assert.deepEqual(rows["window globals"], [2, "names"]);
  assert.deepEqual(rows["table names outside packages/db"], [3, ""]);
  assert.deepEqual(rows["SQL functions outside packages/db"], [2, "called by .rpc"]);
  assert.deepEqual(rows["lint warnings"], [4, "in 2 files, 2 of them exhaustive-deps"]);
  assert.deepEqual(rows["dead exports, types and modules"], [4, ""]);
  assert.deepEqual(rows["route JS ceiling, KB gzipped"], [1024, "the shell included"]);
  assert.deepEqual(rows["trees the lint's limits hold"], [2, "1 of them with max-params waiting"]);
  assert.match(totalsText([["files over 800 lines", 3, ""]]), /^```text\nfiles over 800 lines\s+3\n```$/);
});

test("a week of main says each measure that grew, by its one number", () => {
  const older = record({
    measures: { complexity: measure({ a: { lines: 1 }, b: { lines: 1 } }), "window-globals": measure({ __A: 9 }, "set") },
    lint: { "a.ts::x": 2 },
  });
  const newer = record({
    measures: { complexity: measure({ a: { lines: 1 } }), "window-globals": measure({ __A: 1, __B: 1 }, "set") },
    lint: { "a.ts::x": 5 },
    knip: { "c.ts": 1 },
  });
  const { rows, grew } = weekOf(older, newer);
  assert.deepEqual(
    grew.map((r) => [r.key, r.grew]),
    [
      ["knip", 1],
      ["lint", 3],
      ["window-globals", 1],
    ],
    "a set grows by its keys, not by the numbers beside them",
  );
  assert.deepEqual(rows.find((r) => r.key === "complexity"), { key: "complexity", older: 2, newer: 1, grew: -1 });
});
