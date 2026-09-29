/**
 * The licence gate CI runs over the production dependencies (checks/licences.mjs), run over lists made here: what it
 * keeps, what it refuses, and the exit a CI step reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { ROOT } from "../_source.mjs";
import { licenceKept, licenceProblems } from "../../checks/licences.mjs";

test("a permissive or weak-copyleft licence is kept, alone or as the tree writes them together", () => {
  for (const kept of [
    "MIT",
    "ISC",
    "Apache-2.0",
    "(MIT OR Apache-2.0)",
    "MIT AND Apache-2.0",
    "Apache-2.0 AND LGPL-3.0-or-later",
    "(BSD-3-Clause OR GPL-2.0)",
    "(MIT OR CC0-1.0)",
    "MPL-2.0",
    "Apache-2.0 WITH LLVM-exception",
  ])
    assert.equal(licenceKept(kept), true, kept);
});

test("GPL, AGPL, an unknown licence and a missing one are refused", () => {
  for (const refused of [
    "GPL-3.0",
    "GPL-2.0-only",
    "AGPL-3.0-or-later",
    "MIT AND GPL-3.0",
    "UNLICENSED",
    "Unknown",
    "SEE LICENSE IN LICENSE.md",
    "",
    "(MIT",
    "MIT OR",
  ])
    assert.equal(licenceKept(refused), false, JSON.stringify(refused));
});

test("each refused package is named with its version, and a copyleft one says so", () => {
  const problems = licenceProblems({
    MIT: [{ name: "fine", versions: ["1.0.0"] }],
    "AGPL-3.0": [{ name: "viral", versions: ["2.0.0", "2.1.0"] }],
    Unknown: [{ name: "mystery", versions: ["0.1.0"] }],
  });
  assert.deepEqual(problems, [
    'viral@2.0.0,2.1.0: "AGPL-3.0", a copyleft licence the product may not ship under',
    'mystery@0.1.0: "Unknown", a licence nobody has read: read it, then add it to ALLOWED in tooling/scripts/checks/licences.mjs',
  ]);
});

test("the gate exits 1 on a refused licence and 0 when every one is kept, as a CI step reads it", () => {
  const run = (list) =>
    spawnSync(process.execPath, ["tooling/scripts/checks/licences.mjs"], {
      cwd: ROOT,
      input: JSON.stringify(list),
      encoding: "utf8",
    });
  const kept = run({ MIT: [{ name: "a", versions: ["1.0.0"] }] });
  assert.equal(kept.status, 0, kept.stderr);
  assert.match(kept.stdout, /1 production packages, every one under a kept licence/);
  const refused = run({ "GPL-3.0": [{ name: "b", versions: ["1.0.0"] }] });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /b@1\.0\.0: "GPL-3\.0"/);
});
