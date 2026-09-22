/**
 * Installs the git hooks (husky) after `pnpm install`, and only where hooks
 * make sense.
 *
 * `prepare` runs on every install: a laptop, a worktree, CI, and Vercel's
 * build container. Only the first two have a repository to hook, and a
 * failure here would fail the install, which on Vercel is a failed deploy of
 * the live edge for the sake of a formatting hook. So this never throws: it
 * skips on CI and on Vercel, skips when HUSKY=0, skips without a .git, and
 * otherwise sets core.hooksPath to .husky/_ so the pre-commit in .husky runs.
 */
import { existsSync } from "node:fs";

const skip =
  process.env.CI === "true" || process.env.VERCEL === "1" || process.env.HUSKY === "0" || !existsSync(".git");

if (!skip) {
  try {
    const { default: husky } = await import("husky");
    const out = husky();
    if (out) console.log(out);
  } catch (e) {
    console.log(`hooks not installed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
