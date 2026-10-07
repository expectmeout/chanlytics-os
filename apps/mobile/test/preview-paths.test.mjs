/**
 * The preview workflow (.eas/workflows/preview.yml) publishes an update when something the app is made of changes,
 * and only then. Its contracts lines must name every module the app's entry into contracts reaches
 * (packages/contracts/src/mobile/phone-app.ts), or a change to one of them would never reach the preview app; and
 * nothing else of contracts, or every change to the web's contracts would publish an update again, as all of them did
 * until 28 September 2026. What the entry reaches is read from each module's syntax tree, following what runs and
 * leaving out what is only a type, which the bundle does not carry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PHONE_ENTRY = "packages/contracts/src/mobile/phone-app.ts";
const PREVIEW_WORKFLOW = "apps/mobile/.eas/workflows/preview.yml";

/** The workflow's `on.push.paths`, one per `- ` line under `paths:`, as written. */
function workflowPaths() {
  const lines = fs.readFileSync(path.join(REPO_ROOT, PREVIEW_WORKFLOW), "utf8").split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s+paths:\s*$/.test(l));
  assert.ok(at >= 0, `${PREVIEW_WORKFLOW} names no paths`);
  const list = [];
  for (const line of lines.slice(at + 1)) {
    const item = /^\s+-\s+(\S+)\s*$/.exec(line);
    if (!item) break;
    list.push(item[1]);
  }
  return list;
}

/** A paths pattern as EAS and GitHub read it: `**` crosses directories, `*` does not. */
function matcherOf(glob) {
  const literal = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const source = glob
    .split("**")
    .map((part) => part.split("*").map(literal).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${source}$`);
}

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

const paths = workflowPaths();
const matchers = paths.map((p) => ({ pattern: p, matches: matcherOf(p) }));
const covered = (file) => matchers.some((m) => m.matches.test(file));
const { modules, packages } = reached(PHONE_ENTRY);

test("the preview runs for every module the phone app's entry into contracts reaches", () => {
  assert.ok(modules.length > 1, "the entry was read, and it imports what it names");
  const missing = modules.filter((m) => !covered(m));
  assert.deepEqual(missing, [], `add each to the paths of ${PREVIEW_WORKFLOW}`);
});

test("and for no other module of contracts: the rest is the web's", () => {
  const stale = paths.filter(
    (p) => p.startsWith("packages/contracts/src/") && !modules.some((m) => matcherOf(p).test(m)),
  );
  assert.deepEqual(stale, [], `the entry reaches nothing under these; remove them from ${PREVIEW_WORKFLOW}`);
});

test("the app's own tree, the versions it is built with and the exports that name its entry are there too", () => {
  for (const file of ["apps/mobile/src/site.ts", "apps/mobile/app.config.ts", "pnpm-lock.yaml"]) {
    assert.ok(covered(file), file);
  }
  assert.ok(covered("packages/contracts/package.json"), "the exports map resolves @chanlytics/contracts/phone-app");
  assert.ok(!covered("packages/contracts/src/today/today-vm.ts"), "a module only the web runs");
  assert.ok(!covered("packages/contracts/dist/index.js"), "the web's built bundle, which the app no longer imports");
});

test("the entry reaches no package: zod came into the app with the package's root, and stays out", () => {
  assert.deepEqual(packages, []);
});
