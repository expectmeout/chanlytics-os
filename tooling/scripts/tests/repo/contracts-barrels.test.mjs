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
 * And the tree's own shape: the root holds the plumbing only, and every other module is in a domain folder with a
 * barrel. A plain invariant, so no baseline (docs/debt.md names the numbers; this holds a shape). That a domain is a
 * folder of two modules or more is every tree's rule, not contracts' alone, and is held at the very end.
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
 *
 * And every tree's rule: a domain earns a folder at its second module (CLAUDE.md, "Where new code goes"). Until then
 * it is one module at its tree's root, beside the plumbing, named for the domain (`apps/edge/lib/notes.ts`, not
 * `apps/edge/lib/notes/suggest.ts`); a folder of one module is a directory to open for one file, and a name said
 * twice. The trees are the ones the code is grouped by domain in: each package's `src`, `apps/dashboard/src/server`,
 * `apps/edge/lib`, `tooling/scripts` and `apps/mobile/src`. A domain is a folder directly under a tree's root, and its
 * modules are the `.ts`, `.tsx` and `.mjs` files at any depth in it but `index.ts`, a barrel; a folder of data and no
 * module (`tooling/scripts/fixtures`) is not a domain. Not the URL trees, where a folder is a path and a one-file
 * folder is a route: `apps/dashboard/app`, `apps/edge/api`, and the phone app's `src/app` (Expo Router's), which sits
 * in its `src` and is passed over there. In contracts, whose root is its plumbing, a lone module joins the domain it
 * belongs with. A plain rule too, so no baseline: an exception is a folder of one module that a program in flight
 * owns, listed with the day it was granted and the program it waits on, and it leaves in the change that ends it (the
 * last test fails one that no longer excepts anything). The paths are `git ls-files`: this part reads no file.
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

test("the root holds the plumbing only, and every other module is in a domain folder with a barrel", () => {
  const domains = new Set(folders);
  const stray = [];
  for (const f of files) {
    const folder = folderOf(f);
    if (folder === "") {
      if (!PLUMBING.test(path.posix.basename(f))) stray.push(f);
    } else {
      assert.ok(
        domains.has(folder.split("/")[0]),
        `${f} is in a domain folder with an index.ts: a domain has a barrel`,
      );
    }
  }
  assert.deepEqual(stray, [], `a module lives in its domain's folder; the root holds ${PLUMBING} only`);
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

/* ---- Every tree's domain folders ---- */

/** The app and tooling trees a domain folder is held in; each package's `src` is a tree too. */
const TREES = ["apps/dashboard/src/server", "apps/edge/lib", "tooling/scripts", "apps/mobile/src"];
const PACKAGE_SRC = /^packages\/[^/]+\/src(?=\/)/;

/** The routers' roots: a folder in one is a URL path, never a domain. Only the phone app's is inside a tree. */
const URL_TREES = ["apps/dashboard/app", "apps/edge/api", "apps/mobile/src/app"];

/** The exceptions: a folder of one module that a program in flight owns, the day it was granted, what it waits on. */
const EXCEPTIONS = {
  "tooling/scripts/evals": {
    since: "28 September 2026",
    waitsOn: "Ask Rewired and Reach out",
    why:
      "Reach out's live eval of a reply's reading (reply-intents.mjs, #1197) has a folder of its own because " +
      "tooling/scripts is at its cap (baselines/tree-shape.json). The root's eval-*.mjs join it when tooling/scripts " +
      "is grouped by job (docs/debt.md, directories over 20 modules), a move that waits on Ask Rewired, whose " +
      "eval-ask*.mjs are three of them, and Reach out closing.",
  },
};

/** Every module in the trees, generated ones included: all but what is built or installed. */
const treeModules = repoFiles(["packages", ...TREES], {
  keep: /\.(ts|tsx|mjs)$/,
  drop: /(^|\/)(dist|node_modules|\.next)\//,
});

/** The tree a module is in: its package's `src`, or the app or tooling tree it starts with. */
const treeOf = (f) => PACKAGE_SRC.exec(f)?.[0] ?? TREES.find((t) => f.startsWith(`${t}/`));

/** Each folder directly under a tree's root, but a URL tree's, with the modules it holds at any depth. */
function domainFolders() {
  const held = new Map();
  for (const f of treeModules) {
    const tree = treeOf(f);
    const rest = tree ? f.slice(tree.length + 1) : "";
    if (!rest.includes("/")) continue; // outside the trees, or at a root: the plumbing and the one-module domains
    const folder = `${tree}/${rest.split("/")[0]}`;
    if (URL_TREES.includes(folder)) continue;
    const modules = held.get(folder) ?? [];
    if (!isBarrel(f)) modules.push(f);
    held.set(folder, modules);
  }
  return held;
}

/** Where a folder's one module goes: to its tree's root, named for the domain; in contracts, to the domain it joins. */
function fixFor(folder, module) {
  const tree = path.posix.dirname(folder);
  if (tree === SRC) return `put ${module} in the domain it belongs with (${SRC}'s root holds its plumbing only)`;
  return `move ${module} to ${folder}${path.posix.extname(module)}`;
}

test("the measure sees every tree a domain folder is held in, and the folders in each", () => {
  const trees = new Set(treeModules.map(treeOf));
  for (const p of packageNames) assert.ok(trees.has(`packages/${p}/src`), `packages/${p}/src is read`);
  for (const t of TREES) assert.ok(trees.has(t), `${t} is read`);
  const folders = domainFolders();
  assert.ok(folders.size >= 50, `the folders directly under the trees' roots were found (${folders.size})`);
  assert.ok(
    treeModules.some((f) => f.startsWith("apps/mobile/src/app/")),
    "the phone app's routes are where URL_TREES passes over them",
  );
});

test("a domain earns a folder at its second module: no folder directly under a tree's root holds just one", () => {
  const thin = [...domainFolders()]
    .filter(([folder, modules]) => modules.length === 1 && !(folder in EXCEPTIONS))
    .map(([folder, [module]]) => `${folder}/ holds one module: ${fixFor(folder, module)}`);
  assert.deepEqual(
    thin,
    [],
    "a one-module domain sits at its tree's root, beside the plumbing, until its second module earns it a folder",
  );
});

test("each exception is dated, names the program it waits on, and still excepts a folder of one module", () => {
  const folders = domainFolders();
  for (const [folder, { since, waitsOn }] of Object.entries(EXCEPTIONS)) {
    assert.match(since, /^\d{1,2} [A-Z][a-z]+ \d{4}$/, `${folder}: the day its exception was granted`);
    assert.ok(waitsOn, `${folder}: the program its exception waits on`);
    const n = folders.get(folder)?.length ?? 0;
    assert.equal(n, 1, `${folder} holds ${n} modules now: its exception has ended, so take it out of EXCEPTIONS`);
  }
});
