#!/usr/bin/env node
/**
 * A pull request's title is the squash commit's subject (README, Conventions; docs/naming.md, History): one sentence
 * saying what is now true, at most 100 characters, not ending in a period. What moved goes in the body.
 *
 * What a script can hold of that is the length and the closing period, so that is what this holds; whether the
 * sentence says what is now true is the review's. Characters are counted as a person counts them, so an em dash is
 * one. GitHub adds " (#1234)" to the subject when it squashes, and the limit is the title's, before that.
 *
 *   node tooling/scripts/checks/pr-title.mjs "The wire says snake_case"
 *   PR_TITLE="…" node tooling/scripts/checks/pr-title.mjs     # as CI runs it, the title never inside the shell's text
 *
 * CI runs it on every pull request (.github/workflows/ci.yml). `titleProblems` is the rule, and
 * tests/history/pr-title.test.mjs holds it over the titles main has merged.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** The longest a title may be, in characters. */
export const TITLE_MAX = 100;

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

function main() {
  const title = process.argv[2] ?? process.env.PR_TITLE ?? "";
  const problems = titleProblems(title);
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
