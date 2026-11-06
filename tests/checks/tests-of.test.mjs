/**
 * A module's tests can be asked for (tooling/scripts/tests-of.mjs): the suite is grouped by domain and named for
 * what it proves, so its name does not always say. What it answers is what CI's graph answers, nearest first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { testsOf } from "../../tooling/scripts/tests-of.mjs";

const world = {
  "packages/core/src/a.ts": "export const a = 1;\n",
  "packages/core/src/b.ts": 'import { a } from "./a";\nexport const b = a;\n',
  "packages/core/src/other.ts": "export const other = 1;\n",
  "tests/core/near.test.mjs": 'import { a } from "../../packages/core/src/a.ts";\nconsole.log(a);\n',
  "tests/core/far.test.mjs": 'import { b } from "../../packages/core/src/b.ts";\nconsole.log(b);\n',
  "tests/core/apart.test.mjs": 'import { other } from "../../packages/core/src/other.ts";\nconsole.log(other);\n',
};
const asked = (file) => testsOf([file], { files: Object.keys(world), read: (f) => world[f] ?? "" });

test("a test that imports the module comes before one that reaches it through another", () => {
  const found = asked("packages/core/src/a.ts");
  assert.deepEqual(
    found.map((t) => t.test),
    ["tests/core/near.test.mjs", "tests/core/far.test.mjs"],
  );
  assert.ok(found[0].distance < found[1].distance);
});

test("a test that reaches nothing of the module is not named", () => {
  assert.deepEqual(
    asked("packages/core/src/other.ts").map((t) => t.test),
    ["tests/core/apart.test.mjs"],
  );
});

test("a module no test reaches answers nothing", () => {
  assert.deepEqual(asked("packages/core/src/nobody.ts"), []);
});
