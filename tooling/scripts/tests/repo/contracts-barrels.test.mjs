/**
 * Contracts is grouped by domain behind curated barrels
 * (docs/plans/2026-09-26-organization-and-code-health.md, §2: "every barrel names what it exports").
 *
 * Three things hold that shape, measured on the syntax tree and never the text:
 *
 *   1. the root index is `import "./zod-config"` first (zod-config.ts says why the order matters), then one
 *      `export * from "./<domain>"` per domain folder: each folder once, and every folder;
 *   2. a domain's index.ts only names what it exports — `export { a } from "./x"` and `export type { T } from "./x"` —
 *      never `export *`, never a declaration of its own, so a new export is a visible line in a review;
 *   3. a module imports another by its module path (`../people/person-name`), never through a barrel (`../people`,
 *      `./index`): a barrel import inside the package is a cycle waiting to happen, and contracts-import-cycles.test.mjs
 *      would only see it once the initializer it hands `undefined` to is built.
 *
 * And the tree's own rule: a domain is a folder of two modules or more, and the root holds the plumbing only.
 * A plain invariant, so no baseline (docs/debt.md names the numbers; this holds a shape).
 *
 * The same rule for every package, at the end: a barrel (`packages/<p>/src/index.ts`, and the `index.ts` of a folder
 * under it) re-exports by name, so a new export is a line in a review and a name a module stops exporting is a build
 * error at the barrel, not a quiet change to the package's surface. The one `export *` a barrel may write is a
 * package root's re-export of a domain folder whose own barrel names its exports (contracts' and core's roots).
 *
 * And a module that is not called index.ts is held the same, since a module that re-exports its neighbours acts as a
 * barrel whatever its name (the plan's "no export * outside a domain barrel"): `export *` appears nowhere in a
 * package's or an app's source but at those roots, and in the edge's stand-in for each package
 * (`apps/edge/lib/packages/<p>.ts`, the package's built entry under a relative path). A module names what is read
 * through it, and nothing else.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { repoFiles, parse } from "../_ast.mjs";

const SRC = "packages/contracts/src";
const ROOT_INDEX = `${SRC}/index.ts`;
const FIRST = "./zod-config";
/** What may sit at the root beside the index: the zod setting that must run first, and what a generator writes. */
const PLUMBING = /^(index|zod-config|[a-z0-9-]+\.generated)\.ts$/;

// The generated closed sets are a module the barrels name, so they stay in the set here.
const files = repoFiles([SRC], { drop: /(^|\/)(dist|node_modules)\// });
const has = new Set(files);
const isBarrel = (f) => path.posix.basename(f) === "index.ts";
const domainBarrels = files.filter((f) => isBarrel(f) && f !== ROOT_INDEX);
const folderOf = (f) => path.posix.relative(SRC, path.posix.dirname(f));
const folders = domainBarrels.map(folderOf).sort();

/** A relative specifier as the bundle reads it: the target's repo path without its extension. */
const resolve = (from, spec) =>
  path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)).replace(/\.(js|ts)$/, "");

/** Every import or re-export of one file that names a path (not a package), with its statement. */
const relativeEdges = (sf) =>
  sf.statements
    .filter(
      (s) =>
        (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) &&
        s.moduleSpecifier &&
        ts.isStringLiteral(s.moduleSpecifier) &&
        s.moduleSpecifier.text.startsWith("."),
    )
    .map((s) => ({ spec: s.moduleSpecifier.text, statement: s }));

test("the measure sees the package: its modules, its folders, its root index", () => {
  assert.ok(files.length > 100, `read ${SRC} (${files.length} files)`);
  assert.ok(has.has(ROOT_INDEX), "the root index exists");
  assert.ok(folders.length >= 10, `the domain folders were found (${folders.length})`);
});

test("the root index is zod-config first, then one export * per domain folder", () => {
  const st = parse(ROOT_INDEX).statements;
  const first = st[0];
  assert.ok(
    first && ts.isImportDeclaration(first) && !first.importClause && first.moduleSpecifier.text === FIRST,
    `the first statement of ${ROOT_INDEX} is import "${FIRST}": zod-config.ts says why it runs before any schema is built`,
  );
  const exported = [];
  for (const s of st.slice(1)) {
    assert.ok(
      ts.isExportDeclaration(s) && !s.exportClause && !s.isTypeOnly && s.moduleSpecifier,
      `${ROOT_INDEX} holds only export * lines after the first import; found: ${s.getText()}`,
    );
    const spec = s.moduleSpecifier.text;
    const m = /^\.\/([a-z0-9-]+)$/.exec(spec);
    assert.ok(
      m && has.has(`${SRC}/${m[1]}/index.ts`),
      `${ROOT_INDEX} re-exports a domain folder, not a module: ${spec}`,
    );
    exported.push(m[1]);
  }
  assert.deepEqual(
    [...exported].sort(),
    folders,
    "every domain folder is re-exported by the root index exactly once — a folder left out is a domain the package does not export",
  );
});

test("a domain barrel only names what it exports", () => {
  for (const f of domainBarrels) {
    const st = parse(f).statements;
    assert.ok(st.length > 0, `${f} names its exports`);
    for (const s of st) {
      const named =
        ts.isExportDeclaration(s) &&
        s.moduleSpecifier &&
        s.exportClause &&
        ts.isNamedExports(s.exportClause) &&
        s.exportClause.elements.length > 0;
      assert.ok(
        named,
        `${f}: a domain barrel is named re-exports only (export { a } from "./x", export type { T } from "./x"), never export * and never a declaration; found: ${s.getText().slice(0, 80)}`,
      );
    }
  }
});

test("a module imports another by its module path, never through a barrel", () => {
  const bad = [];
  for (const f of files) {
    if (f === ROOT_INDEX) continue;
    for (const { spec } of relativeEdges(parse(f))) {
      const target = resolve(f, spec);
      if (path.posix.basename(target) === "index" || has.has(`${target}/index.ts`)) bad.push(`${f}: "${spec}"`);
      else if (!has.has(`${target}.ts`)) bad.push(`${f}: "${spec}" resolves to nothing`);
    }
  }
  assert.deepEqual(
    bad,
    [],
    "import the module itself (../people/person-name), not its folder or index: a barrel import inside the package is a cycle waiting to happen",
  );
});

test("a domain is a folder of two modules or more, and the root holds the plumbing only", () => {
  const perFolder = new Map(folders.map((d) => [d, 0]));
  const stray = [];
  for (const f of files) {
    const folder = folderOf(f);
    if (folder === "") {
      if (!PLUMBING.test(path.posix.basename(f))) stray.push(f);
    } else if (folder.includes("/")) {
      const top = folder.split("/")[0];
      assert.ok(perFolder.has(top), `${f} is under a domain folder that has an index.ts`);
    } else {
      assert.ok(perFolder.has(folder), `${f} is in a folder with an index.ts: a domain has a barrel`);
      if (!isBarrel(f)) perFolder.set(folder, perFolder.get(folder) + 1);
    }
  }
  assert.deepEqual(stray, [], `a module lives in its domain's folder; the root holds ${PLUMBING} only`);
  const thin = [...perFolder].filter(([, n]) => n < 2).map(([d, n]) => `${d} (${n})`);
  assert.deepEqual(thin, [], "a folder of one module is not a domain: put the module with its neighbours");
});

/* ---- Every package's barrels ---- */

const packageFiles = repoFiles(["packages"], { drop: /(^|\/)(dist|node_modules)\// });
const inPackages = new Set(packageFiles);
const isPackageRoot = (f) => /^packages\/[^/]+\/src\/index\.ts$/.test(f);
const packageBarrels = packageFiles.filter((f) => /^packages\/[^/]+\/src\/(.+\/)?index\.ts$/.test(f));
const packageNames = packageBarrels.filter(isPackageRoot).map((f) => f.split("/")[1]);

/** Whether `spec`, re-exported by the barrel `from`, is a folder beside it with a barrel of its own. */
const isDomainFolder = (from, spec) => {
  const m = /^\.\/([a-z0-9-]+)$/.exec(spec);
  return Boolean(m && inPackages.has(`${path.posix.dirname(from)}/${m[1]}/index.ts`));
};

test("the measure sees every package's barrels", () => {
  for (const p of ["channels", "contracts", "core", "db", "jobs"])
    assert.ok(packageNames.includes(p), `${p}'s src/index.ts was found`);
  assert.ok(
    packageBarrels.length > packageNames.length,
    `the domain barrels were found too (${packageBarrels.length})`,
  );
});

test("a package barrel names what it re-exports; its one export * is a root's re-export of a domain folder", () => {
  const bad = [];
  for (const f of packageBarrels) {
    for (const s of parse(f).statements) {
      if (!ts.isExportDeclaration(s) || !s.moduleSpecifier) continue;
      const spec = s.moduleSpecifier.text;
      if (!s.exportClause) {
        if (!(isPackageRoot(f) && isDomainFolder(f, spec))) bad.push(`${f}: export * from "${spec}"`);
      } else if (ts.isNamespaceExport(s.exportClause)) {
        bad.push(`${f}: export * as ${s.exportClause.name.text} from "${spec}" (a namespace hides its names too)`);
      } else if (s.exportClause.elements.length === 0) {
        bad.push(`${f}: an export {} from "${spec}" that names nothing`);
      }
    }
  }
  assert.deepEqual(
    bad,
    [],
    'name each export (export { a } from "./x", export type { T } from "./x"): an export * adds whatever the module ' +
      "exports next to the package's surface, unseen. A root may re-export a domain folder whose own index names its exports.",
  );
});

/* ---- Every module, barrel or not ---- */

/** Every package's and app's source, generated modules included: all but what is built, installed or served as is. */
const everySource = repoFiles(["apps", "packages"], {
  drop: /(^|\/)(dist|node_modules|\.next)\/|^apps\/[^/]+\/public\//,
}).filter((f) => f.startsWith("apps/") || /^packages\/[^/]+\/src\//.test(f));

/**
 * The edge's stand-in for a package, `apps/edge/lib/packages/<p>.ts`, re-exports that package's built entry whole:
 * the edge imports a package by relative path because Vercel's function bundler does not follow pnpm's workspace
 * links (db.ts says so; docs/debt.md, "Committed dist"). It is the package itself under another path, and the
 * package's own barrels name every export, so it is the one other `export *` there is.
 */
const PACKAGE_STAND_IN = /^apps\/edge\/lib\/packages\/([a-z0-9-]+)\.ts$/;
const isPackageStandIn = (f, spec) => {
  const m = PACKAGE_STAND_IN.exec(f);
  return Boolean(
    m && spec === `../../../../packages/${m[1]}/dist/index.js` && inPackages.has(`packages/${m[1]}/src/index.ts`),
  );
};

test("the measure sees every package's and app's source, the shell and the phone app included", () => {
  for (const tree of ["apps/dashboard/src/legacy/", "apps/dashboard/app/", "apps/edge/api/", "apps/mobile/"])
    assert.ok(
      everySource.some((f) => f.startsWith(tree)),
      `${tree} is read`,
    );
  assert.ok(
    everySource.includes(ROOT_INDEX) && everySource.includes("packages/core/src/index.ts"),
    "the roots are read",
  );
  for (const p of packageNames)
    assert.ok(everySource.includes(`apps/edge/lib/packages/${p}.ts`), `the edge's stand-in for ${p} is read`);
});

test("export * is written nowhere in a package's or an app's source but a root's for a domain folder and the edge's for a package", () => {
  const bad = [];
  for (const f of everySource) {
    for (const s of parse(f).statements) {
      if (!ts.isExportDeclaration(s) || !s.moduleSpecifier) continue;
      if (s.exportClause && !ts.isNamespaceExport(s.exportClause)) continue;
      const spec = s.moduleSpecifier.text;
      if (!s.exportClause && isPackageRoot(f) && isDomainFolder(f, spec)) continue;
      if (!s.exportClause && isPackageStandIn(f, spec)) continue;
      bad.push(`${f}: ${s.exportClause ? `export * as ${s.exportClause.name.text}` : "export *"} from "${spec}"`);
    }
  }
  assert.deepEqual(
    bad,
    [],
    "a module that re-exports another is a barrel whatever its name: name what is read through it " +
      '(export { a } from "./x", export type { T } from "./x"), and leave out what nobody reads there.',
  );
});
