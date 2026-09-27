/**
 * What is measured may only fall.
 *
 * Eight numbers the scorecard of 26 September 2026 found drifting, each with the
 * rule it stands for, held at its current value by a ratchet (_ratchet.mjs) over a
 * measurement of the syntax tree (_ast.mjs, defined in _measures.mjs). docs/debt.md
 * is the register that names each one, what retires it, and the next step; the plan
 * is docs/plans/2026-09-26-organization-and-code-health.md.
 *
 * Why one file: the node runner starts a process per test file, and parsing the
 * repository's 800 modules once costs a few seconds. Eight files would parse it
 * eight times. Each ratchet below is still its own pair of tests, named for the
 * number it holds.
 *
 *   UPDATE_BASELINES=1 pnpm test       # bank a reduction, and nothing else
 *   UPDATE_BASELINES=raise pnpm test   # raise a number, or seed a baseline (argued in docs/debt.md)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ratchet } from "../_ratchet.mjs";
import { MEASURES } from "../_measures.mjs";
import { parse, functionsIn } from "../_ast.mjs";

for (const m of MEASURES) ratchet(m);

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
