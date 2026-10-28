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
import fs from "node:fs";
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
export function cacheOptions(env = process.env) {
  return {
    fresh: env.LINT_CACHE === "0",
    cache: true,
    cacheLocation: path.join(ROOT, "node_modules/.cache/eslint/"),
    cacheStrategy: "content",
  };
}

/** The messages ESLint found, the warnings counted by file and rule, and the results to say the errors from. */
export async function lintTree({ fix = false, env = process.env } = {}) {
  const { fresh, ...cache } = cacheOptions(env);
  if (fresh) fs.rmSync(cache.cacheLocation, { recursive: true, force: true });
  const eslint = new ESLint({ cwd: ROOT, fix, ...cache });
  const results = await eslint.lintFiles(["."]);
  if (fix) await ESLint.outputFixes(results);
  const now = {};
  for (const r of results) {
    for (const m of r.messages) {
      if (m.severity !== 1) continue;
      const rules = (now[rel(r.filePath)] ??= {});
      rules[ruleOf(m)] = (rules[ruleOf(m)] ?? 0) + 1;
    }
  }
  return { eslint, results, warnings: sortWarnings(now) };
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

async function main() {
  const fix = process.argv.includes("--fix");
  const { eslint, results, warnings } = await lintTree({ fix });
  const stylish = await eslint.loadFormatter("stylish");

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
  console.log(
    `lint: no errors; ${total} warnings in ${Object.keys(warnings).length} files (check:debt holds them to the base)`,
  );
}
// Run as a script, not when a module imports what it measures.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) await main();
