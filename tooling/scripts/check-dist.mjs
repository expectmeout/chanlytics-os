/**
 * Dist-drift guard: the edge executes packages/*\/dist (committed), so a source
 * edit without a rebuild ships stale logic silently. Rebuilds, then fails if
 * the committed dist differs from a fresh build.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: repoRoot });

run('corepack pnpm --filter "./packages/*" build');
try {
  run("git diff --exit-code -- packages");
  console.log("dist in sync with src");
} catch {
  console.error("\nDIST DRIFT: packages/*/dist differs from a fresh build. Commit the rebuilt dist.");
  process.exit(1);
}
