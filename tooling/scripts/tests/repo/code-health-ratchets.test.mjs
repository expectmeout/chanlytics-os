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
 * the dashboard, not these syntax trees. The suite's own test files are held here
 * too, by their length (test-length.json, below): the one measure this file
 * defines, since nothing else reads it.
 *
 *   UPDATE_BASELINES=1 pnpm test       # bank a reduction, and nothing else
 *   UPDATE_BASELINES=raise pnpm test   # raise a number, or seed a baseline (argued in docs/debt.md)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { ratchet } from "../_ratchet.mjs";
import { MEASURES, ROUTES } from "../_measures.mjs";
import { ROOT } from "../_source.mjs";
import { SUITES } from "../../checks/test.mjs";
import {
  parse,
  functionsIn,
  durationsIn,
  seedReadsOutsideADemo,
  needsHumanReads,
  resumesUnasked,
  repoFiles,
  linesOf,
} from "../_ast.mjs";

/** What each ratchet measured, by its baseline: the test files' ratchet below leaves to file-length.json what it holds. */
const MEASURED = Object.fromEntries(MEASURES.map((m) => [m.file, ratchet(m).now]));

// The measure the limits above rest on, kept honest: if the compiler ever stops
// parsing the shell's script-mode JSX, the numbers would quietly drop to zero and
// every ratchet would pass. This is the assertion that says so instead.
test("the measure sees the shell's JSX and the packages' TypeScript", () => {
  // The Line's page, the largest JSX left (the frame is TypeScript since the one-system plan's step 7e).
  const shell = functionsIn(parse("apps/dashboard/src/legacy/pages/ask-real.jsx"));
  const core = functionsIn(parse("packages/core/src/deliver.ts"));
  assert.ok(shell.length > 10, "the shell's page parsed as JSX and its functions were found");
  assert.ok(
    shell.some((fn) => fn.branches > 10),
    "a JSX conditional counts as a branch",
  );
  assert.ok(core.length > 5, "core parsed as TypeScript");
});

// The doors' measure, kept honest the same way: if the route trees stopped being read (a moved folder, a changed
// pattern), the number would fall to zero and the ratchet would pass. The doors reached zero on 30 September 2026
// (the thin-doors lane: the edge's, then the dashboard's), so the guard is no longer an offender the measure finds
// but the routes it reads: every route of each tree.
test("the doors' measure reads the edge's doors and the dashboard's routes", () => {
  assert.ok(
    ROUTES.filter((f) => f.startsWith("apps/edge/api/")).length >= 40,
    "the doors of the edge are read (every route under apps/edge/api)",
  );
  assert.ok(
    ROUTES.filter((f) => f.startsWith("apps/dashboard/app/api/")).length >= 80,
    "the routes of the dashboard are read (every route under apps/dashboard/app/api)",
  );
});

// The seed measure on a module written for it (the wiring's second audit, X6-3): each line marked `yes` reads a demo's seeds
// in a real session once per mark, and nothing else in it does: a read under a demo's condition (either side of a negation, an
// `&&`, an `if`, after a guard that leaves outside a demo), a type, a property's own name, a module that is no seed.
test("the seed measure counts a demo's seeds read outside a demo and nothing else", () => {
  const lines = [
    'import { inboxSample, peopleSample as people } from "./sample";',
    'import { NEEDING_YOU } from "../inbox/sample/threads-needing-you";',
    'import { EXAMPLE_READS } from "./examples";',
    'import { DEMO_ADS } from "../demo-ads";',
    'import { accountChecks } from "./ad-accounts-mock";',
    'import type { SampleDay } from "./sample-clock";',
    'import { realRows } from "./rows";',
    "export const seeded = inboxSample; // yes",
    "export const both = [people, NEEDING_YOU]; // yes yes",
    "export const shown = { EXAMPLE_READS }; // yes",
    "export const checks = (p) => accountChecks(p); // yes",
    "export const cut = demoSession() ? DEMO_ADS : realRows();",
    "export const kept = !demoSession() ? realRows() : people;",
    "export const wrong = !demoSession() ? people : realRows(); // yes",
    "export const flag = (demo) => demo && people;",
    "export const either = (s) => !window.__DEMO_MODE || inboxSample;",
    "export function read() { if (isDemoSession()) return people; return realRows(); }",
    "export function guarded(id) { if (!demoSession() || id === null) return null; return NEEDING_YOU[0]; }",
    "export function late(id) { if (id === null) return null; return NEEDING_YOU[0]; } // yes",
    "export const day = (d: SampleDay) => d;",
    "export const named = { inboxSample: 1 }.inboxSample;",
    "export const rows = realRows();",
  ];
  const sf = ts.createSourceFile(
    "surfaces/x/page.ts",
    lines.join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const marked = lines.reduce((n, l) => n + (l.match(/\byes\b/g) ?? []).length, 0);
  assert.equal(seedReadsOutsideADemo(sf), marked);
  const seed = ts.createSourceFile(
    "surfaces/x/sample.ts",
    lines.join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.equal(seedReadsOutsideADemo(seed), 0, "a seed module's own reads are its own");
});

/** A fixture's syntax tree, named as the file it stands for (a measure reads the name: a seed module, the standing rule). */
const fixture = (file, lines) =>
  ts.createSourceFile(
    file,
    lines.join("\n"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
const marks = (lines) => lines.reduce((n, l) => n + (l.match(/\byes\b/g) ?? []).length, 0);

// S9-1's class guard on a module written for it: each line marked `yes` compares the raw state once per mark, and nothing
// else does: a write of the state, a type, a word in a sentence, another state compared.
test("the needs_human measure counts comparisons with the raw state and nothing else", () => {
  const lines = [
    'const waits = rows.filter((r) => r.state === "needs_human"); // yes',
    'if ("needs_human" !== c.state) skip(); // yes',
    'switch (t.state) { case "needs_human": return true; } // yes',
    'const q = db.from("conversations").eq("state", "needs_human"); // yes',
    'const any = ["needs_human", "snoozed"].includes(s); // yes',
    'const flagged = new Set(["needs_human"]); const ok = flagged.has(s);',
    'const moved = { state: "needs_human", paused_until: until };',
    'type State = "open" | "needs_human";',
    'const said = "needs_human means a person was asked for";',
    'const open = rows.filter((r) => r.state === "open");',
    "const human = r.needs_human;",
  ];
  assert.equal(needsHumanReads(fixture("apps/dashboard/src/server/x.ts", lines)), marks(lines));
  for (const own of [
    "packages/contracts/src/conversations/standing.ts",
    "apps/dashboard/src/surfaces/people/sample.ts",
  ])
    assert.equal(needsHumanReads(fixture(own, lines)), 0, `${own}: the rule's own, or a demo's seeds`);
});

// S9-2's class guard on modules written for it: a Resume sent on one tap counts; one sent from the question, or behind a
// Resume act already answered (the Campaigns home's runner), does not; nor does another verb's resume.
test("the resume measure counts a campaign's or a reach-out's Resume sent where nothing asks", () => {
  const head = [
    'import { playbooks as V } from "../playbooks/verbs";',
    'import { reachOuts } from "../../campaigns/reach-out/surface";',
    'import { verbs as ads } from "../ads/verbs";',
  ];
  const body = [
    "const tap = () => V.resume(id); // yes",
    "const R = reachOuts;",
    "const chain = () => R.resume(root); // yes",
    "const toggle = () => (paused ? reachOuts.resume(root) : reachOuts.pause(root)); // yes",
    "const ad = () => ads.resume(adId);",
    "const answered = (act) => { if (act.kind === 'resume') return V.resume(act.playbookId); };",
    "const run = async (id) => { await V.resume(id); };",
    "const onAct = (act) => { if (act.kind === 'open') go(); else if (act.kind === 'resume') void run(act.playbookId); };",
    "const unanswered = async (id) => { await V.resume(id); }; // yes",
    "const press = () => void unanswered(id);",
  ];
  const lines = [...head, ...body];
  assert.equal(resumesUnasked(fixture("apps/dashboard/src/surfaces/x/page.tsx", lines)), marks(lines));
  const asks = ['import { ResumeAct } from "../campaigns/home/resume-act";', ...lines];
  assert.equal(
    resumesUnasked(fixture("apps/dashboard/src/surfaces/x/page.tsx", asks)),
    0,
    "a module that draws the question",
  );
  assert.equal(resumesUnasked(fixture("apps/dashboard/src/surfaces/x/page.tsx", body)), 0, "no verbs of a campaign's");
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

/*
 * The suite's own test files, held by their length as file-length.json holds the code that ships. The largest cannot
 * be reviewed, and running one of their cases runs all of them: the runner's unit is the file. A test file's limit is
 * twice a module's: a case writes its world and its assertions out longhand, and the suite's median file ran about
 * twice the median module's length on 26 October 2026, at e9d6325f0, with the limit above nineteen files in twenty, so
 * it holds the tail and not the body. A file file-length.json already holds is left to it: the phone app's tests
 * (apps/mobile/test) ship with the app and meet a module's limit there first, so each file answers to one limit.
 */
const TEST_FILE_LIMIT = 1600;

/**
 * The node suite's own test files, tracked, as its launcher globs them (`SUITES.test`, checks/test.mjs): git's
 * `:(glob)` pathspec reads `**` and `*` as the runner does. A glob that lists nothing stops this file here, before its
 * ratchet runs: an empty listing would leave every offender "gone", and a bank would write the baseline empty.
 * repoFiles' walk of the disk, where git cannot run, takes a tree's name and not a pathspec, so it lists nothing here.
 */
const SUITE_FILES = SUITES.test.flatMap((glob) => {
  const found = repoFiles([`:(glob)${glob}`]);
  if (!found.length) {
    throw new Error(
      `git ls-files lists nothing for the launcher's ${glob}: the test-length measure has nothing to read`,
    );
  }
  return found;
});

/**
 * A file's text as `linesOf` reads a syntax tree (_ast.mjs, file-length.json's measure): TypeScript's own line map of
 * it, and no parse. A length needs no tree, and parsing every test file to count its lines would cost the run seconds
 * and hold each tree in memory.
 */
const lineMapOf = (text) => ({
  text,
  end: text.length,
  getLineAndCharacterOfPosition: (pos) => ts.getLineAndCharacterOfPosition({ text }, pos),
});
const testLength = (file) => linesOf(lineMapOf(fs.readFileSync(path.join(ROOT, file), "utf8")));

ratchet({
  name: "test files over the limit",
  file: "test-length.json",
  measure: () =>
    Object.fromEntries(
      SUITE_FILES.filter((f) => !(f in MEASURED["file-length.json"]))
        .map((f) => [f, testLength(f)])
        .filter(([, n]) => n > TEST_FILE_LIMIT),
    ),
  advice: `Split it by concern: a file each, named for what it proves, the world they share in their folder's _<name>.mjs, and a folder of their own where this one is at its limit of modules (tree-shape.json). A test file over ${TEST_FILE_LIMIT} lines is two files.`,
});

// The length measure, kept honest: it counts what the file-length ratchet counts over a parse, whatever a file's last
// line and line endings. That each of the launcher's globs lists something is checked where the listing is made, since
// a bank runs before any test does.
test("the test-length measure counts a file's lines as file-length does, over the suite's test files", () => {
  for (const text of ["", "a", "a\n", "a\nb", "a\nb\n", "a\n\n", "a\r\nb\r\n", "a\r\nb", "a\rb"]) {
    const sf = ts.createSourceFile("fixture.mjs", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    assert.equal(linesOf(lineMapOf(text)), linesOf(sf), JSON.stringify(text));
  }
  const self = path
    .relative(ROOT, fileURLToPath(import.meta.url))
    .split(path.sep)
    .join("/");
  assert.equal(testLength(self), linesOf(parse(self)), "this file, by its line map and by its parse");
  assert.ok(SUITE_FILES.includes(self), "this file is one of the suite's");
  assert.deepEqual(
    SUITE_FILES.filter((f) => !f.endsWith(".test.mjs")),
    [],
    "only test files",
  );
});
