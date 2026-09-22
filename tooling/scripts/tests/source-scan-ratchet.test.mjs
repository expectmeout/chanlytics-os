/**
 * Source-scan assertions pin text, not behaviour; two release blockers passed
 * thirteen of them in one evening. This makes their count per file a ratchet:
 * it may only fall, except in the files whose whole purpose is a repo-wide
 * lint (every write names a workspace, env vars are declared where read).
 *
 *   UPDATE_SOURCE_SCAN_BASELINE=1 pnpm test   # rewrite the baseline after a reduction
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
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readCode } from "./_source.mjs";

const DIR = "tooling/scripts/tests";
const BASELINE = path.join(ROOT, DIR, "source-scan-baseline.json");
const SELF = "source-scan-ratchet.test.mjs";

/**
 * The files the REPOSITORY has, not the files this laptop has.
 *
 * Learned from CI, on this file's own first run. The baseline was seeded from a
 * working tree that happened to contain another session's UNTRACKED test file;
 * CI checked out the repo, found four fewer source reads than the baseline
 * claimed, and failed with `legacy-harness.test.mjs: now 0, baseline 4`.
 *
 * A number that differs between a checkout and a desk is not a ratchet — it is a
 * number two people can argue about. So the measurement is over `git ls-files`,
 * which is the same set everywhere, and an untracked scratch test cannot move a
 * repo-wide count in either direction.
 *
 * Falls back to the directory when git is unavailable, because a test that cannot
 * run at all is worse than one measuring a slightly wider set.
 */
function repoTestFiles() {
  try {
    return execFileSync("git", ["ls-files", DIR], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".test.mjs"))
      .map((l) => path.basename(l));
  } catch {
    return fs.readdirSync(path.join(ROOT, DIR)).filter((f) => f.endsWith(".test.mjs"));
  }
}

const files = repoTestFiles().filter((f) => f !== SELF && fs.existsSync(path.join(ROOT, DIR, f)));
const counts = Object.fromEntries(
  files
    .map((f) => [f, (readCode(`${DIR}/${f}`).match(/\b(readCode|readRaw)\(/g) ?? []).length])
    .filter(([, n]) => n > 0),
);

if (process.env.UPDATE_SOURCE_SCAN_BASELINE === "1") {
  const prev = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  fs.writeFileSync(BASELINE, JSON.stringify({ lint: prev.lint, counts }, null, 2) + "\n");
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
  // in the PR, and this makes that argument compulsory rather than optional.
  assert.ok(baseline.lint.length <= 8, `the exemption list is ${baseline.lint.length}; it is meant to be a handful`);
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
