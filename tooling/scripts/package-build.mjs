#!/usr/bin/env node
/**
 * The packages' bundles for the node suite: each package's entries built into its `dist/`, which git does not keep
 * (decision 0074, step 2).
 *
 * The packages ship as their sources. The dashboard compiles them as it compiles itself (`transpilePackages`), the
 * edge's esbuild bundles them into each function, and the compiler reads them through project references. Only the
 * node suite wants them built: loaded as some 900 source modules through tsx, a folder of twenty test files took 33 s
 * where five bundles took 18 (28 October 2026). So the launcher builds them here first, in about a second, and the
 * suite resolves a package to its bundle by the `bundled` export condition it passes (tooling/scripts/checks/test.mjs).
 * Nothing deploys a file this writes.
 *
 * Each entry is the `bundled` target of the package's own `exports` (`./dist/<name>.js`), built from the `import`
 * target beside it, whole: a sibling package is reached by its bundle's relative path (siblingsByPath, so a bundle
 * imported by its path loads the same file the condition does: one module per package per process), and every
 * third-party module stays an import, resolved from the hoisted node_modules. Each module's code opens with its path
 * (`// src/x.ts`), which coverage reads back to the module (tooling/scripts/checks/coverage.mjs).
 *
 *   node tooling/scripts/package-build.mjs           build every package whose sources moved (the launcher does this)
 *   node tooling/scripts/package-build.mjs --force   build every package
 *   node ../../tooling/scripts/package-build.mjs     from a package's folder: that package (its `build` script)
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { siblingsByPath } from "./package-siblings.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGES_DIR = path.join(ROOT, "packages");

/** Every package: each folder of packages/ with a manifest. */
export const packageNames = () =>
  fs
    .readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(PACKAGES_DIR, e.name, "package.json")))
    .map((e) => e.name)
    .sort();

/** A package's entries, from its manifest: `{ "dist/<name>.js": "src/<module>.ts" }`, one per `bundled` target. */
export function entriesOf(name) {
  const manifest = JSON.parse(fs.readFileSync(path.join(PACKAGES_DIR, name, "package.json"), "utf8"));
  const entries = {};
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    if (typeof target !== "object" || !target.bundled) continue;
    const out = target.bundled.replace(/^\.\//, "");
    const from = (target.import ?? target.default).replace(/^\.\//, "");
    if (!/^dist\/[a-z-]+\.js$/.test(out) || !/^src\/.+\.ts$/.test(from))
      throw new Error(
        `packages/${name}: ${subpath} bundles ${out} from ${from}, not dist/<name>.js from src/<module>.ts`,
      );
    entries[out] = from;
  }
  return entries;
}

/**
 * Third-party code is never inlined: every bare import but a sibling's stays an import (decision 0024, step 1), and a
 * sibling is siblingsByPath's to answer.
 */
const thirdPartyExternal = {
  name: "third-party-external",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) =>
      args.path.startsWith("@chanlytics/") || args.path.startsWith("node:")
        ? undefined
        : { path: args.path, external: true },
    );
  },
};

/** The esbuild options of one package's build: what the shipping test holds. */
export function buildOptions(name) {
  const dir = path.join(PACKAGES_DIR, name);
  const entries = entriesOf(name);
  return {
    absWorkingDir: dir,
    entryPoints: Object.fromEntries(Object.entries(entries).map(([out, from]) => [out.replace(/\.js$/, ""), from])),
    outdir: ".",
    bundle: true,
    splitting: false,
    platform: "node",
    format: "esm",
    target: "node24",
    plugins: [siblingsByPath, thirdPartyExternal],
    logLevel: "warning",
  };
}

/** The files a package's bundle is built from, and this build itself. */
function inputsOf(name) {
  const dir = path.join(PACKAGES_DIR, name);
  const files = fs
    .readdirSync(path.join(dir, "src"), { recursive: true })
    .map((f) => path.join(dir, "src", String(f)))
    .filter((f) => fs.statSync(f).isFile());
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    ...files,
    path.join(dir, "package.json"),
    path.join(here, "package-build.mjs"),
    path.join(here, "package-siblings.mjs"),
  ];
}

/**
 * What a bundle was built from: each input's path, size and time, hashed. A bundle whose stamp is this one is current,
 * so a run that follows a run builds nothing (the local check builds once, then lints, measures and tests beside it).
 */
export function stampOf(name) {
  const hash = createHash("sha1");
  for (const f of inputsOf(name).sort()) {
    const s = fs.statSync(f);
    hash.update(`${path.relative(ROOT, f)}:${s.size}:${s.mtimeMs}\n`);
  }
  return hash.digest("hex");
}

const STAMP = "dist/.built";

/**
 * Build the packages named (every one by default) into their dist folders, each only when its stamp moved; `force`
 * builds them all. A file left in a dist that no entry writes is removed.
 */
export async function buildPackages(names = packageNames(), { force = false } = {}) {
  const esbuild = createRequire(path.join(ROOT, "package.json"))("esbuild");
  const built = [];
  await Promise.all(
    names.map(async (name) => {
      const dir = path.join(PACKAGES_DIR, name);
      const stamp = stampOf(name);
      const was = fs.existsSync(path.join(dir, STAMP)) ? fs.readFileSync(path.join(dir, STAMP), "utf8") : null;
      if (!force && was === stamp) return;
      await esbuild.build(buildOptions(name));
      const kept = new Set([...Object.keys(entriesOf(name)).map((out) => path.basename(out)), path.basename(STAMP)]);
      for (const f of fs.readdirSync(path.join(dir, "dist"))) {
        if (!kept.has(f)) fs.rmSync(path.join(dir, "dist", f), { recursive: true, force: true });
      }
      fs.writeFileSync(path.join(dir, STAMP), stamp);
      built.push(name);
    }),
  );
  return built.sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = Date.now();
  const here = path.relative(PACKAGES_DIR, process.cwd());
  const names = !here.startsWith("..") && here && !here.includes(path.sep) ? [here] : packageNames();
  const built = await buildPackages(names, { force: process.argv.includes("--force") });
  console.log(
    `package-build: ${built.length ? built.join(", ") : "nothing to build"} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}
