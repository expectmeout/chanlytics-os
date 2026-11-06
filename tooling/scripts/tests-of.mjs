#!/usr/bin/env node
/**
 * Which tests prove a module. The suite is grouped by domain and its files are named for what they prove, so a module's
 * tests cannot always be found by its name; they can be asked for. This walks the import graph CI picks a change's tests
 * by (test-reach.mjs), and answers nearest first: a test that imports the module, then one that reaches it through
 * another.
 *
 *   node tooling/scripts/tests-of.mjs packages/core/src/deliver/deliver.ts
 *
 * Exits 1 when a path is not a tracked file, so a typo does not read as a module nothing tests.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { reachOf } from "./checks/test-reach.mjs";

/** The tests that reach `asked`, nearest first, then by name. */
export function testsOf(asked, { files, read }) {
  const reached = reachOf({ files, read }).testsReaching(asked);
  return [...reached]
    .sort(([a, d], [b, e]) => d - e || (a < b ? -1 : 1))
    .map(([test, distance]) => ({ test, distance }));
}

function main() {
  const asked = process.argv.slice(2).map((f) => f.replace(/\\/g, "/"));
  if (!asked.length) {
    console.error("usage: node tooling/scripts/tests-of.mjs <file> [<file> ...]");
    process.exit(2);
  }
  const files = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\n")
    .filter(Boolean);
  const known = new Set(files);
  const strays = asked.filter((f) => !known.has(f));
  if (strays.length) {
    console.error(`not a tracked file: ${strays.join(", ")}`);
    process.exit(1);
  }
  const found = testsOf(asked, { files, read: (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "") });
  for (const { test, distance } of found) console.log(`${String(distance).padStart(2)}  ${test}`);
  console.log(
    found.length ? `${found.length} tests reach it; the number is how many imports away.` : "No test reaches it.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
