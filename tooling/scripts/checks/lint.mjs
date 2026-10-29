#!/usr/bin/env node
/**
 * The lint: an error fails the run; a warning is a number check:debt holds, file by file and rule by rule.
 *
 * ESLint runs over the tree with eslint.config.mjs. An error fails the run, as it always did. Warnings are counted for
 * each file and rule, and since 28 October 2026 (decision 0074) a pull request is held to what it adds: CI's debt job
 * counts them on the change's base and on its head (tooling/scripts/checks/debt.mjs, its `lint` part), and a count
 * that rose, or a file and rule the base did not have, fails the change unless its description says why, in a line
 * `Debt: <why>`. No baseline is committed, so a fall needs no banking. It replaced baselines/lint-warnings.json, which
 * replaced `--max-warnings 46`, one total, under which a file could gain a warning while another lost one.
 *
 * A typed rule is a warning only while the tree holds a finding of it (eslint.config.mjs, HELD_TYPED): the run fails
 * when one of them holds none, so the change that fixes a rule's last finding makes it an error.
 *
 *   corepack pnpm lint                 # lint: errors fail; the warnings are counted and said
 *   corepack pnpm lint -- --fix        # write ESLint's fixes first
 *
 * A warning is still a defect. It is counted so the build can be strict about the next one, not because it is fine.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { HELD_TYPED } from "../../../eslint.config.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** `{ file: { rule: count } }` with the files and each file's rules in order. */
function sortWarnings(counts) {
  return Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((file) => [
        file,
        Object.fromEntries(
          Object.keys(counts[file])
            .sort()
            .map((rule) => [rule, counts[file][rule]]),
        ),
      ]),
  );
}

/**
 * ESLint's cache. A file whose content and the config are as they were last time is not linted again: its result,
 * warnings and all, comes from the cache (by content, so a fresh checkout in CI hits too). A typed rule can turn on a
 * file that did not change when a type it reads did, and the cache cannot see that, so `LINT_CACHE=0` lints every file
 * afresh: main's own run after a merge does (ci.yml), and its result is the cache the pull requests start from. Afresh
 * is the cache emptied first and kept on, never turned off: ESLint deletes its cache file when the cache is off, and
 * main then left the pull requests none (16 Oct 2026: four minutes of lint on every one).
 */
export function cacheOptions(env = process.env, group = "") {
  return {
    fresh: env.LINT_CACHE === "0",
    cache: true,
    // Each group its own file (below): two runs on one file would each keep only what they linted.
    cacheLocation: path.join(CACHE_ROOT, group, "/"),
    cacheStrategy: "content",
  };
}
const CACHE_ROOT = path.join(ROOT, "node_modules/.cache/eslint");

/**
 * The tree in groups, each linted in a process of its own, one after another. typescript-eslint's project service is
 * one per process and keeps every program it opened until the process ends, and each program holds the packages'
 * sources it reads: one run over the tree held them all at once, 4.97 GB of a 5,120 MB heap on 29 Oct 2026, and the
 * first push of #1921 died of it on CI. Apart, a run's peak is its largest group's, and each group grows with its own
 * code alone. The last group is the rest of the tree, every file the groups before it do not name, so none is linted
 * twice and none is missed; measured, the groups' warnings are the one run's, file for file and rule for rule.
 */
export const GROUPS = [
  { name: "dashboard", dirs: ["apps/dashboard"] },
  { name: "packages", dirs: ["packages"] },
  { name: "rest", dirs: null },
];
/** Each process's heap: the ceiling the one run had, which each group now stays well under (lint says how far). */
export const GROUP_HEAP_MB = 5120;
/** Where a group's peak heap is said as near its ceiling, so a group is split before it fails, not after. */
const NEAR = 0.8;

/** What ESLint is asked for in each group: its directories, or, for the rest, the tree less every one named before. */
export const groupArgs = (groups = GROUPS) =>
  groups.map((g, i) =>
    g.dirs
      ? { name: g.name, files: g.dirs, ignorePatterns: [] }
      : {
          name: g.name,
          files: ["."],
          ignorePatterns: groups
            .slice(0, i)
            .flatMap((x) => x.dirs ?? [])
            .map((d) => `${d}/**`),
        },
  );

/** One group, in this process: its results with anything to say, and the most heap it used. */
async function lintGroup({ files, ignorePatterns, name }, { fix }) {
  const { fresh: _fresh, ...cache } = cacheOptions(process.env, name);
  let peak = 0;
  const sample = () => (peak = Math.max(peak, process.memoryUsage().heapUsed));
  const tick = setInterval(sample, 250);
  try {
    const eslint = new ESLint({ cwd: ROOT, fix, ignorePatterns, ...cache });
    const results = await eslint.lintFiles(files);
    if (fix) await ESLint.outputFixes(results);
    sample();
    return { results: results.filter((r) => r.messages.length > 0), peakMB: Math.round(peak / 2 ** 20) };
  } finally {
    clearInterval(tick);
  }
}

/** One group, in a process of its own: what it found, read back from the file it wrote. */
function runGroup(group, { fix, env }) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lint-")), `${group.name}.json`);
  const args = [`--max-old-space-size=${GROUP_HEAP_MB}`, fileURLToPath(import.meta.url), "--group", group.name];
  const run = spawnSync(process.execPath, [...args, "--out", out, ...(fix ? ["--fix"] : [])], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  try {
    if (run.status !== 0 || !fs.existsSync(out))
      throw new Error(
        `lint: the ${group.name} group's process ended ${run.signal ?? `with ${run.status}`} before it said what it ` +
          `found (its heap is ${GROUP_HEAP_MB} MB: a group that outgrew it is split in GROUPS)`,
      );
    return JSON.parse(fs.readFileSync(out, "utf8"));
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
}

/** The messages ESLint found, the warnings counted by file and rule, and the most heap each group used. */
export async function lintTree({ fix = false, env = process.env } = {}) {
  if (cacheOptions(env).fresh) fs.rmSync(CACHE_ROOT, { recursive: true, force: true });
  const results = [];
  const peaks = {};
  for (const group of groupArgs()) {
    const found = runGroup(group, { fix, env });
    results.push(...found.results);
    peaks[group.name] = found.peakMB;
  }
  const now = {};
  for (const r of results) {
    for (const m of r.messages) {
      if (m.severity !== 1) continue;
      const rules = (now[rel(r.filePath)] ??= {});
      rules[ruleOf(m)] = (rules[ruleOf(m)] ?? 0) + 1;
    }
  }
  return { results, warnings: sortWarnings(now), peaks };
}

const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
/** A warning with no rule is ESLint's own, such as a disable comment that disables nothing. */
const ruleOf = (m) => m.ruleId ?? "(eslint)";

/** The warnings as check:debt keys them: one number for each `<file>::<rule>`. */
export const flatWarnings = (warnings) =>
  Object.fromEntries(
    Object.entries(warnings).flatMap(([file, rules]) =>
      Object.entries(rules).map(([rule, n]) => [`${file}::${rule}`, n]),
    ),
  );

/** The typed rules held as warnings that the tree holds no finding of: each is an error from the change that says so. */
export const heldButClean = (warnings, held = HELD_TYPED) => {
  const found = new Set(Object.values(warnings).flatMap((rules) => Object.keys(rules)));
  return held.filter((rule) => !found.has(rule));
};

/** What the heap each group used says: always its peak, and a warning where one nears its ceiling. */
export function peaksWords(peaks, heapMB = GROUP_HEAP_MB) {
  const each = Object.entries(peaks).map(([name, mb]) => `${name} ${mb.toLocaleString("en-US")} MB`);
  const near = Object.entries(peaks).filter(([, mb]) => mb >= heapMB * NEAR);
  const line = `lint: the most heap each group used, of ${heapMB.toLocaleString("en-US")} MB: ${each.join(", ")}`;
  return near.length
    ? `${line}. ${near.map(([n]) => n).join(" and ")} ${near.length === 1 ? "is" : "are"} near the ceiling: split ${near.length === 1 ? "it" : "them"} in GROUPS (tooling/scripts/checks/lint.mjs) before ${near.length === 1 ? "it fails" : "they fail"}`
    : line;
}

/** A group's process (lintTree starts one per group): it lints its files and writes what it found for the run. */
async function groupMain() {
  const name = process.argv[process.argv.indexOf("--group") + 1];
  const out = process.argv[process.argv.indexOf("--out") + 1];
  const group = groupArgs().find((g) => g.name === name);
  if (!group || !out) throw new Error(`lint: no group "${name}", or nowhere to write it`);
  fs.writeFileSync(out, JSON.stringify(await lintGroup(group, { fix: process.argv.includes("--fix") })));
}

async function main() {
  const fix = process.argv.includes("--fix");
  const { results, warnings, peaks } = await lintTree({ fix });
  const stylish = await new ESLint({ cwd: ROOT }).loadFormatter("stylish");

  const errors = results
    .map((r) => {
      const messages = r.messages.filter((m) => m.severity === 2);
      return {
        ...r,
        messages,
        errorCount: messages.length,
        fatalErrorCount: messages.filter((m) => m.fatal).length,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
      };
    })
    .filter((r) => r.messages.length > 0);
  let failed = false;
  if (errors.length) {
    console.error(stylish.format(errors));
    failed = true;
  }
  const clean = heldButClean(warnings);
  if (clean.length) {
    console.error(
      `the tree holds no finding of ${clean.join(", ")}: take ${clean.length === 1 ? "it" : "each"} out of HELD_TYPED ` +
        "in eslint.config.mjs, and the rule is an error from now on",
    );
    failed = true;
  }
  if (failed) process.exit(1);
  const total = Object.values(warnings).reduce((a, rules) => a + Object.values(rules).reduce((b, n) => b + n, 0), 0);
  console.log(peaksWords(peaks));
  console.log(
    `lint: no errors; ${total} warnings in ${Object.keys(warnings).length} files (check:debt holds them to the base)`,
  );
}
// Run as a script, not when a module imports what it measures.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url)))
  await (process.argv.includes("--group") ? groupMain() : main());
