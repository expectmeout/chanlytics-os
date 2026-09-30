// Run by shared/the-suite-runs-in-one-zone.test.mjs through the launcher: the zone the suite's children see. Not a *.test.mjs, so the
// suite itself never globs it.
import { test } from "node:test";
import assert from "node:assert/strict";

test("the zone the launcher set", () => {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, process.env.EXPECT_ZONE);
  assert.equal(new Date("2026-09-21T12:00:00Z").getDate(), Number(process.env.EXPECT_DAY));
});
