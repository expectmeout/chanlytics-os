/**
 * Dist-drift guard: the edge executes packages/*/dist (committed), so a source
 * edit without a rebuild ships stale logic silently. Rebuilds and fails when
 * the committed dist differs from what src produces.
 */
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: new URL("../..", import.meta.url) });

run('corepack pnpm --filter "./packages/*" build');
try {
  run("git diff --exit-code -- packages/*/dist");
  console.log("dist in sync with src");
} catch {
  console.error("\nDIST DRIFT: packages/*/dist differs from a fresh build. Commit the rebuilt dist.");
  process.exit(1);
}
