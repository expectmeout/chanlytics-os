/**
 * Ask's Line stays a chunk of its own (the loadability review, 19 Oct 2026): about 70 KB, compressed, that every first load
 * would parse before any page could draw. It left the shell as TSX under surfaces/ask/ (decision 0015, step 12), where
 * one import of a part by the frame would carry it back in without anything failing, so the static imports are walked here
 * from the frame's own entry: the graph a bundler reads, never the words of a file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT } from "../_source.mjs";
import { parse } from "../_ast.mjs";

const SRC = "apps/dashboard/src";
const FRAME_ENTRY = `${SRC}/bridge/FrameApp.tsx`;
const THE_LINE = `${SRC}/surfaces/ask/`;

/** The file a specifier of the dashboard's names, or null for a package. */
function fileOf(from, spec) {
  const at = spec.startsWith("@/")
    ? path.posix.join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? path.posix.join(path.posix.dirname(from), spec)
      : null;
  if (!at) return null;
  const candidates = [at, `${at}.ts`, `${at}.tsx`, `${at}/index.ts`, `${at}/index.tsx`];
  return candidates.find((f) => /\.tsx?$/.test(f) && fs.existsSync(path.join(ROOT, f))) ?? null;
}

/** Whether an import brings a value: `import type`, and named imports that are all `type`, bring nothing to a bundle. */
const bringsCode = (s) => {
  const clause = s.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  const named = clause.namedBindings;
  return !!clause.name || !named || !ts.isNamedImports(named) || named.elements.some((e) => !e.isTypeOnly);
};

/** What a module loads as it loads: its top-level imports and re-exports of code, never a dynamic import. */
function staticImports(file) {
  return parse(file)
    .statements.filter((s) =>
      ts.isImportDeclaration(s) ? bringsCode(s) : ts.isExportDeclaration(s) && !s.isTypeOnly && !!s.moduleSpecifier,
    )
    .map((s) => fileOf(file, s.moduleSpecifier.text))
    .filter(Boolean);
}

/** Every module the entry loads as it loads, with one way each was reached. */
function reachedFrom(entry) {
  const via = new Map([[entry, null]]);
  const walk = [entry];
  while (walk.length) {
    const file = walk.pop();
    for (const next of staticImports(file)) {
      if (via.has(next)) continue;
      via.set(next, file);
      walk.push(next);
    }
  }
  return via;
}

/** The dynamic imports a module makes: what it fetches when it asks. */
function dynamicImports(file) {
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      found.push(fileOf(file, node.arguments[0].text));
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return found;
}

test("the frame reaches none of the Line as it loads: its entry's static imports stop short of surfaces/ask", () => {
  const via = reachedFrom(FRAME_ENTRY);
  assert.ok(via.size > 100, `the walk reads the frame (${via.size} modules)`);
  assert.ok(via.has(`${SRC}/bridge/ask/line.tsx`), "the door to the Line is the frame's");
  const inFrame = [...via.keys()].filter((f) => f.startsWith(THE_LINE));
  assert.deepEqual(
    inFrame.map((f) => `${f}, by ${via.get(f)}`),
    [],
    "a part of the Line in the frame",
  );
});

test("the Line's door fetches it, and the face the frame draws is the kit's", () => {
  assert.ok(
    dynamicImports(`${SRC}/bridge/ask/line.tsx`).includes(`${THE_LINE}line/line.tsx`),
    "the chunk is asked for when the frame is idle or the Line is opened",
  );
  assert.ok(
    reachedFrom(FRAME_ENTRY).has(`${SRC}/surfaces/kit/face/ask-face.tsx`),
    "the top bar's face and the phone's ✦ are drawn at first paint",
  );
});

test("the walk sees a static import and passes over a type and a dynamic one, so the first test can fail", () => {
  assert.ok(
    staticImports(`${SRC}/surfaces/ask/card.tsx`).includes(`${THE_LINE}card-parts.tsx`),
    "a value imported is walked",
  );
  assert.ok(
    !staticImports(`${SRC}/surfaces/ask/card.tsx`).includes(`${SRC}/bridge/ask.ts`),
    "a type imported brings nothing to a bundle",
  );
  assert.ok(
    !staticImports(`${SRC}/bridge/ask/line.tsx`).includes(`${THE_LINE}line/line.tsx`),
    "a dynamic import is the chunk's own",
  );
});
