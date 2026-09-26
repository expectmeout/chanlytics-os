/**
 * What is measured may only fall.
 *
 * Seven numbers the scorecard of 26 September 2026 found drifting, each with the
 * rule it stands for, held at its current value by a ratchet (_ratchet.mjs) over a
 * measurement of the syntax tree (_ast.mjs). docs/debt.md is the register that
 * names each one, what retires it, and the next step; the plan is
 * docs/plans/2026-09-26-organization-and-code-health.md.
 *
 * Why one file: the node runner starts a process per test file, and parsing the
 * repository's 800 modules once costs a few seconds. Seven files would parse it
 * seven times. Each ratchet below is still its own pair of tests, named for the
 * number it holds.
 *
 * The limits are the scorecard's proposal and, where ESLint has the rule, its
 * defaults: 150 lines a function, 30 branches, 5 levels; 800 lines a file; 20
 * modules a directory; a name in three files is a copy. When a tree's baseline
 * is empty, the matching ESLint rule goes on for that tree and the limit stops
 * being a ratchet and becomes a lint error.
 *
 *   UPDATE_BASELINES=1 pnpm test   # bank a reduction, or seed a baseline
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ratchet } from "../_ratchet.mjs";
import {
  repoFiles,
  parse,
  functionsIn,
  linesOf,
  windowUse,
  topLevelNames,
  unknownCasts,
  tableNames,
  SOURCE,
} from "../_ast.mjs";

const LIMIT = { lines: 150, branches: 30, depth: 5 };
const FILE_LIMIT = 800;
const DIRECTORY_LIMIT = 20;
const COPY_LIMIT = 3;

/** The code that ships: the two apps and the packages' sources. Tests and specs are not held to a function's size. */
const SRC = repoFiles(["apps", "packages"]);
/** Where a directory's size is measured: everything hand-written, the tests included. */
const TREES = repoFiles(["apps", "packages", "tooling/scripts", "e2e"]);
/** The shell and its bridge: the only code that may touch `window` at all. */
const SHELL = SRC.filter((f) => f.startsWith("apps/dashboard/src/"));
/** A route module exports what the framework names (GET, POST, default); those are not copies. */
const notARoute = (f) => !/^apps\/dashboard\/app\/|^apps\/edge\/api\//.test(f);

ratchet({
  name: "functions over the limit",
  file: "complexity.json",
  measure: () => {
    const out = {};
    for (const f of SRC) {
      for (const fn of functionsIn(parse(f))) {
        if (fn.lines > LIMIT.lines || fn.branches > LIMIT.branches || fn.depth > LIMIT.depth) {
          out[`${f}::${fn.key}`] = { lines: fn.lines, branches: fn.branches, depth: fn.depth };
        }
      }
    }
    return out;
  },
  advice:
    "Split it — one builder per band, a table for a decision table, a hook for a component's concern — or keep it under 150 lines, 30 branches and 5 levels.",
});

ratchet({
  name: "files over the limit",
  file: "file-length.json",
  measure: () => {
    const out = {};
    for (const f of SRC) {
      const n = linesOf(parse(f));
      if (n > FILE_LIMIT) out[f] = n;
    }
    return out;
  },
  advice: "Move a domain out of it into its own module; a file over 800 lines is two files.",
});

ratchet({
  name: "directories over the limit",
  file: "tree-shape.json",
  measure: () => {
    const perDir = {};
    for (const f of TREES) {
      if (!SOURCE.test(f)) continue;
      const dir = path.posix.dirname(f);
      perDir[dir] = (perDir[dir] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(perDir).filter(([, n]) => n > DIRECTORY_LIMIT));
  },
  advice: "Group it by domain, the way apps/edge/lib is: a folder per domain, the plumbing at the root.",
});

const shellUse = () => SHELL.map((f) => [f, windowUse(parse(f))]);

ratchet({
  name: "window globals",
  file: "window-globals.json",
  mode: "set",
  measure: () => {
    const files = {};
    for (const [, use] of shellUse()) for (const n of use.names) files[n] = (files[n] ?? 0) + 1;
    return files;
  },
  advice: "No new global: feed the surface through the seam (surface-data.ts), or reuse one that exists.",
});

ratchet({
  name: "window publishers",
  file: "window-publishers.json",
  measure: () => {
    const out = {};
    for (const [f, use] of shellUse()) if (use.publishers > 0) out[f] = use.publishers;
    return out;
  },
  advice: "Publish nothing new on window: import it, or add the name to a component that already publishes.",
});

ratchet({
  name: "copies",
  file: "copies.json",
  measure: () => {
    const files = new Map();
    for (const f of SRC.filter(notARoute)) {
      for (const n of new Set(topLevelNames(parse(f)))) {
        if (n.length < 4) continue;
        if (!files.has(n)) files.set(n, new Set());
        files.get(n).add(f);
      }
    }
    return Object.fromEntries([...files].filter(([, s]) => s.size >= COPY_LIMIT).map(([n, s]) => [n, s.size]));
  },
  advice:
    "Give it one home and import it from there — a helper declared in three files is a fact spelled out three times — or, when the new one is a different thing, give it a name that says which.",
});

ratchet({
  name: "as unknown as",
  file: "casts.json",
  measure: () => {
    const out = {};
    for (const f of SRC) {
      const n = unknownCasts(parse(f));
      if (n > 0) out[f] = n;
    }
    return out;
  },
  advice:
    "Name the shape and parse it, or narrow it with a type guard; a value laundered through unknown is a type the compiler no longer checks.",
});

ratchet({
  name: "table names outside packages/db",
  file: "tables.json",
  measure: () => {
    const out = {};
    for (const f of SRC.filter((f) => !f.startsWith("packages/db/"))) {
      const n = tableNames(parse(f));
      if (n > 0) out[f] = n;
    }
    return out;
  },
  advice:
    "A table is typed once, in packages/db (CLAUDE.md, what not to introduce): add a repository or a reader there and call it.",
});

// The measure the limits above rest on, kept honest: if the compiler ever stops
// parsing the shell's script-mode JSX, the numbers would quietly drop to zero and
// every ratchet would pass. This is the assertion that says so instead.
test("the measure sees the shell's JSX and the packages' TypeScript", () => {
  const shell = functionsIn(parse("apps/dashboard/src/legacy/pages/app-shell.jsx"));
  const core = functionsIn(parse("packages/core/src/deliver.ts"));
  assert.ok(shell.length > 10, "the shell's page parsed as JSX and its functions were found");
  assert.ok(
    shell.some((fn) => fn.branches > 10),
    "a JSX conditional counts as a branch",
  );
  assert.ok(core.length > 5, "core parsed as TypeScript");
});
