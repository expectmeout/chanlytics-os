/**
 * Source-scan assertions pin text, not behaviour; two release blockers passed
 * thirteen of them in one evening. This makes their count per file a ratchet:
 * it may only fall, except in the files whose whole purpose is a repo-wide
 * lint (every write names a workspace, env vars are declared where read).
 *
 *   UPDATE_SOURCE_SCAN_BASELINE=1 pnpm test   # bank a reduction, and nothing else
 *   UPDATE_BASELINES=1 pnpm test               # the same, together with every other ratchet (docs/debt.md)
 *   UPDATE_BASELINES=raise pnpm test           # a rise, argued in docs/debt.md and the pull request
 *
 * WHY THIS EXISTS AT ALL, in one measurement: on 2026-09-09 three PRs added
 * THIRTY-SIX of these assertions and removed one, against a standing rule in
 * the refactor program that says never to add one. Every addition was locally
 * defensible and nobody could see the total moving, because nothing counted it.
 * That is the whole failure this file addresses -- not that source scanning is
 * always wrong, but that it is invisible, and invisible things drift.
 *
 * Counted on the COMMENT-STRIPPED source, which is a deliberate one-word
 * departure from the program's draft (it used `readRaw`). `_source.mjs` states
 * the reason it strips: "an assertion of the form 'this must not appear' is
 * otherwise tripped by the comment explaining why it must not, and the only way
 * to go green is to delete the explanation". A ratchet counting raw text has
 * exactly that bug about ITSELF -- writing `// do not add a readCode( here`
 * would count as adding one. Measured before changing it: raw and stripped
 * totals are identical today (1082 = 1082), so it costs nothing and removes a
 * trap this repo has already decided it does not want.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { sourceScan, bankedSourceScan, TESTS_DIR, SOURCE_SCAN_BASELINE } from "../_measures.mjs";
import { BANK, RAISE, writeBaseline } from "../_ratchet.mjs";

const DIR = TESTS_DIR;
const BASELINE = path.join(ROOT, SOURCE_SCAN_BASELINE);

// The measure lives in _measures.mjs, beside the others the register prints, and
// says there why the file set is `git ls-files` and the key a path under tests/.
const { files, counts } = sourceScan();

// Banked by the rule every ratchet banks by (_ratchet.mjs): a count falls or goes, and a
// rise waits for UPDATE_BASELINES=raise. It used to write the counts as measured, rises too.
if (process.env.UPDATE_SOURCE_SCAN_BASELINE === "1" || BANK) {
  const prev = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  writeBaseline(BASELINE, { lint: prev.lint, counts: bankedSourceScan(counts, prev, RAISE) });
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

test("no test file reads more source than it did yesterday", () => {
  const worse = [];
  for (const [f, n] of Object.entries(counts)) {
    if (baseline.lint.includes(f)) continue;
    const allowed = baseline.counts[f] ?? 0;
    if (n > allowed) worse.push(`${f}: ${n} source reads, baseline ${allowed}`);
  }
  assert.deepEqual(
    worse,
    [],
    "write a behaviour test instead; if this file IS a repo-wide lint, add it to `lint` in the baseline with a reason in the PR",
  );
});

test("the baseline is not stale", () => {
  // A reduction that is not banked is a reduction the next PR can spend.
  //
  // "Shrank" and "gone" are reported apart because they need different actions,
  // and conflating them is what made this file's first CI run unreadable: a
  // deleted test read as a reduction to bank rather than as an entry to remove.
  const known = new Set(files);
  const shrank = [];
  const gone = [];
  for (const [f, n] of Object.entries(baseline.counts)) {
    if (!known.has(f)) {
      gone.push(`${f} (baseline ${n})`);
      continue;
    }
    if ((counts[f] ?? 0) < n) shrank.push(`${f}: now ${counts[f] ?? 0}, baseline ${n}`);
  }
  assert.deepEqual(
    gone,
    [],
    "these files are baselined but not in the repo — remove them: UPDATE_SOURCE_SCAN_BASELINE=1 pnpm test",
  );
  assert.deepEqual(shrank, [], "good — now lower the baseline: UPDATE_SOURCE_SCAN_BASELINE=1 pnpm test");
});

test("the exemption list names files that are repo-wide lints, and stays small", () => {
  // The escape hatch is the part that rots. A file belongs in `lint` only if it
  // asserts a policy ACROSS the repo -- "every write names a workspace", "every
  // env var is declared where it is read" -- never because pinning one module's
  // text was convenient. Six was the considered number; growth needs an argument
  // in the PR, and this makes that argument compulsory rather than optional. Nine since 29 September 2026:
  // ai/flag-registry.test.mjs holds that every switch the edge reads is listed with an owner and a day, which is
  // env-manifest.test.mjs's kind of lint (a declaration where it is read) and cannot be run, only read.
  assert.ok(baseline.lint.length <= 9, `the exemption list is ${baseline.lint.length}; it is meant to be a handful`);
  for (const f of baseline.lint) {
    assert.ok(
      fs.existsSync(path.join(ROOT, DIR, f)),
      `${f} is exempted but does not exist — delete it from the baseline`,
    );
  }
  // An exempt file's count is still RECORDED, deliberately: exempt means "not
  // ratcheted", not "not measured". The number lands in the baseline diff, so
  // adding a file to `lint` to dodge the ratchet shows up as a number in the PR
  // rather than as a quiet disappearance. There is no assertion for that because
  // the writer above already does it, and an assertion that cannot fail is worse
  // than none.
});
