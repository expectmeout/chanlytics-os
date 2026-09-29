#!/usr/bin/env node
/**
 * A pull request's title is the squash commit's subject (README, Conventions; docs/naming.md, History): one sentence
 * saying what is now true, at most 100 characters, not ending in a period. What moved goes in the body.
 *
 * What a script can hold of that is the length and the closing period, so that is what this holds; whether the
 * sentence says what is now true is the review's. Characters are counted as a person counts them, so an em dash is
 * one. GitHub adds " (#1234)" to the subject when it squashes, and the limit is the title's, before that.
 *
 * The rule is dated: a pull request opened before TITLE_RULE_FROM is exempt, so the day the check merged turned none
 * of the pull requests already open red. A run with no opening time (a local one) is held to the rule.
 *
 *   node tooling/scripts/checks/pr-title.mjs "The wire says snake_case"
 *   PR_TITLE="…" PR_CREATED_AT="…" node tooling/scripts/checks/pr-title.mjs    # as CI runs it, from the event
 *
 * CI runs it on every pull request (.github/workflows/ci.yml), the title and its `created_at` passed through the
 * environment, never inside the shell's text. `titleProblems` is the rule and `exemptByDate` its first day;
 * tests/history/pr-title.test.mjs holds both, over the titles main has merged and either side of the day.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** The longest a title may be, in characters. */
export const TITLE_MAX = 100;

/** The rule's first moment: a pull request opened before it keeps the title it has. */
export const TITLE_RULE_FROM = "2026-09-29T00:00:00Z";

/** What breaks the rule in a title, each as a sentence; none when it keeps it. */
export function titleProblems(title) {
  const text = String(title ?? "");
  if (!text.trim()) return ["The title is empty: say what is now true, in one sentence."];
  const problems = [];
  const length = [...text].length;
  if (length > TITLE_MAX) {
    problems.push(
      `The title is ${length} characters, over ${TITLE_MAX}: keep the sentence that says what is now true, and move what moved to the body.`,
    );
  }
  if (text.trimEnd().endsWith("."))
    problems.push("The title ends with a period: it is a subject line, not a paragraph.");
  return problems;
}

/**
 * Whether a pull request opened at `createdAt` (the event's `created_at`) is exempt: only one with a readable time
 * before TITLE_RULE_FROM. A missing or unreadable time is held to the rule, so the exemption never widens by accident.
 */
export function exemptByDate(createdAt) {
  const at = Date.parse(String(createdAt ?? ""));
  return Number.isFinite(at) && at < Date.parse(TITLE_RULE_FROM);
}

function main() {
  const title = process.argv[2] ?? process.env.PR_TITLE ?? "";
  const createdAt = process.env.PR_CREATED_AT ?? "";
  const problems = titleProblems(title);
  if (exemptByDate(createdAt)) {
    console.log(`title: exempt, opened ${createdAt}, before the rule's first day (${TITLE_RULE_FROM})`);
    for (const p of problems) console.log(`  - not held: ${p}`);
    return;
  }
  if (problems.length) {
    console.error(`The pull request's title breaks the rule (README, Conventions):\n  ${JSON.stringify(title)}`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error("Edit the title, then push: the check reads the title the push's run was given.");
    process.exit(1);
  }
  console.log(`title: ${[...title].length} of ${TITLE_MAX} characters, no closing period`);
}

// Run as a script, not when a test imports titleProblems.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
