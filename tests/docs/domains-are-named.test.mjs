/**
 * One name for one thing in every tree (decision 0104). A person who knows a domain's name knows where to look, in every
 * tree and in the tests, and CI picks a change's tests by the folder named like a part of its path, so a name that drifts
 * also loses its tests. The list is the glossary's, "The domains": a folder directly under a backend tree's root, or under
 * tests/, is on it, or on the short list beside it of what is not a domain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "../_source.mjs";

const TREES = [
  "packages/contracts/src",
  "packages/core/src",
  "packages/db/src/repositories",
  "packages/channels/src",
  "packages/jobs/src",
  "apps/edge/lib",
  "apps/dashboard/src/server",
  "tests",
];

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\n")
  .filter(Boolean);
const foldersOf = (tree) => [
  ...new Set(
    tracked
      .filter((f) => f.startsWith(`${tree}/`) && f.slice(tree.length + 1).includes("/"))
      .map((f) => f.slice(tree.length + 1).split("/")[0]),
  ),
];

/** The names in the first column of the tables under one heading of the glossary. */
function namesUnder(text, heading) {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.ok(start >= 0, `the glossary has a heading "${heading}"`);
  const rest = text.slice(start + heading.length + 5);
  const end = rest.indexOf("\n## ");
  const section = end >= 0 ? rest.slice(0, end) : rest;
  return section
    .split("\n")
    .map((line) => /^\| `([a-z0-9-]+)`/.exec(line)?.[1])
    .filter(Boolean);
}

const glossary = fs.readFileSync(path.join(ROOT, "docs/glossary.md"), "utf8");
const listed = new Set(namesUnder(glossary, "The domains"));

test("the list reads, and the measure sees every tree", () => {
  assert.ok(listed.size >= 40, `${listed.size} names read`);
  for (const tree of TREES) assert.ok(foldersOf(tree).length > 0, `${tree} holds folders`);
  assert.deepEqual(namesUnder("\n## H\n\n| Name |\n| `a-b` | x |\n\n## Next\n\n| `c` | y |\n", "H"), ["a-b"]);
});

test("every folder of a backend tree and of the tests is on the glossary's list", () => {
  const strays = TREES.flatMap((tree) =>
    foldersOf(tree)
      .filter((f) => !listed.has(f))
      .map((f) => `${tree}/${f}/`),
  );
  assert.deepEqual(strays, [], "use the name the other trees use, or add the domain to docs/glossary.md, The domains");
});

test("every name on the list is in use", () => {
  const used = new Set(TREES.flatMap(foldersOf));
  const nested = new Set(tracked.flatMap((f) => f.split("/").slice(0, -1)));
  assert.deepEqual(
    [...listed].filter((name) => !used.has(name) && !nested.has(name)),
    [],
    "take a name no folder uses off the list",
  );
});
