// Run by checks/coverage-floors.test.mjs through Node's own runner, with the coverage reporter: a test that runs a
// module of the repository, so the lcov report has a file to name. Not a *.test.mjs, so the suite never globs it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { underFloors } from "../../checks/coverage.mjs";

test("the probe runs the code it names", () => {
  assert.deepEqual(underFloors([{ key: "core", label: "core", pct: 1 }], { core: 2 }), [
    { key: "core", label: "core", pct: 1, floor: 2 },
  ]);
});
