#!/usr/bin/env node
/**
 * The end of the edge's install on Vercel (apps/edge/vercel.json `installCommand`, after `pnpm install`): TypeScript's
 * `noCheck` on the edge's tsconfig, in Vercel's own checkout, before the functions are compiled. The install and not a
 * build command, because the edge's project has no framework preset, where a build command makes Vercel look for a
 * `public` folder of output the edge does not have.
 *
 * Vercel's Node builder type-checks every function as it compiles it, one language service per file, and reports what it
 * finds as warnings it never fails on: 16 Oct 2026, the edge took 7 to 7.5 minutes to build on every push, against the
 * dashboard's 1 to 2, and about four of them were those checks. The type check that holds is CI's (`pnpm -r typecheck`,
 * required before a merge), over the same tsconfig without this, so nothing it would have caught reaches production
 * unchecked. With `noCheck` the builder only emits each file (isolatedModules holds every file to what a transpiler sees).
 *
 * Only on Vercel (VERCEL=1): anywhere else it changes nothing, so a laptop or CI that runs it by mistake keeps its checks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TSCONFIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/edge/tsconfig.json");

/** The tsconfig with `noCheck` set, everything else as it was. */
export function withNoCheck(config) {
  return { ...config, compilerOptions: { ...(config.compilerOptions ?? {}), noCheck: true } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.VERCEL !== "1") {
    console.log("edge-build-no-check: not on Vercel, so the edge's tsconfig is left as it is");
  } else {
    const config = JSON.parse(fs.readFileSync(TSCONFIG, "utf8"));
    fs.writeFileSync(TSCONFIG, JSON.stringify(withNoCheck(config), null, 2) + "\n");
    console.log("edge-build-no-check: noCheck set on apps/edge/tsconfig.json; CI's typecheck is the check");
  }
}
