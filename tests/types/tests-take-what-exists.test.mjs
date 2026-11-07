/**
 * The suite takes from the code only what the code has (decision 0112). A test is JavaScript, and a module it loads by
 * a path it builds (`await import(at("apps/…"))`, `importSrc("packages/…")`) is one no compiler follows, so a name the
 * code stops exporting failed only where a test asked for it, at load, one run of CI at a time: a rename of 5,472 names
 * on 7 Nov 2026 left 34 such takes in 9 files. This reads every take from the syntax trees, as the import graph that
 * picks CI's tests reads them (tooling/scripts/checks/test-reach.mjs, missingTakes), and holds each to the module's
 * exports: in seconds, and with nothing to compile.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { missingTakes } from "../../tooling/scripts/checks/test-reach.mjs";

const said = (m) => `${m.file}:${m.line} ${m.name === null ? "loads" : `takes ${m.name} from`} ${m.module}`;

test("every name the suite takes from the code is one the code exports, from a module that is there", () => {
  // Tracked and new files alike, so a lane's uncommitted module is read as the commit will hold it.
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  })
    .split("\n")
    .filter(Boolean);
  const read = (f) => {
    const p = path.join(ROOT, f);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  };
  assert.deepEqual(
    missingTakes({ files, read }).map(said),
    [],
    "export the name again, or take the one the module says now: a test that loads a name the code lost fails at load",
  );
});

test("a take is read however the test makes it, and held to the names the module exports as values", () => {
  const tree = {
    "packages/demo/package.json": JSON.stringify({
      name: "@chanlytics/demo",
      exports: { ".": { bundled: "./dist/index.js", import: "./src/index.ts" } },
    }),
    "packages/demo/src/index.ts": 'export { kept } from "./kept";\nexport * from "./star";\n',
    "packages/demo/src/kept.ts": "export const kept = 1;\nexport type Gone = string;\n",
    "packages/demo/src/star.ts": "export function starred() {}\n",
    "apps/edge/lib/thing.ts": "export const thing = 1;\n",
    "tests/demo/demo.test.mjs": [
      'import { kept, starred, renamed } from "@chanlytics/demo";',
      'import { Gone } from "../../packages/demo/src/kept.ts";',
      'import * as whole from "@chanlytics/demo";',
      "const at = (rel) => rel;",
      'const { thing, other } = await import(at("apps/edge/lib/thing.ts"));',
      'const { gone } = await importSrc("apps/edge/lib/nowhere.ts");',
      'const { kept: again, nope } = await importBundle("demo");',
      'const { SUBSCRIBERS } = await import("../../packages/demo/dist/index.js");',
      'const { anything } = await import("node:fs");',
      "const { viaWhole } = whole;",
      'const mod = await import(at("apps/edge/lib/thing.ts"));',
      "use(mod.thing, mod.nothing, whole.starred);",
      'assert.equal(whole.retired, undefined, "gone, and said so");',
    ].join("\n"),
  };
  const files = Object.keys(tree);
  const found = missingTakes({ files, read: (f) => tree[f] ?? "" }).map((m) => `${m.line} ${m.name}`);
  assert.deepEqual(found, [
    "1 renamed", // a static import of a package, its barrel and its star followed: kept and starred are there
    "2 Gone", // a type is no value: the test would load undefined, or fail at load
    "5 other", // a path the test builds, folded through its helper
    "6 null", // a module no file answers
    "7 nope", // a package's bundle, read as the sources it is built from
    "8 SUBSCRIBERS", // a bundle said by its path, the same
    "10 viaWhole", // destructured from a module held whole
    "12 nothing", // read off a module held whole by a dot; one asserted gone is a name the test means to miss
  ]);
});
