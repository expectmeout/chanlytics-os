/**
 * The bundle of Ask's states page (ask-states.tsx), for the harness's `ask` record (server.mjs serves it at
 * /_hx/ask-states.js), built as the kit's running page is (kit-behaves.mjs): esbuild, the dashboard's own React, and the
 * surfaces from their source. Contracts' entries the app loads by import() are bundled in, as the mockup's are, since the
 * page has no chunks. React's production build runs: the recorder measures what the app draws.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const SRC = path.join(REPO, "apps/dashboard/src");
const DASHBOARD_MODULES = path.join(REPO, "apps/dashboard/node_modules");
const CONTRACTS = path.join(REPO, "packages/contracts/src/index.ts");

/** The page as one script. */
export async function buildAskStates() {
  const out = await build({
    entryPoints: [path.join(HERE, "ask-states.tsx")],
    absWorkingDir: REPO,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    write: false,
    logLevel: "error",
    alias: {
      react: path.join(DASHBOARD_MODULES, "react"),
      "react-dom": path.join(DASHBOARD_MODULES, "react-dom"),
      "@chanlytics/contracts/write-rules": path.join(REPO, "packages/contracts/src/write-rules.ts"),
      "@chanlytics/contracts/ask-only": path.join(REPO, "packages/contracts/src/ask-proposals/ask-only.ts"),
      "@chanlytics/contracts/page-specs": CONTRACTS,
      "@chanlytics/contracts": CONTRACTS,
      "@": SRC,
    },
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process = globalThis.process || { env: {} };" },
  });
  return out.outputFiles[0].text;
}
