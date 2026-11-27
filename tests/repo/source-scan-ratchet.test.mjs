/**
 * Source-scan assertions pin text, not behaviour; two release blockers passed thirteen of them in one evening. Their
 * count per file is a measure (_measures.mjs SOURCE_SCAN, the register's "source-text reads in tests") that may only
 * fall, held change by change by check:debt (decision 0074). A rule test, whose whole purpose is a rule of the
 * repository (every write names a workspace, env vars are declared where read, the words a screen may say), lives in
 * tests/repo/ or is one of a handful named beside its domain (RULE_TESTS_ELSEWHERE); its reads are counted apart
 * (RULE_SCAN), and held as well.
 *
 * WHY THIS EXISTS AT ALL, in one measurement: on 2026-09-09 three PRs added THIRTY-SIX of these assertions and removed
 * one, against a standing rule in the refactor program that says never to add one. Every addition was locally
 * defensible and nobody could see the total moving, because nothing counted it. That is the whole failure this
 * addresses -- not that source scanning is always wrong, but that it is invisible, and invisible things drift.
 *
 * Counted on the COMMENT-STRIPPED source: an assertion of the form "this must not appear" is otherwise tripped by the
 * comment explaining why it must not (_source.mjs), and a count of raw text has that bug about itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import {
  RULE_SCAN,
  RULE_TESTS_DIR,
  RULE_TESTS_ELSEWHERE,
  SOURCE_SCAN,
  TESTS_DIR,
  isRuleTest,
  sourceScan,
} from "../_measures.mjs";

test("the rule tests outside tests/repo/ are a handful of repo-wide lints, each one there", () => {
  // The list is the part that rots. A file belongs in it only if it asserts a policy ACROSS the repo -- "every write
  // names a workspace", "every switch the edge reads is listed with an owner and a day" -- and lives beside the domain
  // it holds; never because pinning one module's text was convenient. Four since 25 Nov 2026, when the rest of the
  // rules were found where they live, under tests/repo/, and three since 26 Nov, when edge/runtime-freshness ran what it
  // read. Growth is a line of _measures.mjs in review.
  assert.ok(RULE_TESTS_ELSEWHERE.length <= 3, `${RULE_TESTS_ELSEWHERE.length} rule tests outside tests/repo/`);
  for (const f of RULE_TESTS_ELSEWHERE) {
    assert.ok(
      fs.existsSync(path.join(ROOT, TESTS_DIR, f)),
      `${f} is named but does not exist: take it out of the list`,
    );
    assert.ok(!f.startsWith(RULE_TESTS_DIR), `${f} is under tests/repo/, a rule test already`);
  }
  assert.deepEqual([...RULE_TESTS_ELSEWHERE].sort(), RULE_TESTS_ELSEWHERE, "in order");
});

test("every test file that reads source is counted once: a behaviour test's reads in one measure, a rule test's in the other", () => {
  const { counts } = sourceScan();
  const behaviour = SOURCE_SCAN.measure();
  const rules = RULE_SCAN.measure();
  // The behaviour tests' reads fall toward none (lane 4's rounds took them from 556 to a few dozen); the rule tests read
  // source by design, so they are what shows the scan still sees the suite.
  assert.ok(Object.keys(rules).length > 5, "the rule tests, which read source by design, are found");
  assert.ok(Object.keys(counts).length >= Object.keys(rules).length, "and every one is among the files that read");
  for (const [f, n] of Object.entries(counts)) {
    const held = isRuleTest(f) ? rules : behaviour;
    const other = isRuleTest(f) ? behaviour : rules;
    assert.equal(held[f], n, f);
    assert.ok(!(f in other), `${f} is counted twice`);
  }
  assert.ok(
    isRuleTest("repo/hygiene.test.mjs") && isRuleTest("repo/words/screen-words.test.mjs"),
    "tests/repo/ holds rules",
  );
  assert.ok(
    !isRuleTest("ask/line/jumps-suggestions-and-quick-answers.test.mjs"),
    "a domain's test is a behaviour test",
  );
});
