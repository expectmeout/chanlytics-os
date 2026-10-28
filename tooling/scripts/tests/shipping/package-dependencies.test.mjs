/**
 * Each project says what it needs, and a package ships no one else's code.
 *
 * The hoisted linker (`nodeLinker` in pnpm-workspace.yaml) puts every third-party module at the root, so an import a project never declared
 * resolves anyway and nothing fails until the layout changes: core and jobs imported `@supabase/supabase-js`, and
 * their builds carried `html-to-text` inline, for weeks without declaring either (the scorecard's I1:3). A package
 * ships as its sources (decision 0074): its `exports` name them, and the projects that import it compile them. Its
 * dist is the node suite's bundle (tooling/scripts/package-build.mjs), built before every run and never committed: it
 * carries its own code alone, reaches a sibling by that sibling's bundle's relative path (decision 0024, step 2), and
 * keeps every third-party module an import.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT } from "../_source.mjs";
import { repoFiles, parse, importsOf, packageOf } from "../_ast.mjs";
import { buildOptions, entriesOf } from "../../package-build.mjs";

/** Every package: each folder of packages/ with a manifest, so one added later is held to these rules the day it lands. */
const PACKAGES = fs
  .readdirSync(path.join(ROOT, "packages"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, "packages", e.name, "package.json")))
  .map((e) => e.name);
/**
 * Every module a package's dist ships, by its extension, in its folders too: its index, and an entry of its own
 * (contracts' write-rules.js, db's realtime.js, which a page loads), and contracts' browser build, a file per module
 * under dist/browser. Reading index.js alone left the others unchecked.
 */
const builtFiles = (p, ext) =>
  fs
    .readdirSync(path.join(ROOT, "packages", p, "dist"), { recursive: true })
    .filter((f) => f.endsWith(ext))
    .map((f) => `packages/${p}/dist/${f.split(path.sep).join("/")}`);
/** The projects whose sources are held to their manifest: the packages, and the two apps that run on a server. */
const PROJECTS = [...PACKAGES.map((p) => `packages/${p}`), "apps/edge", "apps/dashboard"];

const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(ROOT, dir, "package.json"), "utf8"));
const runtimeOf = (m) => ({ ...m.dependencies, ...m.peerDependencies });

/** A test, a type test or a build's config may lean on a dev dependency; code that ships may not. */
const isDevOnly = (file) => /\.type-test\.tsx?$|(^|\/)(test|__tests__)\/|(^|\/)[\w.-]+\.config\.[cm]?ts$/.test(file);
/** The dashboard's path alias (`@/server/route`, its tsconfig.json's paths): its own modules, not a package. */
const isAlias = (specifier) => specifier.startsWith("@/");
/**
 * A subpath import its manifest names (`#frame-shell`, package.json's "imports"): the project's own module, not a
 * dependency. One its manifest does not name resolves to nothing, and is reported.
 */
const isOwnImport = (m, specifier) => specifier.startsWith("#") && Object.hasOwn(m.imports ?? {}, specifier);

test("each project's source imports only what its package.json declares", () => {
  const unlisted = [];
  for (const dir of PROJECTS) {
    const m = manifest(dir);
    const runtime = runtimeOf(m);
    for (const file of repoFiles([dir]).filter((f) => /\.(ts|tsx|mts)$/.test(f))) {
      for (const { specifier } of importsOf(parse(file))) {
        const name = isAlias(specifier) || isOwnImport(m, specifier) ? null : packageOf(specifier);
        if (!name || name === m.name || name in runtime) continue;
        if (isDevOnly(file) && name in (m.devDependencies ?? {})) continue;
        // Next resolves these itself: `next/*`, and the `server-only` marker it bundles.
        if (dir === "apps/dashboard" && (name === "next" || name === "server-only") && "next" in runtime) continue;
        unlisted.push(`${file}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(
    unlisted,
    [],
    "declare it in that project's package.json (dependencies: a package's d.ts and dist carry its type imports too)",
  );
});

test("each package's built dist imports only what its package.json declares", () => {
  const unlisted = [];
  for (const p of PACKAGES) {
    const m = manifest(`packages/${p}`);
    const runtime = runtimeOf(m);
    for (const out of [...builtFiles(p, ".js"), ...builtFiles(p, ".d.ts")]) {
      for (const { specifier } of importsOf(parse(out))) {
        const name = packageOf(specifier);
        if (name && name !== m.name && !(name in runtime)) unlisted.push(`${out}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(
    unlisted,
    [],
    "a package declares every module its dist imports, its @chanlytics/* siblings included: the edge resolves them from its own node_modules",
  );
});

test("a package's built JavaScript reaches a sibling only by its built file's relative path, and only one it declares", () => {
  // Decision 0024, step 2. A dist that imported `@chanlytics/db` by name would pass the declaration test above (core
  // declares it) and resolve under pnpm's links here, then fail on the edge, where Vercel's bundler follows no link;
  // the relative path is the file the edge's facades already name.
  const wrong = [];
  for (const p of PACKAGES) {
    const declared = Object.keys(runtimeOf(manifest(`packages/${p}`)))
      .filter((n) => n.startsWith("@chanlytics/"))
      .map((n) => n.slice("@chanlytics/".length));
    for (const out of builtFiles(p, ".js"))
      for (const { specifier } of importsOf(parse(out))) {
        const sibling = /^\.\.\/\.\.\/([a-z]+)\/dist\/index\.js$/.exec(specifier)?.[1];
        // A file of the package's own dist, by its relative path: contracts' browser build, a file per module.
        const own = path.posix.join(path.posix.dirname(out), specifier);
        const ownFile = !sibling && own.startsWith(`packages/${p}/dist/`) && fs.existsSync(path.join(ROOT, own));
        if (specifier.startsWith("@chanlytics/")) wrong.push(`${out}: ${specifier}, by name`);
        else if (specifier.startsWith(".") && !sibling && !ownFile)
          wrong.push(`${out}: ${specifier} is not a sibling's built file`);
        else if (sibling && !declared.includes(sibling)) wrong.push(`${out}: ${sibling} is not in its package.json`);
      }
  }
  assert.deepEqual(wrong, [], "the package's tsup.config.ts hands its build siblingsByPath");
});

test("no package's dist carries a sibling's code: one module per package per process, one breaker, one AppError", () => {
  // esbuild opens a module it inlined with a comment naming its path; at 1388f2cc6 core's dist opened
  // `// ../contracts/dist/index.js`, `// ../db/dist/index.js` and `// ../channels/dist/index.js`, and carried its own
  // copy of channels' providerFetch and the breaker map beside it, so a send through core's deliver counted toward a
  // breaker the edge's direct channels calls never read.
  const carried = PACKAGES.flatMap((p) =>
    builtFiles(p, ".js").flatMap((out) =>
      [...fs.readFileSync(path.join(ROOT, out), "utf8").matchAll(/^\/\/ \.\.\/([a-z]+)\/dist\//gm)].map(
        (m) => `${out} carries ${m[1]}`,
      ),
    ),
  );
  assert.deepEqual(carried, []);
  for (const p of PACKAGES.filter((x) => x !== "channels")) {
    const dist = fs.readFileSync(path.join(ROOT, `packages/${p}/dist/index.js`), "utf8");
    assert.ok(!/async function providerFetch\(/.test(dist), `${p}: the breaker's module is channels' alone`);
  }
});

test("a project that declares a package declares the siblings it imports, so an installed layout has them beside it", () => {
  // Decision 0024's risk: the relative path assumes `@chanlytics/<p>`'s siblings sit beside it wherever it is installed.
  const siblingsOf = Object.fromEntries(
    PACKAGES.map((p) => [
      `@chanlytics/${p}`,
      Object.keys(runtimeOf(manifest(`packages/${p}`))).filter((n) => n.startsWith("@chanlytics/")),
    ]),
  );
  const missing = [];
  for (const dir of [...PACKAGES.map((p) => `packages/${p}`), "apps/edge", "apps/dashboard", "apps/mobile"]) {
    const deps = runtimeOf(manifest(dir));
    for (const name of Object.keys(deps).filter((n) => n in siblingsOf))
      for (const sibling of siblingsOf[name])
        if (!(sibling in deps)) missing.push(`${dir}: ${name} without ${sibling}`);
  }
  assert.deepEqual(missing, []);
});

/** The modules esbuild inlined into a bundle: it opens each one with a comment naming its path. */
function inlinedModules(file) {
  const sf = parse(file);
  const out = new Set();
  for (const st of sf.statements) {
    for (const r of ts.getLeadingCommentRanges(sf.text, st.getFullStart()) ?? []) {
      const c = sf.text.slice(r.pos, r.end);
      const m = c.match(/^\/\/ (\S*node_modules\/\S+)$/);
      if (m) out.add(m[1]);
    }
  }
  return [...out];
}

test("no package's dist inlines a third-party module", () => {
  const inlined = PACKAGES.flatMap((p) => inlinedModules(`packages/${p}/dist/index.js`).map((m) => `${p}: ${m}`));
  assert.deepEqual(
    inlined,
    [],
    "a third-party module stays an import (third-party-external in tooling/scripts/package-build.mjs)",
  );
});

test("each package's bundle keeps third-party code external and hands its siblings to siblingsByPath", async () => {
  for (const p of PACKAGES) {
    const options = buildOptions(p);
    const plugins = options.plugins.map((pl) => pl.name);
    assert.deepEqual(plugins, ["siblings-by-path", "third-party-external"], p);
    assert.equal(options.bundle && !options.splitting, true, `${p}: each entry whole, sharing no chunk`);
  }
  const external = buildOptions("core").plugins.find((pl) => pl.name === "third-party-external");
  const asked = [];
  external.setup({ onResolve: (_, fn) => asked.push(fn) });
  const [resolve] = asked;
  assert.deepEqual(resolve({ path: "html-to-text" }), { path: "html-to-text", external: true });
  assert.deepEqual(resolve({ path: "@supabase/supabase-js" }), { path: "@supabase/supabase-js", external: true });
  assert.equal(resolve({ path: "@chanlytics/contracts" }), undefined, "a sibling is siblingsByPath's to answer");
  assert.equal(resolve({ path: "node:crypto" }), undefined, "a builtin is the platform's");
});

test("each package ships its sources: every export names a module under src/, and the suite's bundle beside it", () => {
  const wrong = [];
  for (const p of PACKAGES) {
    const m = manifest(`packages/${p}`);
    assert.equal(m.main ?? m.types, undefined, `${p}: no main or types beside its exports`);
    for (const [subpath, target] of Object.entries(m.exports)) {
      const targets = typeof target === "string" ? { default: target } : target;
      for (const [condition, file] of Object.entries(targets)) {
        const ok = condition === "bundled" ? /^\.\/dist\/[a-z-]+\.js$/.test(file) : /^\.\/src\/.+\.ts$/.test(file);
        if (!ok || (condition !== "bundled" && !fs.existsSync(path.join(ROOT, "packages", p, file))))
          wrong.push(`${p} ${subpath} ${condition}: ${file}`);
      }
      if (typeof target === "object" && target.bundled && Object.keys(target).indexOf("bundled") !== 1)
        wrong.push(`${p} ${subpath}: the bundled condition comes right after types, before any a bundler matches`);
    }
    assert.ok(Object.keys(entriesOf(p)).includes("dist/index.js"), `${p}: the suite's bundle of its index`);
  }
  assert.deepEqual(wrong, []);
  // The edge runtime matches `browser` too, and the browser's entry lacks the server's names: `edge-light` is read first.
  const root = manifest("packages/contracts").exports["."];
  const order = Object.keys(root);
  assert.ok(order.indexOf("edge-light") < order.indexOf("browser"), "contracts: edge-light before browser");
});

test("each package is a project of its own that references exactly the siblings it imports, and each app all five", () => {
  const wrong = [];
  const refs = (dir) =>
    (ts.readConfigFile(path.join(ROOT, dir, "tsconfig.json"), ts.sys.readFile).config.references ?? [])
      .map((r) => path.posix.normalize(path.posix.join(dir, r.path)))
      .sort();
  for (const p of PACKAGES) {
    const options = ts.readConfigFile(path.join(ROOT, "packages", p, "tsconfig.json"), ts.sys.readFile).config
      .compilerOptions;
    if (!options.composite || !options.emitDeclarationOnly || options.outDir !== ".types")
      wrong.push(`packages/${p}: composite, declarations only, into .types`);
    const siblings = Object.keys(manifest(`packages/${p}`).dependencies ?? {})
      .filter((d) => d.startsWith("@chanlytics/"))
      .map((d) => `packages/${d.split("/")[1]}`)
      .sort();
    if (JSON.stringify(refs(`packages/${p}`)) !== JSON.stringify(siblings))
      wrong.push(`packages/${p}: references ${refs(`packages/${p}`)}, imports ${siblings}`);
  }
  const all = PACKAGES.map((p) => `packages/${p}`).sort();
  for (const app of ["apps/edge", "apps/dashboard"])
    if (JSON.stringify(refs(app)) !== JSON.stringify(all)) wrong.push(`${app}: references ${refs(app)}`);
  assert.deepEqual(wrong, []);
});

test("a third-party module has one range in every package and server app that declares it", () => {
  const ranges = new Map();
  for (const dir of PROJECTS) {
    for (const [name, range] of Object.entries(runtimeOf(manifest(dir)))) {
      if (range.startsWith("workspace:")) continue;
      ranges.set(name, [...(ranges.get(name) ?? []), `${dir} ${range}`]);
    }
  }
  const split = [...ranges]
    .filter(([, at]) => new Set(at.map((a) => a.split(" ")[1])).size > 1)
    .map(([name, at]) => `${name}: ${at.join(", ")}`);
  // The hoisted linker installs one copy at the root, and a dist resolves from there: a second range installs a
  // second copy beside one package, and the bundle that inlines that package imports the root's.
  assert.deepEqual(split, [], "bump it everywhere at once (Dependabot's group does)");
});
