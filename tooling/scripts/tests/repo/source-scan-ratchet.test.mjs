/**
 * Source-scan assertions pin text, not behaviour; two release blockers passed thirteen of them in one evening. Their
 * count per file is a measure (_measures.mjs SOURCE_SCAN, the register's "source-text reads in tests") that may only
 * fall, held change by change by check:debt (decision 0074), except in the files whose whole purpose is a repo-wide
 * lint (every write names a workspace, env vars are declared where read): SOURCE_SCAN_EXEMPT.
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
import { SOURCE_SCAN, SOURCE_SCAN_EXEMPT, TESTS_DIR, sourceScan } from "../_measures.mjs";

test("the exemption list names files that are repo-wide lints, and stays small", () => {
  // The escape hatch is the part that rots. A file belongs in the list only if it asserts a policy ACROSS the repo --
  // "every write names a workspace", "every env var is declared where it is read" -- never because pinning one module's
  // text was convenient. Six was the considered number; nine since 29 September 2026: ai/flag-registry.test.mjs holds
  // that every switch the edge reads is listed with an owner and a day, which is env-manifest.test.mjs's kind of lint
  // (a declaration where it is read) and cannot be run, only read. Growth is a line of _measures.mjs in review.
  assert.ok(
    SOURCE_SCAN_EXEMPT.length <= 9,
    `the exemption list is ${SOURCE_SCAN_EXEMPT.length}; it is meant to be a handful`,
  );
  for (const f of SOURCE_SCAN_EXEMPT)
    assert.ok(
      fs.existsSync(path.join(ROOT, TESTS_DIR, f)),
      `${f} is exempted but does not exist: take it out of the list`,
    );
  assert.deepEqual([...SOURCE_SCAN_EXEMPT].sort(), SOURCE_SCAN_EXEMPT, "in order");
});

test("the measure counts every test file that reads source, the exempt lints left out", () => {
  const { counts } = sourceScan();
  const held = SOURCE_SCAN.measure();
  assert.ok(Object.keys(counts).length > 50, "the suite's files that read source are found");
  for (const f of SOURCE_SCAN_EXEMPT) assert.ok(!(f in held), `${f} is exempt`);
  for (const [f, n] of Object.entries(held)) assert.equal(counts[f], n, f);
});
