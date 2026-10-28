/**
 * docs/tree.md draws the tree, and the drawing is the tree's.
 *
 * The pages said where each concern lives, one table row at a time, and nothing drew the whole: which code trees
 * there are, and the folders each is grouped in. A drawing typed by hand is stale the day a folder moves, so this one
 * is written by a command (tooling/scripts/gen/docs-tree.mjs), into a file of its own that `land` writes again after a
 * merge (decision 0074), and a plain run fails when the file and the tree disagree. It draws names, never counts: a
 * change redraws it when a folder appears or disappears, and two branches that each add a module to the same folder
 * leave it as it was.
 *
 *   node tooling/scripts/gen/docs-tree.mjs    # redraw it
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readPage } from "../_ratchet.mjs";
import { OUT, drawnTree, treePage } from "../../gen/docs-tree.mjs";

test("the tree docs/tree.md draws is the tree the repository has", () => {
  assert.equal(readPage(OUT), treePage(), `${OUT} is stale: node tooling/scripts/gen/docs-tree.mjs`);
});

test("the drawing names each package's src and the migrations, by name and never with a count", () => {
  const tree = drawnTree();
  for (const p of ["channels", "contracts", "core", "db", "jobs"]) assert.ok(tree.includes(`packages/${p}/src/\n`), p);
  assert.ok(tree.includes("supabase/migrations/"), "the schema's migrations");
  assert.doesNotMatch(tree, /\d+ (modules|files)/, "names, never counts");
});
