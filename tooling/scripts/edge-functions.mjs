#!/usr/bin/env node
/**
 * Build the edge's functions and hand them to Vercel finished, in the Build Output API's own shape.
 *
 * Vercel's Node builder compiled the edge's 65 functions one after another, each through a type-checking language
 * service of its own (16 Oct 2026: about 6.5 s a function, seven minutes a deploy, whatever the tsconfig said; a smaller
 * program a function saved 48 s of it, on #1643's preview). esbuild bundles all of them in seconds. The types are CI's typecheck's to check
 * (apps/edge/tsconfig.json, every function): this only builds.
 *
 *   - Each apps/edge/api/**.ts is a function at its own path, as Vercel's zero-config made it (functionFiles): one ESM
 *     file with all it imports, its source map beside it.
 *   - Its .vc-config.json is what Vercel's builder wrote (vcConfig), with the runtime from .nvmrc and the function's
 *     time limit from apps/edge/vercel.json (edgeFunctions), where the tests read it too.
 *   - public/ is the static, and config.json routes as Vercel's zero-config routed the edge (ROUTES).
 *
 * Vercel runs it as the edge's `vercel-build` (apps/edge/package.json), through the one static build in
 * apps/edge/vercel.json's `builds`, and deploys apps/edge/.vercel/output as it is.
 *
 *   node tooling/scripts/edge-functions.mjs        build into apps/edge/.vercel/output
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EDGE = path.join(ROOT, "apps/edge");
const OUT = path.join(EDGE, ".vercel/output");

/** Each function's time limit, by its file (`api/jobs/tick.ts`): apps/edge/vercel.json's one static build holds them. */
export function edgeFunctions() {
  return JSON.parse(fs.readFileSync(path.join(EDGE, "vercel.json"), "utf8")).builds[0].config.functions;
}

/** Every function's file, as zero-config found them: each api/**.ts but a declaration or a name begun with `_` or `.`. */
export function functionFiles(dir = "api") {
  return fs
    .readdirSync(path.join(EDGE, dir), { withFileTypes: true })
    .filter((e) => !/^[_.]/.test(e.name))
    .flatMap((e) =>
      e.isDirectory()
        ? functionFiles(`${dir}/${e.name}`)
        : e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")
          ? [`${dir}/${e.name}`]
          : [],
    )
    .sort();
}

/** What Vercel's Node builder wrote in a function's .vc-config.json (@vercel/node 5.7, 16 Oct 2026), its file here. */
export function vcConfig(maxDuration, nodeMajor) {
  return {
    handler: "index.js",
    runtime: `nodejs${nodeMajor}.x`,
    architecture: "x86_64",
    ...(maxDuration ? { maxDuration } : {}),
    environment: {},
    shouldDisableAutomaticFetchInstrumentation: false,
    launcherType: "Nodejs",
    shouldAddHelpers: true,
    shouldAddSourcemapSupport: true,
    awsLambdaHandler: "",
  };
}

/**
 * The routes Vercel's zero-config gave the edge (`vercel build`'s config.json, 16 Oct 2026): a file or a function by
 * its path, a 404 for any other /api path, and `/api/x.ts` answered as `/api/x`.
 */
export const ROUTES = [
  { handle: "filesystem" },
  { src: "^/api(/.*)?$", status: 404 },
  { handle: "error" },
  { status: 404, src: "^(?!/api).*$", dest: "/404.html" },
  { handle: "miss" },
  { src: "^/api/(.+)(?:\\.(?:ts))$", dest: "/api/$1", check: true },
];

/** The Node the functions run on: .nvmrc's major, as the project's Node setting is (24.x). */
export const nodeMajor = () =>
  fs.readFileSync(path.join(ROOT, ".nvmrc"), "utf8").trim().replace(/^v/, "").split(".")[0];

// A bundled CommonJS module may still require a builtin, which an ES module has no `require` for.
const REQUIRE =
  'import { createRequire as __edgeRequire } from "node:module"; const require = __edgeRequire(import.meta.url);';

/** Build the functions (every one, or those named) and the rest of the output into `out`, emptied first. */
export async function buildEdge({ out = OUT, files = functionFiles() } = {}) {
  const started = Date.now();
  const esbuild = createRequire(path.join(ROOT, "package.json"))("esbuild");
  const limits = edgeFunctions();
  const major = nodeMajor();
  const funcDir = (file) => path.join(out, "functions", `${file.replace(/\.ts$/, "")}.func`);
  fs.rmSync(out, { recursive: true, force: true });
  await esbuild.build({
    absWorkingDir: EDGE,
    entryPoints: Object.fromEntries(files.map((f) => [`${f.replace(/\.ts$/, "")}.func/index`, path.join(EDGE, f)])),
    outdir: path.join(out, "functions"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: `node${major}`,
    // A stack trace names the file and line; the sources stay out of the maps, and the names in the code (a fourth
    // the size of it all, 150 MiB, not 623: each function is its own bundle, where Vercel's were shared files).
    sourcemap: true,
    sourcesContent: false,
    minifyWhitespace: true,
    minifySyntax: true,
    banner: { js: REQUIRE },
    logLevel: "warning",
  });
  for (const file of files) {
    fs.writeFileSync(path.join(funcDir(file), "package.json"), '{ "type": "module" }\n');
    fs.writeFileSync(
      path.join(funcDir(file), ".vc-config.json"),
      `${JSON.stringify(vcConfig(limits[file]?.maxDuration, major), null, 2)}\n`,
    );
  }
  fs.cpSync(path.join(EDGE, "public"), path.join(out, "static"), { recursive: true });
  fs.writeFileSync(
    path.join(out, "config.json"),
    `${JSON.stringify({ version: 3, routes: ROUTES, crons: [] }, null, 2)}\n`,
  );
  console.log(`edge-functions: ${files.length} functions in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildEdge();
