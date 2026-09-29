/**
 * The running page's bundle (kit-behaves.tsx), for the harness's `kit` record (server.mjs serves it at
 * /_hx/kit-behaves.js, and the page at /behaves).
 *
 * esbuild bundles the page with the kit's components from their source, as the dashboard's own build takes them, and
 * with the dashboard's React and React DOM (apps/dashboard/node_modules), the copies the app runs: every import of
 * `react` or `react-dom`, Base UI's included, is aliased to them, so one React draws the page. Base UI is the one
 * pinned in apps/dashboard/package.json. Contracts is the dashboard's, its committed build.
 * React's development build runs, so a warning a component raises (a key, a ref) reaches the console, where the
 * spec reads it.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const DASHBOARD_MODULES = path.join(REPO, "apps/dashboard/node_modules");

/** The page as one script. */
export async function buildBehaves() {
  const out = await build({
    entryPoints: [path.join(HERE, "kit-behaves.tsx")],
    absWorkingDir: REPO,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    write: false,
    logLevel: "warning",
    alias: {
      react: path.join(DASHBOARD_MODULES, "react"),
      "react-dom": path.join(DASHBOARD_MODULES, "react-dom"),
    },
    define: { "process.env.NODE_ENV": '"development"' },
  });
  return out.outputFiles[0].text;
}
