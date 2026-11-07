/**
 * Could this change have changed what the kit gallery's fast checks read?
 *
 * e2e/kit/kit.spec.ts holds every class and selector of kit.css to a gallery entry that draws it, and for five weeks
 * nothing ran it but a person: 15 undrawn selectors appeared in the five days to 4 Nov 2026, each on a pull request
 * that could have named it. The whole spec takes 10.7 minutes on a quiet laptop, past Ruben's ten for a push before a
 * runner has set up, so ci.yml's `kit` job runs the checks that take seconds, for a pull request that changes what they
 * read: about 15% of main's commits (93 of 630 in the 30 days to 6 Nov 2026). The job itself still reports on every pull
 * request: one that leaves these files alone gets one sentence and a pass. nightly-kit.yml runs both kit specs whole,
 * which is what catches a change that reaches the gallery any other way (a page's stylesheet over a kit rule).
 *
 * What the fast checks read:
 *
 *   the kit's rules and names    kit.css, classes.json
 *   the values they read         tokens.css
 *   what draws them              kit-gallery.mjs, kit-shared.mjs
 *   what checks them             e2e/kit
 *   this decision                the workflow and this script
 *
 * Usage: git diff --name-only HEAD^1 HEAD | node tooling/scripts/e2e-harness/kit-paths-changed.mjs
 * Prints kit=true or kit=false on stdout, for $GITHUB_OUTPUT, and the reason on stderr, for the log. The answer is never
 * an exit code: a crash exits non-zero too, and a crash read as "not needed" would skip the checks it exists to run.
 */
import { pathToFileURL } from "node:url";

/** What the fast checks read: a path ending in `/` is everything under it. */
export const KIT_PATHS = [
  "apps/dashboard/src/surfaces/kit/kit.css",
  "apps/dashboard/src/surfaces/kit/classes.json",
  "apps/dashboard/src/styles/tokens.css",
  "tooling/scripts/e2e-harness/kit-gallery.mjs",
  "tooling/scripts/e2e-harness/kit-shared.mjs",
  "e2e/kit/",
  ".github/workflows/ci.yml",
  "tooling/scripts/e2e-harness/kit-paths-changed.mjs",
];

/** The first of these repository paths the fast checks read, or null. */
export function firstKitPath(files) {
  return files.find((file) => KIT_PATHS.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p))) ?? null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  const files = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hit = firstKitPath(files);
  if (hit) {
    console.error(`${hit} is something the kit gallery's fast checks read, so they run.`);
    console.log("kit=true");
  } else {
    console.error(
      `None of the ${files.length} changed files is one the kit gallery's fast checks read, so they do not run.`,
    );
    console.log("kit=false");
  }
}
