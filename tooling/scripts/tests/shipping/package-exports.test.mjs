/**
 * The packages' pass of the dead-export check (checks/dead-exports.mjs), on modules written for it.
 *
 * knip enters each package at its barrel, and the barrels name every export, so to knip a package's public value is
 * used whether or not anything imports it: 153 were not on 29 September, and seven were read nowhere at all (defect
 * 36). The pass reads a public value as dead when no module but its own mentions it, the barrels aside.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { bundleExports, unimportedExports } from "../_ast.mjs";

const sf = (file, text) => ({ file, sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) });

const words = sf(
  "packages/p/src/words.ts",
  `export const USED = 1;
   export const ONLY_HERE = 2;
   export const NOWHERE = 3;
   export function readByString() {}
   export const NOT_PUBLIC = 4;
   export type Shape = { a: 1 };
   const local = ONLY_HERE + 1;`,
);
const app = sf("apps/x/page.ts", `import { USED } from "@p/p"; const m = mod["readByString"];`);
const test_ = sf("tooling/scripts/tests/p.test.mjs", `// NOWHERE is only named in a comment`);

test("a public value no other module mentions is dead; one read anywhere else is not", () => {
  const publicNames = new Set(["USED", "ONLY_HERE", "NOWHERE", "readByString"]);
  assert.deepEqual(unimportedExports([words], publicNames, [words, app, test_]), {
    "packages/p/src/words.ts": ["ONLY_HERE", "NOWHERE"],
  });
});

test("a value the barrel does not make public is knip's to see, not the pass's", () => {
  assert.deepEqual(unimportedExports([words], new Set(["USED"]), [words, app]), {});
});

test("the public names are the bundle's own export clause", () => {
  const bundle = sf(
    "packages/p/dist/index.js",
    `import { z } from "zod";
     export { z as zed } from "zod";
     const a = 1, b = 2;
     export { a, b as bee };`,
  );
  assert.deepEqual([...bundleExports(bundle.sf)].sort(), ["a", "bee"]);
});
