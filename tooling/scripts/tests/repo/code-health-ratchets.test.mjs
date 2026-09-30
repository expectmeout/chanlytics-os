/**
 * What is measured may only fall.
 *
 * Eight numbers the scorecard of 26 September 2026 found drifting, and the plan's
 * unnamed durations, each with the rule it stands for, held at its current value by
 * a ratchet (_ratchet.mjs) over a measurement of the syntax tree (_ast.mjs, defined
 * in _measures.mjs). docs/debt.md
 * is the register that names each one, what retires it, and the next step; the plan
 * is docs/plans/2026-09-26-organization-and-code-health.md.
 *
 * Why one file: the node runner starts a process per test file, and parsing the
 * repository's 800 modules once costs a few seconds. Nine files would parse it
 * nine times. Each ratchet below is still its own pair of tests, named for the
 * number it holds. The wire's names are held beside the routes, by the same
 * ratchet (routes/wire-casing.test.mjs): they need the type checker's program over
 * the dashboard, not these syntax trees.
 *
 *   UPDATE_BASELINES=1 pnpm test       # bank a reduction, and nothing else
 *   UPDATE_BASELINES=raise pnpm test   # raise a number, or seed a baseline (argued in docs/debt.md)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { ratchet } from "../_ratchet.mjs";
import { MEASURES } from "../_measures.mjs";
import { parse, functionsIn, durationsIn } from "../_ast.mjs";

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

// The doors' measure, kept honest the same way: if the route trees stopped being read (a moved folder, a changed
// pattern), the number would fall to zero and the ratchet would pass. Both trees hold offenders until the doors are
// thinned; the day one has none, this asserts the other still does, and the measure retires with the last.
test("the doors' measure reads the edge's doors and the dashboard's routes", () => {
  const doors = Object.keys(MEASURES.find((m) => m.file === "route-doors.json").measure());
  assert.ok(
    doors.some((f) => f.startsWith("apps/edge/api/")),
    "a door of the edge is read",
  );
  assert.ok(
    doors.some((f) => f.startsWith("apps/dashboard/app/api/")),
    "a route of the dashboard is read",
  );
});

// The duration measure on a module written for it: each line marked `yes` holds one length of time written as a
// bare number per mark, and nothing else in it is one: a count, a size, seconds, metres, a change of unit, a nudge,
// an index, a zero delay, or a minute already named. A name without its unit hides no length of time (LEASE,
// TIMEOUT, WINDOW), and a name that says another unit keeps a round number out (metres, characters, tokens).
test("the duration measure counts lengths of time and nothing else", () => {
  const lines = [
    "setTimeout(go, 800); // yes",
    "setInterval(tick, 15 * 60 * 1000); // yes",
    "fetch(u, { signal: AbortSignal.timeout(8_000) }); // yes",
    "new Client({ timeout: 20_000, retries: 2 }); // yes",
    "AbortSignal.timeout(Math.max(500, Math.min(left, 5_000))); // yes yes",
    "setTimeout(go, o.debounceMs ?? 400); // yes",
    "const LEASE_MS = 5 * 60_000; // yes",
    "const TTL_MS = 300_000; // yes",
    "const since = Date.now() - days * 86_400_000; // yes",
    "const minutes = Math.round((Date.now() - at.getTime()) / 60000); // yes",
    "const pause = hours * 3600 * 1000; // yes",
    "const waits = [2 * 60_000, 10 * 60_000]; // yes yes",
    "const deadline = now + 50_000; // yes",
    "const left = budgetMs - 8_000; // yes",
    "const rule = { reply_delay_ms: z.number().max(600000) }; // yes",
    "const LEASE = 5 * 60 * 1000; // yes",
    "const TIMEOUT = 300_000; // yes",
    "const WINDOW = 3_600_000; // yes",
    "setTimeout(go, 0);",
    "setTimeout(go, RETRY_MS);",
    "const RETRY_MS = 800;",
    "const NAMED_MS = 5 * MIN_MS;",
    "const RADIUS_MAX_M = 60_000;",
    "const TAB_TOTAL_CHARS = 600_000;",
    "const ASK_TOKENS_DAY = 1_500_000;",
    "const limits = { radiusM: 60 * 1000 };",
    "const PAGE = 1000;",
    "const s = Math.floor(Date.now() / 1000);",
    "const ms = seconds * 1000;",
    "const A_DAY_S = 24 * 60 * 60;",
    "const pin = 100000 + (n % 900000);",
    "AbortSignal.timeout(limits[2]);",
    "const end = at + 1;",
  ];
  const sf = ts.createSourceFile("fixture.ts", lines.join("\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const marked = lines.flatMap((l, i) => (l.match(/\byes\b/g) ?? []).map(() => i + 1));
  assert.deepEqual(
    durationsIn(sf).map((d) => d.line),
    marked,
  );
});
