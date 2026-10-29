// Run by shared/the-suite-runs-in-one-zone.test.mjs through the launcher with TEST_SLOW_IMPORTS=1: an import a test makes
// waits as tests/shared/_slow-imports.mjs says. Not a *.test.mjs, so the suite itself never globs it.
import { test } from "node:test";
import assert from "node:assert/strict";

test("an import a test makes waits", async () => {
  const from = performance.now();
  await import("node:path");
  const took = performance.now() - from;
  assert.ok(took >= 19, `the import took ${took.toFixed(1)} ms`);
});
