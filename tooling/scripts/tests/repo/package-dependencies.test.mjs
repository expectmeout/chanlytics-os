/**
 * Each project says what it needs, and a package ships no one else's code.
 *
 * The hoisted linker (`.npmrc`) puts every third-party module at the root, so an import a project never declared
 * resolves anyway and nothing fails until the layout changes: core and jobs imported `@supabase/supabase-js`, and
 * their builds carried `html-to-text` inline, for weeks without declaring either (the scorecard's I1:3). A package's
 * built dist is what the edge executes (docs/decisions/0023-how-the-packages-ship.md): the workspace's own packages
 * are inlined into it, every third-party module stays an import, and a Dependabot bump of one changes a manifest and
 * the lockfile, never a committed dist.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { ROOT } from "../_source.mjs";
import { repoFiles, parse, importsOf, packageOf } from "../_ast.mjs";

const PACKAGES = ["channels", "contracts", "core", "db", "jobs"];
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
    for (const out of ["dist/index.js", "dist/index.d.ts"]) {
      for (const { specifier } of importsOf(parse(`packages/${p}/${out}`))) {
        const name = packageOf(specifier);
        if (name && name !== m.name && !(name in runtime)) unlisted.push(`packages/${p}/${out}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(
    unlisted,
    [],
    "a package declares every module its dist imports, the ones it inlines from @chanlytics/* included: the edge resolves them from its own node_modules",
  );
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

test("each package's build inlines only the workspace's own packages", async () => {
  for (const p of PACKAGES) {
    const { default: config } = await import(pathToFileURL(path.join(ROOT, `packages/${p}/tsup.config.ts`)).href);
    assert.equal(config.skipNodeModulesBundle, true, `${p}: every bare import but @chanlytics/* stays external`);
    for (const re of config.noExternal ?? []) {
      assert.ok(
        re instanceof RegExp && re.test("@chanlytics/contracts"),
        `${p}: noExternal names the workspace's packages`,
      );
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
