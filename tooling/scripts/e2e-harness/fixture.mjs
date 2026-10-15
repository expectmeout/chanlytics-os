/**
 * The page's fixture, bundled for the browser.
 *
 * fixture-src.ts is browser code that imports the bridge and contracts from SOURCE -- the files the app itself
 * builds from -- so a change to either shows in the next run rather than in the next `packages/*` build. esbuild
 * resolves `@chanlytics/contracts` and `@` the way the dashboard's own build does, and the chosen scenario rides in
 * as a banner, so the page reads the very record the server answers from.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { OWNER, WORKSPACE } from "./scenarios.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

/** The fixture as one script, with the record (plain data) published for it to read. */
export async function buildFixture(record) {
  const out = await build({
    entryPoints: [path.join(HERE, "fixture-src.ts")],
    absWorkingDir: REPO,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    write: false,
    logLevel: "warning",
    alias: {
      // The schemas a page asks for by import() (contracts' write-rules entry), bundled in, as the fixture has no chunks.
      "@chanlytics/contracts/write-rules": "./packages/contracts/src/write-rules.ts",
      // The kinds only Ask's cards commit, which the verb walk asks for by import() (contracts' ask-only entry).
      "@chanlytics/contracts/ask-only": "./packages/contracts/src/ask-proposals/ask-only.ts",
      "@chanlytics/contracts": "./packages/contracts/src/index.ts",
      "@": "./apps/dashboard/src",
    },
    banner: {
      js:
        `window.__HX_SCENARIO = ${JSON.stringify(record)};` +
        `window.__HX_WORKSPACE = ${JSON.stringify(WORKSPACE)};` +
        `window.__HX_OWNER = ${JSON.stringify(OWNER)};` +
        "var process = globalThis.process || { env: {} };",
    },
  });
  return out.outputFiles[0].text;
}
