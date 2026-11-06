/**
 * Campaigns draws the kit's parts by importing them (the Campaigns review of 4 Oct 2026, finding 19).
 *
 * `legacy-parts.ts` draws a part the shell publishes on `window`, and draws NOTHING where the frame did not publish it: a
 * Confirm that draws nothing leaves the Send foot with no act to press, a StatePill leaves a row with no state, a
 * UnsavedAsk lets Cancel close over words nobody was asked about. That works while Campaigns is inside the shell, and
 * stops the day it leaves, as Leads and Setup did. Inbox and People import `kit/confirm`, `kit/pill/state-pill` and the
 * rest by their paths; Campaigns does now. This holds it so, by the syntax tree (nothing here reads a file to search it).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { repoFiles, parse } from "../_ast.mjs";

const TREE = "apps/dashboard/src/surfaces/campaigns";

/** Every import and export-from in a file, with the module it names and whether it carries a value. */
function importsOf(file) {
  const out = [];
  for (const s of parse(file).statements) {
    if (!(ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) || !s.moduleSpecifier) continue;
    const typeOnly = ts.isImportDeclaration(s)
      ? !!s.importClause?.isTypeOnly ||
        (!!s.importClause?.namedBindings &&
          ts.isNamedImports(s.importClause.namedBindings) &&
          !s.importClause.name &&
          s.importClause.namedBindings.elements.every((e) => e.isTypeOnly))
      : !!s.isTypeOnly;
    out.push({ from: s.moduleSpecifier.text, typeOnly });
  }
  return out;
}

test("no file in Campaigns imports legacy-parts: a door there draws nothing where the frame did not publish its part", () => {
  const files = repoFiles([TREE]);
  assert.ok(files.length > 50, `the Campaigns tree is read: ${files.length} files`);
  const doors = files.filter((f) => importsOf(f).some((i) => /(^|\/)legacy-parts$/.test(i.from)));
  assert.deepEqual(doors, [], "import the kit's own part by its path (kit/confirm/confirm, kit/pill/state-pill, ...)");
});

test("Campaigns takes its kit values by path, never through the kit's barrel: a page that reads one component loads them all", () => {
  const barrel = repoFiles([TREE]).filter((f) =>
    importsOf(f).some((i) => !i.typeOnly && /(^|\/)kit(\/index)?$/.test(i.from)),
  );
  assert.deepEqual(barrel, []);
});
