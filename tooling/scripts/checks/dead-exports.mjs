#!/usr/bin/env node
/**
 * Dead exports, counted: a number check:debt holds, file by file.
 *
 * knip (knip.json declares the doors, the routes, the manifest and the tests as
 * entries) lists every export, type and module nothing imports. This counts that
 * list per file, and since 28 October 2026 (decision 0074) a pull request is held to
 * what it adds: CI's debt job counts it on the change's base and on its head
 * (tooling/scripts/checks/debt.mjs, its `knip` part), and a count that rose fails the
 * change unless its description says why, in a line `Debt: <why>`. It runs there
 * rather than inside `pnpm test`, because a whole-repository import graph takes a
 * minute the node suite should not.
 *
 *   node tooling/scripts/checks/dead-exports.mjs     # count them, and say the files that hold the most
 *
 * knip runs from its own bin under the node running this, never through `pnpm`:
 * pnpm is corepack's here, and a bare `pnpm` is not on every machine's PATH.
 *
 * knip enters each package at its barrel (`src/index.ts`), and every barrel names its exports, so to knip each
 * of a package's public values is used. The packages' pass below reads them as code instead: a value a package's
 * barrel exports and no module outside its own declaring one mentions is counted under its module, beside knip's
 * findings (`unimportedExports`, _ast.mjs). The public names are the bundle's (the one the node suite reads, which
 * esbuild resolves through every `export *`), so this builds the bundles first (tooling/scripts/package-build.mjs).
 *
 * A finding is a bug report, not an instruction: an export knip cannot see a
 * use of may be read through a string, a dynamic import or a test double. Look
 * before deleting; hold the count without looking.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoFiles, parse, bundleExports, unimportedExports } from "../tests/_ast.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * `[node, [knip's bin, ...args]]`: the `bin` of the knip the repository installed, found
 * as node finds a package, in the nearest `node_modules` up from the root. Not through
 * `require.resolve`: under the test runner's loader, tsconfig's `baseUrl` answers
 * "knip" with the root's knip.json.
 */
export function knipCommand(args) {
  for (let dir = ROOT; ; dir = path.dirname(dir)) {
    const pkg = path.join(dir, "node_modules", "knip", "package.json");
    if (fs.existsSync(pkg)) {
      const { bin } = JSON.parse(fs.readFileSync(pkg, "utf8"));
      return [process.execPath, [path.join(path.dirname(pkg), typeof bin === "string" ? bin : bin.knip), ...args]];
    }
    if (path.dirname(dir) === dir) throw new Error("knip is not installed: corepack pnpm install");
  }
}

/**
 * knip's heap, the lint's own: its graph of the whole tree outgrew node's default on CI's runner (about 2 GB) on
 * 12 Oct 2026, when main's push of #1565 died in it twice ("JavaScript heap out of memory") and nothing was measured.
 */
const KNIP_HEAP = "--max-old-space-size=5120";

const PACKAGES = ["channels", "contracts", "core", "db", "jobs"];
const isBarrel = (f) => /(^|\/)index\.ts$/.test(f);

/** `{ file: n }`: each package module's public values that no other module imports (the pass knip cannot make). */
export function packagePass() {
  const everything = [...repoFiles(["apps", "packages"]), ...repoFiles(["tooling/scripts", "e2e"])];
  const now = {};
  for (const p of PACKAGES) {
    const own = (f) => f.startsWith(`packages/${p}/src/`);
    const modules = everything.filter((f) => own(f) && !isBarrel(f) && !/\.type-test\.ts$/.test(f));
    const readers = everything.filter((f) => !(own(f) && isBarrel(f)));
    const found = unimportedExports(
      modules.map((file) => ({ file, sf: parse(file) })),
      bundleExports(parse(`packages/${p}/dist/index.js`)),
      readers.map((file) => ({ file, sf: parse(file) })),
    );
    for (const [file, names] of Object.entries(found)) now[file] = names.length;
  }
  return now;
}

/** `{ file: n }`: knip's findings and the packages' pass, the bundles built first (their public names are read). */
export function deadExports() {
  execFileSync(process.execPath, [path.join(ROOT, "tooling/scripts/package-build.mjs")], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
  });
  let raw;
  try {
    const [exe, args] = knipCommand(["--reporter", "json", "--no-progress"]);
    raw = execFileSync(exe, [KNIP_HEAP, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // knip exits 1 when it has findings; the JSON is still on stdout.
    raw = e.stdout;
    if (!raw) throw new Error("knip did not run");
  }
  const report = JSON.parse(raw);
  const now = {};
  for (const f of report.files ?? []) now[`${f} (unreferenced module)`] = 1;
  for (const issue of report.issues ?? []) {
    const n = (issue.exports?.length ?? 0) + (issue.types?.length ?? 0);
    if (n > 0) now[issue.file] = n;
  }
  for (const [file, n] of Object.entries(packagePass())) now[file] = (now[file] ?? 0) + n;
  return Object.fromEntries(
    Object.keys(now)
      .sort()
      .map((k) => [k, now[k]]),
  );
}

function main() {
  const now = deadExports();
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  const most = Object.entries(now)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, n]) => `  ${String(n).padStart(3)}  ${file}`);
  console.log(`dead exports: ${total} in ${Object.keys(now).length} files (check:debt holds them to the base)`);
  if (most.length) console.log(`the most:\n${most.join("\n")}`);
}

// Run as a script, not when a test imports knipCommand.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
