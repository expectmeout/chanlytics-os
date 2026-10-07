/**
 * docs/architecture.md draws the tree, and the drawing is the tree's.
 *
 * The pages said where each concern lives, one table row at a time, and nothing drew the whole: which code trees
 * there are, and the folders each is grouped in. A drawing typed by hand is stale the day a folder moves, so this one
 * is written the way the register's numbers are (debt-register.test.mjs): the command that banks a ratchet redraws
 * the block between the page's tree markers, from `drawnTree` in _measures.mjs, and a plain run fails when the block
 * and the tree disagree. It draws names, never counts: a change redraws it when a folder appears or disappears, and
 * two branches that each add a module to the same folder leave it as it was.
 *
 *   UPDATE_BASELINES=1 corepack pnpm test                                        # banks, and redraws the tree
 *   UPDATE_BASELINES=1 node --test tooling/scripts/tests/docs/docs-tree.test.mjs  # redraws the tree alone
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BANK, BANK_HINT, blockIn, writeBlock } from "../_ratchet.mjs";
import { drawnTree } from "../_measures.mjs";

const PAGE = "docs/architecture.md";
const MARKERS = ["<!-- tree:start -->", "<!-- tree:end -->"];
const ALONE = "UPDATE_BASELINES=1 node --test tooling/scripts/tests/docs/docs-tree.test.mjs";

if (BANK) writeBlock(PAGE, MARKERS, drawnTree());

test("the tree docs/architecture.md draws is the tree the repository has", () => {
  const block = blockIn(PAGE, MARKERS);
  assert.ok(block !== null, `${PAGE} has no drawn tree (${MARKERS.join(" … ")}): put the markers back, then redraw`);
  assert.equal(block, drawnTree(), `${PAGE}'s tree is stale — redraw it: ${BANK_HINT}, or this file alone: ${ALONE}`);
});
