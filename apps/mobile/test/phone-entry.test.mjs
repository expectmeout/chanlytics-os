/**
 * What the phone app bundles of contracts: the modules its entry reaches (packages/contracts/src/mobile/phone-app.ts)
 * and no package. The package's root brought zod and every export into the app's bundle until 28 September 2026. What
 * the entry reaches is read from each module's syntax tree, following what runs and leaving out what is only a type,
 * which the bundle does not carry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PHONE_ENTRY = "packages/contracts/src/mobile/phone-app.ts";

/** Whether an import or a re-export brings in nothing but types. */
function typeOnly(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    const named = clause.namedBindings;
    return !clause.name && !!named && ts.isNamedImports(named) && named.elements.every((e) => e.isTypeOnly);
  }
  if (node.isTypeOnly) return true;
  const named = node.exportClause;
  return !!named && ts.isNamedExports(named) && named.elements.every((e) => e.isTypeOnly);
}

/** A relative module specifier as the repository file it names. */
function resolveModule(from, spec) {
  const base = path.posix.join(path.posix.dirname(from), spec);
  const found = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((f) => fs.existsSync(path.join(REPO_ROOT, f)));
  assert.ok(found, `${from} imports ${spec}, which names no module`);
  return found;
}

/** Every module the entry runs, and every package it imports, followed from import to import. */
function reached(entry) {
  const modules = new Set([entry]);
  const packages = new Set();
  for (const file of modules) {
    const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const node of tree.statements) {
      if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
      if (typeOnly(node)) continue;
      const spec = node.moduleSpecifier.text;
      if (spec.startsWith(".")) modules.add(resolveModule(file, spec));
      else packages.add(`${file} imports ${spec}`);
    }
  }
  return { modules: [...modules], packages: [...packages] };
}

const { modules, packages } = reached(PHONE_ENTRY);

test("the entry reaches modules of contracts' own sources", () => {
  assert.ok(modules.length > 1, "the entry was read, and it imports what it names");
  assert.deepEqual(
    modules.filter((m) => !m.startsWith("packages/contracts/src/")),
    [],
  );
});

test("the entry reaches no package: zod came into the app with the package's root, and stays out", () => {
  assert.deepEqual(packages, []);
});
