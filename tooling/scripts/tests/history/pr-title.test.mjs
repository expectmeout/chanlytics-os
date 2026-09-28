/**
 * A pull request's title is the squash commit's subject: one sentence saying what is now true, at most 100
 * characters, not ending in a period; what moved goes in the body (README, Conventions; docs/naming.md, History).
 * A pull request opened before 29 September 2026 is exempt. checks/pr-title.mjs holds the title in CI; this holds the
 * check, over titles main merged, titles made to break it, and either side of the rule's first day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { TITLE_MAX, TITLE_RULE_FROM, exemptByDate, titleProblems } from "../../checks/pr-title.mjs";

const keeps = (title) => titleProblems(title).length === 0;

// Titles main merged before the rule was written (#1229 to #1263, read at 4bc3e49a7), less the " (#1234)" GitHub adds
// when it squashes. Each is a sentence saying what is now true, and so broke the rule it replaces (an imperative under
// 72 characters); the new rule takes those that say it in 100 characters. Of main's last 126 titles then, 55 did, 71
// ran longer, and none ended in a period.
const MERGED = [
  ["Reach out 5i: a booking or a deal stops a reach-out (00227)", true],
  ["Partners, 0020: an existing workspace brings in a partner (00225)", true],
  [
    "The banks take only falls, and the lint limits and the barrel rule hold themselves: --update banks a fall and --raise a rise, an emptied tree joins LIMITED_TREES, no module writes export * but a package root",
    false,
  ],
  ["Ask on a phone: one thread, the three lead each answer, and the refinements (D1–D16)", true],
  ["Ask's contract is seven modules, none over 240 lines: a pure move, every export equal to main", true],
  ["Reach out 5h: Today, the bell and Settings say a reply to a reach-out", true],
  ["Reach out 5g: the Inbox shows a reply to a reach-out, read", true],
  ["Ask Rewired, Phase 5 planned: a follow-up is answered with what came before it", true],
  // One character either side of the limit.
  ["Today's view model is fourteen modules, none over 400 lines: a pure move, every export equal to main", true],
  ["Ask Rewired 5.0: Ask keeps its thread in one place — room made as a pure move, the request byte-equal", false],
];

test("the titles main merged keep the rule when they say what is true in 100 characters, and break it past them", () => {
  for (const [title, kept] of MERGED) assert.equal(keeps(title), kept, `${[...title].length}: ${title}`);
});

test("a title is at most 100 characters, counted as a person counts them", () => {
  assert.ok(keeps("a".repeat(TITLE_MAX)));
  assert.deepEqual(titleProblems("a".repeat(TITLE_MAX + 1)), [
    "The title is 101 characters, over 100: keep the sentence that says what is now true, and move what moved to the body.",
  ]);
  assert.ok(keeps("—".repeat(TITLE_MAX)), "an em dash is one character");
  assert.ok(keeps("🙂".repeat(TITLE_MAX)), "and so is an emoji, which JavaScript's length counts as two");
});

test("a title does not end in a period, and says something", () => {
  assert.deepEqual(titleProblems("The wire says snake_case."), [
    "The title ends with a period: it is a subject line, not a paragraph.",
  ]);
  assert.ok(keeps("The wire says snake_case"));
  assert.ok(keeps("The finder's plan asks for 12.5 miles"), "a period inside the sentence is not its end");
  for (const empty of ["", "   ", undefined, null]) assert.equal(titleProblems(empty).length, 1, JSON.stringify(empty));
  assert.equal(titleProblems(`${"a".repeat(TITLE_MAX)}.`).length, 2, "each break is said");
});

test("the rule starts on 29 September 2026: a pull request opened before it is exempt, one opened then or after is held", () => {
  assert.equal(TITLE_RULE_FROM, "2026-09-29T00:00:00Z");
  assert.equal(exemptByDate("2026-09-28T23:59:59Z"), true, "the last second before the rule");
  assert.equal(exemptByDate("2026-09-01T09:00:00Z"), true);
  assert.equal(exemptByDate("2026-09-29T00:00:00Z"), false, "the rule's first moment is held");
  assert.equal(exemptByDate("2026-10-05T14:30:00Z"), false);
  // A time that is missing or unreadable is held: the exemption never widens because the event said nothing.
  for (const none of ["", undefined, null, "yesterday", "2026-13-45T00:00:00Z"])
    assert.equal(exemptByDate(none), false, JSON.stringify(none));
});

test("run as CI runs it: the title and its opening time from the environment, a failure that says why, and a pass", () => {
  const script = path.join(ROOT, "tooling/scripts/checks/pr-title.mjs");
  const AFTER = "2026-09-29T00:00:00Z";
  const BEFORE = "2026-09-28T23:59:59Z";
  const run = (title, createdAt = AFTER, args = []) =>
    spawnSync(process.execPath, [script, ...args], {
      env: { ...process.env, PR_TITLE: title, PR_CREATED_AT: createdAt },
      encoding: "utf8",
    });
  const long = run("a".repeat(TITLE_MAX + 1));
  assert.equal(long.status, 1);
  assert.match(long.stderr, /101 characters, over 100/);
  const ended = run("The wire says snake_case.");
  assert.equal(ended.status, 1);
  assert.match(ended.stderr, /ends with a period/);
  const kept = run("The wire says snake_case");
  assert.equal(kept.status, 0, kept.stderr);
  assert.equal(run("", AFTER, ["The title as an argument"]).status, 0, "an argument is read before the environment");

  // Either side of the day, the same title that breaks the rule.
  const before = run("a".repeat(TITLE_MAX + 1), BEFORE);
  assert.equal(before.status, 0, before.stderr);
  assert.match(before.stdout, /exempt, opened 2026-09-28T23:59:59Z/);
  assert.match(before.stdout, /not held: The title is 101 characters/, "it still says what it would refuse");
  assert.equal(run("a".repeat(TITLE_MAX + 1), AFTER).status, 1, "opened on the day, held");
  assert.equal(run("a".repeat(TITLE_MAX + 1), "").status, 1, "a local run, with no opening time, is held");
});
