/**
 * What a test file loads: every file of the repository it imports, and everything those import, followed to the end.
 *
 * Read from the syntax tree, never the text: an import or export's specifier, a dynamic `import()` of a literal, and,
 * in a test or a helper beside it, a string that names a module by its path from the root (`at("apps/edge/lib/pg.ts")`,
 * `importSrc(...)`) or from the file (`"../_fake-db.mjs"`). A package imported by name (`@chanlytics/core`) is its
 * source, `packages/<name>/src/index.ts`, followed like any other: its dist is built from those files in the same
 * change. The dashboard's `@/` is `apps/dashboard/src/`. A module outside the repository (node_modules) is not
 * followed.
 *
 * Used by the database gate's test (database/db-paths-changed.test.mjs), which fails a stack suite that loads a module
 * the gate does not list.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT } from "./_source.mjs";
import { parse } from "./_ast.mjs";

const MODULE = /\.(ts|tsx|mjs|js)$/;
/** A module named by its path from the root, as a test hands one to `at()`. */
const FROM_ROOT = /^(apps|packages|tooling)\/[^\s'"`]+\.(ts|tsx|mjs|js)$/;
const FROM_HERE = /^\.\.?\/[^\s'"`]+\.(ts|tsx|mjs|js)$/;

const exists = (rel) => {
  try {
    return fs.statSync(path.join(ROOT, rel)).isFile();
  } catch {
    return false;
  }
};

/** A specifier, as the file at `from` wrote it, to a repo-relative file; null when it is not the repository's. */
function resolve(from, spec) {
  const pkg = /^@chanlytics\/([a-z-]+)(\/.*)?$/.exec(spec);
  if (pkg) {
    const entry = `packages/${pkg[1]}/src/index.ts`;
    return exists(entry) ? entry : null;
  }
  let base;
  if (spec.startsWith("@/")) base = path.posix.join("apps/dashboard/src", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.posix.join(path.posix.dirname(from), spec);
  else if (FROM_ROOT.test(spec)) base = spec;
  else return null;
  const candidates = [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
  ];
  return candidates.find((c) => MODULE.test(c) && exists(c)) ?? null;
}

/** The specifiers one file names: its imports and exports, a literal `import()`, and in a script, a module's path. */
function specifiersOf(file) {
  const sf = parse(file);
  const script = /\.(mjs|js)$/.test(file);
  const out = [];
  const visit = (n) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    )
      out.push(n.moduleSpecifier.text);
    else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0])
    )
      out.push(n.arguments[0].text);
    else if (script && ts.isStringLiteralLike(n) && (FROM_ROOT.test(n.text) || FROM_HERE.test(n.text)))
      out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const followed = new Map();

/** Every repository file `file` loads, itself excluded, followed to the end. Repo-relative, forward slashes. */
export function loadedBy(file) {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    let next = followed.get(f);
    if (!next) {
      next = specifiersOf(f)
        .map((s) => resolve(f, s))
        .filter(Boolean);
      followed.set(f, next);
    }
    for (const n of next) walk(n);
  };
  walk(file);
  seen.delete(file);
  return seen;
}
