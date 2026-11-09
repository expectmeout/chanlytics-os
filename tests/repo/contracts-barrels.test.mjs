/**
 * How the code is grouped, four rules, each a section below in this order: contracts is grouped by domain behind
 * curated barrels; every package's barrels name what they re-export; `export *` is written nowhere but where a package
 * root re-exports a domain folder or the edge stands in for a package; and in every tree the code is grouped by
 * domain in, a domain earns a folder at its second module. Each is measured on the syntax tree or the list of paths,
 * never the text. The file keeps its first rule's name, the path the docs and the packages' barrels cite it by.
 *
 * Contracts (docs/plans/2026-09-26-organization-and-code-health.md, §2: "every barrel names what it exports"). Three
 * things hold its shape:
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
 * folder of two modules or more is every tree's rule, not contracts' alone, and is held in the last section.
 *
 * Every package's barrels: a barrel (`packages/<p>/src/index.ts`, and the `index.ts` of a folder under it) re-exports
 * by name, so a new export is a line in a review and a name a module stops exporting is a build error at the barrel,
 * not a quiet change to the package's surface. The one `export *` a barrel may write is a package root's re-export of
 * a domain folder whose own barrel names its exports (contracts' and core's roots).
 *
 * `export *` nowhere else: a module that is not called index.ts is held the same, since a module that re-exports its
 * neighbours acts as a barrel whatever its name (the plan's "no export * outside a domain barrel"): `export *`
 * appears nowhere in a package's or an app's source but at those roots. A module names what is read through it, and
 * nothing else.
 *
 * Every tree's domain folders (decision 0104). A backend tree's root (each package's `src`, `apps/dashboard/src/server`,
 * `apps/edge/lib`) holds its folders and its package's entries, nothing else, so a listing of a root is a list of domains,
 * and what every domain uses is in its `shared/`. Every repository is under `packages/db/src/repositories/<domain>/`. In
 * `tooling/scripts` and `apps/mobile/src` a domain still earns a folder at its second module: until then it is one module
 * at the root, named for the domain, since a folder of one module there is a directory to open for one file. A domain is a
 * folder directly under a tree's root, and its modules are the ones in it at any depth but `index.ts`, a barrel. A module
 * is what the tree-shape ratchet counts as one (`repoFiles`' own set: `.ts`, `.tsx`, `.js`, `.jsx` and `.mjs`, less `.d.ts`,
 * generated files and what is built); a folder of data and no module (`tooling/scripts/fixtures`) is not a domain. Not the
 * URL trees, where a folder is a path and a one-file folder is a route: `apps/dashboard/app`, `apps/edge/api`, and
 * `apps/mobile/src/app` (Expo Router's root), which sits inside `apps/mobile/src` and is passed over there. A plain rule,
 * so no baseline: an exception is a folder of one module that a program in flight owns, listed with the day it was granted,
 * the program it waits on and why, and it leaves in the change that ends it (the last test fails one that no longer
 * excepts anything). The paths are `git ls-files`: this part reads no file.
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
// The package's entries are plumbing too: the index, the browser's (generated), the classic schemas a page asks for
// by import() (write-rules.ts; decision 0024), and what one pane alone draws with, kept off the route every page loads
// (alert-pane.ts; decision 0040).
const PLUMBING = /^(index|write-rules|alert-pane|zod-config|[a-z0-9-]+\.generated)\.ts$/;

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
    const m = /^\.\/([a-z0-9-]+(?:\/[a-z0-9-]+)?)$/.exec(spec);
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
      // A domain, or a product nested under one with no code of its own (campaigns/broadcasts).
      const [top, second] = folder.split("/");
      assert.ok(
        domains.has(top) || domains.has(`${top}/${second}`),
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
  const m = /^\.\/([a-z0-9-]+(?:\/[a-z0-9-]+)?)$/.exec(spec);
  return Boolean(m && inPackages.has(`${path.posix.dirname(from)}/${m[1]}/index.ts`));
};

test("the measure sees every package's barrels", () => {
  for (const p of ["contracts", "core", "jobs"]) assert.ok(packageNames.includes(p), `${p}'s src/index.ts was found`);
  // db and channels have no root: each domain's barrel is an entry (decision 0110).
  for (const barrel of ["packages/channels/src/ai/index.ts", "packages/db/src/repositories/ai/index.ts"])
    assert.ok(packageBarrels.includes(barrel), `${barrel} was found`);
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

test("the measure sees every package's and app's source, the shell and the phone app included", () => {
  for (const tree of ["apps/dashboard/mockup/", "apps/dashboard/app/", "apps/edge/api/", "apps/mobile/"])
    assert.ok(
      everySource.some((f) => f.startsWith(tree)),
      `${tree} is read`,
    );
  assert.ok(
    everySource.includes(ROOT_INDEX) && everySource.includes("packages/core/src/index.ts"),
    "the roots are read",
  );
});

test("export * is written nowhere in a package's or an app's source but a root's for a domain folder", () => {
  const bad = [];
  for (const f of everySource) {
    for (const s of parse(f).statements) {
      if (!ts.isExportDeclaration(s) || !s.moduleSpecifier) continue;
      if (s.exportClause && !ts.isNamespaceExport(s.exportClause)) continue;
      const spec = s.moduleSpecifier.text;
      if (!s.exportClause && isPackageRoot(f) && isDomainFolder(f, spec)) continue;
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

/** The backend's app trees, where a root is a table of contents; each package's `src` is one too. */
const BACKEND_TREES = ["apps/dashboard/src/server", "apps/edge/lib"];
const PACKAGE_SRC = /^packages\/[^/]+\/src(?=\/)/;
/**
 * What a backend root holds beside its folders. Contracts' own is PLUMBING, above. db's `./types` entry is types.ts, the
 * generated database.types.ts read through the closed sets (decision 0112), with the type test that proves it beside it.
 */
const ROOT_ENTRIES = {
  "packages/db/src": ["realtime.ts", "database.types.ts", "types.ts", "types.type-test.ts"],
  "packages/log/src": ["index.ts", "logger.ts", "redact.ts", "request.ts"],
};
const isRootEntry = (tree, name) =>
  tree === SRC
    ? PLUMBING.test(name)
    : (ROOT_ENTRIES[tree] ?? (tree.startsWith("packages/") ? ["index.ts"] : [])).includes(name);

/** The trees where a domain earns a folder at its second module. */
const TREES = ["tooling/scripts", "apps/mobile/src"];

/** The routers' roots: a folder in one is a URL path, never a domain. Only the phone app's is inside a tree. */
const URL_TREES = ["apps/dashboard/app", "apps/edge/api", "apps/mobile/src/app"];

/**
 * The exceptions: a folder of one module that a program in flight owns, the day it was granted, the program it waits
 * on, and why it is excepted rather than moved.
 */
const EXCEPTIONS = {};

/**
 * Every module in the trees, as the tree-shape ratchet counts one (_measures.mjs reads `repoFiles` the same way): its
 * own set, `.ts`, `.tsx`, `.js`, `.jsx` and `.mjs`, less `.d.ts`, generated files and what is built or installed.
 */
const treeModules = repoFiles(["packages", ...BACKEND_TREES, ...TREES]);

/** The backend tree a module is in: its package's `src`, or the app tree it starts with. */
const backendTreeOf = (f) => PACKAGE_SRC.exec(f)?.[0] ?? BACKEND_TREES.find((t) => f.startsWith(`${t}/`));

/** The tree a module is in, among those where a domain earns its folder. */
const treeOf = (f) => TREES.find((t) => f.startsWith(`${t}/`));

/** Each folder directly under one of those trees' roots, but a URL tree's, with the modules it holds at any depth. */
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

test("the measure sees every tree a domain folder is held in, and the folders in each", () => {
  const backend = new Set(treeModules.map(backendTreeOf));
  for (const p of packageNames) assert.ok(backend.has(`packages/${p}/src`), `packages/${p}/src is read`);
  for (const t of BACKEND_TREES) assert.ok(backend.has(t), `${t} is read`);
  const trees = new Set(treeModules.map(treeOf));
  for (const t of TREES) assert.ok(trees.has(t), `${t} is read`);
  const folders = domainFolders();
  assert.ok(folders.size >= 5, `the folders directly under the trees' roots were found (${folders.size})`);
  assert.ok(
    treeModules.some((f) => f.startsWith("apps/mobile/src/app/")),
    "the phone app's routes are where URL_TREES passes over them",
  );
});

test("a backend tree's root holds its folders and its package's entries, nothing else", () => {
  const loose = treeModules.filter((f) => {
    const tree = backendTreeOf(f);
    if (!tree) return false;
    const rest = f.slice(tree.length + 1);
    return !rest.includes("/") && !isRootEntry(tree, rest);
  });
  assert.deepEqual(loose, [], "put each in its domain's folder, or in its tree's shared/ if every domain uses it");
});

test("every repository is under repositories/<domain>/", () => {
  const REPOSITORIES = "packages/db/src/repositories/";
  const loose = treeModules.filter((f) => f.startsWith(REPOSITORIES) && !f.slice(REPOSITORIES.length).includes("/"));
  assert.deepEqual(loose, [], "put each in its domain's folder");
  const beside = treeModules
    .filter((f) => f.startsWith("packages/db/src/") && !f.startsWith(REPOSITORIES))
    .map((f) => f.slice("packages/db/src/".length).split("/")[0])
    .filter((name) => !name.includes(".") && name !== "shared");
  assert.deepEqual([...new Set(beside)], [], "packages/db/src holds repositories/ and shared/ as its only folders");
});

test("a domain earns a folder at its second module where it must: no folder directly under those roots holds just one", () => {
  const thin = [...domainFolders()]
    .filter(([folder, modules]) => modules.length === 1 && !(folder in EXCEPTIONS))
    .map(
      ([folder, [module]]) => `${folder}/ holds one module: move ${module} to ${folder}${path.posix.extname(module)}`,
    );
  assert.deepEqual(thin, [], "a one-module domain sits at its tree's root until its second module earns it a folder");
});

test("each exception is dated, names the program it waits on and why, and still excepts a folder of one module", () => {
  const folders = domainFolders();
  for (const [folder, { since, waitsOn, why }] of Object.entries(EXCEPTIONS)) {
    assert.match(since, /^\d{1,2} [A-Z][a-z]+ \d{4}$/, `${folder}: the day its exception was granted`);
    assert.ok(waitsOn, `${folder}: the program its exception waits on`);
    assert.ok(why, `${folder}: why it is excepted rather than moved`);
    const n = folders.get(folder)?.length ?? 0;
    assert.equal(n, 1, `${folder} holds ${n} modules now: its exception has ended, so take it out of EXCEPTIONS`);
  }
});
