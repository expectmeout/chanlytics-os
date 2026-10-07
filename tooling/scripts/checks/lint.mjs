#!/usr/bin/env node
/**
 * Lint warnings may only fall, file by file and rule by rule.
 *
 * ESLint runs over the tree with eslint.config.mjs. An error fails the run, as it
 * always did. A warning is held against baselines/lint-warnings.json, a count for
 * each file and rule: a count that rises fails, and so does a file or rule the
 * baseline does not name; a count that falls fails too until it is banked, the
 * way every ratchet under tooling/scripts/tests does, so the file always says what
 * the tree holds. It replaced `--max-warnings 46`, one total, under which a file
 * could gain a warning while another lost one and nobody saw either.
 *
 *   corepack pnpm lint                 # lint, and compare with the baseline
 *   corepack pnpm lint -- --update     # bank what fell and drop what is gone, nothing else
 *   corepack pnpm lint -- --raise      # write the counts as measured, rises and new entries included; or seed
 *   corepack pnpm lint -- --fix        # write ESLint's fixes first
 *
 * `--update` banks only what fell, by the ratchets' rule (_ratchet.mjs, `UPDATE_BASELINES=1`): a count that
 * fell is banked at its new number and a file and rule that reached zero leave the baseline, while a count that
 * rose keeps its number and a file or rule the baseline does not name is not written, so either stays a red build.
 * `--raise` is the one way a count goes up (`UPDATE_BASELINES=raise` for the ratchets), in the same diff as its row
 * under "Rises" in docs/debt.md, with the reason in the pull request, and the one way a missing baseline is seeded:
 * with none, every entry is new, which is a rise. `bankWarnings` is the decision, and repo/measures.test.mjs holds
 * it beside the ratchets' own bank.
 *
 * A warning the baseline holds is still a defect. It is held so the build can be
 * strict about the next one, not because it is fine.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BASELINE = path.join(ROOT, "tooling/scripts/tests/baselines/lint-warnings.json");

/** `{ file: { rule: count } }` with the files and each file's rules in order, as the baseline is written. */
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
 * The baseline a bank writes, from the counts measured now and the baseline (null when there is none). Plainly:
 * each file and rule both hold, at the lower of the two; one that reached zero is dropped; one the baseline does
 * not name is not written. With `raise`: the counts as measured. A missing baseline is seeded only by a raise (null
 * otherwise: write nothing), as _ratchet.mjs's `bank` seeds one. Banking what was just banked changes nothing.
 */
export function bankWarnings(now, baseline, { raise = false } = {}) {
  if (raise) return sortWarnings(now);
  if (!baseline) return null;
  const out = {};
  for (const [file, rules] of Object.entries(sortWarnings(now))) {
    for (const [rule, n] of Object.entries(rules)) {
      const was = baseline[file]?.[rule];
      if (typeof was === "number") (out[file] ??= {})[rule] = Math.min(n, was);
    }
  }
  return out;
}

async function main() {
  const update = process.argv.includes("--update");
  const raise = process.argv.includes("--raise");
  const fix = process.argv.includes("--fix");

  const eslint = new ESLint({ cwd: ROOT, fix });
  const results = await eslint.lintFiles(["."]);
  if (fix) await ESLint.outputFixes(results);
  const stylish = await eslint.loadFormatter("stylish");

  const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
  /** A warning with no rule is ESLint's own, such as a disable comment that disables nothing. */
  const ruleOf = (m) => m.ruleId ?? "(eslint)";

  /** The results cut to the messages `keep` accepts, with their counts to match, for the formatter. */
  function only(keep) {
    return results
      .map((r) => {
        const messages = r.messages.filter((m) => keep(r, m));
        const errors = messages.filter((m) => m.severity === 2).length;
        return {
          ...r,
          messages,
          errorCount: errors,
          fatalErrorCount: messages.filter((m) => m.fatal).length,
          warningCount: messages.length - errors,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
        };
      })
      .filter((r) => r.messages.length > 0);
  }

  const now = {};
  for (const r of results) {
    for (const m of r.messages) {
      if (m.severity !== 1) continue;
      const rules = (now[rel(r.filePath)] ??= {});
      rules[ruleOf(m)] = (rules[ruleOf(m)] ?? 0) + 1;
    }
  }
  const sorted = sortWarnings(now);

  let failed = false;
  const errors = only((_, m) => m.severity === 2);
  if (errors.length) {
    console.error(stylish.format(errors));
    failed = true;
  }

  if (update || raise) {
    const was = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null;
    const banked = bankWarnings(sorted, was, { raise });
    if (banked) fs.writeFileSync(BASELINE, JSON.stringify(banked, null, 2) + "\n");
  }
  if (!fs.existsSync(BASELINE)) {
    console.error(`no baseline at ${rel(BASELINE)}: seed it with corepack pnpm lint -- --raise`);
    process.exit(2);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

  const rose = [];
  const fell = [];
  for (const [file, rules] of Object.entries(sorted)) {
    for (const [rule, n] of Object.entries(rules)) {
      const was = baseline[file]?.[rule] ?? 0;
      if (n > was) rose.push({ file, rule, n, was });
    }
  }
  for (const [file, rules] of Object.entries(baseline)) {
    for (const [rule, was] of Object.entries(rules)) {
      const n = sorted[file]?.[rule] ?? 0;
      if (n < was) fell.push({ file, rule, n, was });
    }
  }

  if (rose.length) {
    const risen = new Set(rose.map(({ file, rule }) => `${file}\0${rule}`));
    console.error(stylish.format(only((r, m) => m.severity === 1 && risen.has(`${rel(r.filePath)}\0${ruleOf(m)}`))));
    console.error(
      `lint warnings rose:\n  ${rose.map(({ file, rule, n, was }) => `${file} ${rule}: ${was} -> ${n}`).join("\n  ")}\n\n` +
        "Fix the warning. A count that must rise is raised with corepack pnpm lint -- --raise, in the same diff " +
        'as its row under "Rises" in docs/debt.md, with the reason in the pull request.',
    );
    failed = true;
  }
  if (fell.length) {
    console.error(
      `good, now bank it (corepack pnpm lint -- --update):\n  ${fell.map(({ file, rule, n, was }) => `${file} ${rule}: ${was} -> ${n}`).join("\n  ")}`,
    );
    failed = true;
  }
  if (failed) process.exit(1);

  const total = Object.values(sorted).reduce((a, rules) => a + Object.values(rules).reduce((b, n) => b + n, 0), 0);
  console.log(`lint: no errors; ${total} warnings in ${Object.keys(sorted).length} files, as the baseline holds`);
}

// Run as a script, not when a test imports bankWarnings.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) await main();
