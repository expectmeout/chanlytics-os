#!/usr/bin/env node
/**
 * Dead exports, counted: a number check:debt holds, file by file.
 *
 * knip (knip.json declares the doors, the routes, the manifest and the tests as
 * entries) lists every export, type and module nothing imports, and every dependency
 * a package.json names that nothing imports (counted under that package.json, its
 * dependency rules on since 25 Nov 2026). This counts that
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
 * knip.json's `ignoreDependencies` are the dependencies it cannot see a use of: lint-staged runs from the commit hook
 * (.husky/pre-commit), esbuild is loaded as the root's by the tooling's scripts, and the phone app's expo-font and
 * expo-symbols are its SDK's native modules, which wait for the phone app (removing one changes its build).
 *
 * The suite loads many modules through a helper that takes the path as a string (`importSrc("apps/…")`, `at("…")`),
 * which knip cannot follow: an export a test or a script names, in a file that names its module's path, is a seam the
 * suite stands on, not a dead one, and is not counted (readByPath), nor is a module only such a seam imports
 * (seamModules). Since 26 November 2026: until then the edge's 58 were 57 such seams and one dead name, and the
 * whole count 143 held some 115 of them.
 *
 * A finding is a bug report, not an instruction: an export knip cannot see a
 * use of may be read through a string, a dynamic import or a test double. Look
 * before deleting; hold the count without looking.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoFiles, parse, bundleExports, unimportedExports } from "../../../tests/_ast.mjs";
import { entriesOf } from "../package-build.mjs";

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
  const everything = [...repoFiles(["apps", "packages"]), ...repoFiles(["tooling/scripts", "tests", "e2e"])];
  const now = {};
  for (const p of PACKAGES) {
    const own = (f) => f.startsWith(`packages/${p}/src/`);
    const modules = everything.filter((f) => own(f) && !isBarrel(f) && !/\.type-test\.ts$/.test(f));
    const readers = everything.filter((f) => !(own(f) && isBarrel(f)));
    const found = unimportedExports(
      modules.map((file) => ({ file, sf: parse(file) })),
      // Every entry's names: db and channels are reached by their domains, with no index (decision 0110).
      new Set(Object.keys(entriesOf(p)).flatMap((out) => [...bundleExports(parse(`packages/${p}/${out}`))])),
      readers.map((file) => ({ file, sf: parse(file) })),
    );
    for (const [file, names] of Object.entries(found)) now[file] = names.length;
  }
  return now;
}

/** The suite's and the scripts' text, each file once: what readByPath reads. */
function suiteTexts() {
  return repoFiles(["tests", "e2e", "tooling/scripts"])
    .filter((f) => /\.(mjs|js|ts)$/.test(f))
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"));
}

/**
 * Whether a test or a script reads `name` of `file` by the module's path: a text that names the path by at least its
 * last two parts (`${S}/calendar/sample.ts` names it so), with or without its extension, and the name as a word. With no
 * name, whether any text names the path: a module only the suite loads.
 */
export function readByPath(file, name, texts) {
  const tail = file
    .replace(/\.(tsx?|mjs|js)$/, "")
    .split("/")
    .slice(-2)
    .join("/");
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const at = new RegExp(`[/"'\`]${escape(tail)}(\\.(tsx?|mjs|js))?["'\`]`);
  const word = name === null ? null : new RegExp(`(^|[^\\w$])${escape(name)}($|[^\\w$])`);
  return texts.some((text) => at.test(text) && (word === null || word.test(text)));
}

/** The modules a module imports by a relative path, as the repository's paths each could be. */
function relativeImportsOf(file) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const out = [];
  for (const m of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    const base = path.posix.join(path.posix.dirname(file), m[1]).replace(/\.js$/, "");
    out.push(`${base}.ts`, `${base}.tsx`, `${base}/index.ts`);
  }
  return out;
}

/**
 * The modules nothing imports that the suite stands on: each one a test or a script names by its path, and, module by
 * module, what those import that nothing else does (the calendar's sample reads its day and its clock).
 */
export function seamModules(unreferenced, texts) {
  const left = new Set(unreferenced);
  const seams = new Set(unreferenced.filter((f) => readByPath(f, null, texts)));
  for (let grew = true; grew;) {
    grew = false;
    for (const seam of [...seams])
      for (const f of relativeImportsOf(seam))
        if (left.has(f) && !seams.has(f)) {
          seams.add(f);
          grew = true;
        }
  }
  return seams;
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
    if (!raw) throw new Error("knip did not run", { cause: e });
  }
  const report = JSON.parse(raw);
  const texts = suiteTexts();
  const now = {};
  const seams = seamModules(report.files ?? [], texts);
  for (const f of report.files ?? []) if (!seams.has(f)) now[`${f} (unreferenced module)`] = 1;
  for (const issue of report.issues ?? []) {
    const names = [...(issue.exports ?? []), ...(issue.types ?? [])].map((x) => x.name);
    const n = names.filter((name) => !readByPath(issue.file, name, texts)).length;
    if (n > 0) now[issue.file] = n;
    const unused =
      (issue.dependencies?.length ?? 0) + (issue.devDependencies?.length ?? 0) + (issue.catalog?.length ?? 0);
    if (unused > 0) now[`${issue.file} (unused dependencies)`] = unused;
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
