/**
 * Each project says what it needs, and a package ships no one else's code.
 *
 * The hoisted linker (`nodeLinker` in pnpm-workspace.yaml) puts every third-party module at the root, so an import a project never declared
 * resolves anyway and nothing fails until the layout changes: core and jobs imported `@supabase/supabase-js`, and
 * their builds carried `html-to-text` inline, for weeks without declaring either (the scorecard's I1:3). A package's
 * built dist is what the edge executes (docs/decisions/0024-how-the-packages-ship.md): it carries its own code alone,
 * reaches a sibling by that sibling's built file's relative path (step 2), keeps every third-party module an import,
 * and a Dependabot bump of one changes a manifest and the lockfile, never a committed dist.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { ROOT } from "../_source.mjs";
import { repoFiles, parse, importsOf, packageOf } from "../_ast.mjs";

/** Every package: each folder of packages/ with a manifest, so one added later is held to these rules the day it lands. */
const PACKAGES = fs
  .readdirSync(path.join(ROOT, "packages"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, "packages", e.name, "package.json")))
  .map((e) => e.name);
/**
 * Every module a package's dist ships, by its extension: its index, and an entry of its own (contracts' browser.js and
 * write-rules.js, db's realtime.js, which a page loads). Reading index.js alone left the others unchecked.
 */
const builtFiles = (p, ext) =>
  fs
    .readdirSync(path.join(ROOT, "packages", p, "dist"))
    .filter((f) => f.endsWith(ext))
    .map((f) => `packages/${p}/dist/${f}`);
/** The projects whose sources are held to their manifest: the packages, and the two apps that run on a server. */
const PROJECTS = [...PACKAGES.map((p) => `packages/${p}`), "apps/edge", "apps/dashboard"];

const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(ROOT, dir, "package.json"), "utf8"));
const runtimeOf = (m) => ({ ...m.dependencies, ...m.peerDependencies });

/** A test, a type test or a build's config may lean on a dev dependency; code that ships may not. */
const isDevOnly = (file) => /\.type-test\.tsx?$|(^|\/)(test|__tests__)\/|(^|\/)[\w.-]+\.config\.[cm]?ts$/.test(file);
/** The dashboard's path alias (`@/server/route`, its tsconfig.json's paths): its own modules, not a package. */
const isAlias = (specifier) => specifier.startsWith("@/");

test("each project's source imports only what its package.json declares", () => {
  const unlisted = [];
  for (const dir of PROJECTS) {
    const m = manifest(dir);
    const runtime = runtimeOf(m);
    for (const file of repoFiles([dir]).filter((f) => /\.(ts|tsx|mts)$/.test(f))) {
      for (const { specifier } of importsOf(parse(file))) {
        const name = isAlias(specifier) ? null : packageOf(specifier);
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
        if (specifier.startsWith("@chanlytics/")) wrong.push(`${out}: ${specifier}, by name`);
        else if (specifier.startsWith(".") && !sibling)
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
    "a third-party module stays an import (skipNodeModulesBundle in the package's tsup.config.ts)",
  );
});

test("each package's build keeps third-party code external and hands its siblings to siblingsByPath", async () => {
  // A package's config is one build or several (contracts builds its entries apart): each is held.
  const builds = [];
  for (const p of PACKAGES) {
    const { default: config } = await import(pathToFileURL(path.join(ROOT, `packages/${p}/tsup.config.ts`)).href);
    for (const one of [config].flat()) builds.push([p, one]);
  }
  for (const [p, config] of builds) {
    assert.equal(config.skipNodeModulesBundle, true, `${p}: every bare import but @chanlytics/* stays external`);
    if (p === "contracts") continue;
    // Every package but contracts imports a sibling: the plugin answers for it with its built file's relative path,
    // and noExternal is what stops tsup naming a declared sibling external before the plugin is asked.
    assert.ok(
      (config.esbuildPlugins ?? []).some((pl) => pl.name === "siblings-by-path"),
      `${p}: siblingsByPath (tooling/scripts/package-siblings.mjs)`,
    );
    for (const re of config.noExternal ?? []) {
      assert.ok(re instanceof RegExp && re.test("@chanlytics/contracts"), `${p}: noExternal names the siblings`);
      assert.ok(!re.test("html-to-text") && !re.test("@supabase/supabase-js"), `${p}: noExternal names nothing else`);
    }
  }
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
