/**
 * Could this change have changed the database?
 *
 * database.yml replays every migration from zero on a fresh Postgres and runs
 * the SQL suites against it. That costs a Supabase stack, so the replay runs
 * only when a change touches something it depends on. The check itself reports
 * on every pull request, so branch protection can require it: a pull request
 * that leaves the database alone gets one sentence and a pass, instead of a
 * check that never arrives and a merge that waits forever.
 *
 * This list is the only copy. The workflow's first step pipes the changed files
 * in, for a pull request and for a push to main alike, and gates every step
 * after it on the answer.
 *
 * Patterns read the way GitHub reads `paths` filters: `**` crosses directories,
 * `*` does not, and a pattern with no directory matches at the root only.
 *
 * Usage: git diff --name-only origin/main...HEAD | node tooling/scripts/checks/db-paths-changed.mjs
 * Prints db=true or db=false on stdout, for $GITHUB_OUTPUT, and the reason on
 * stderr, for the log. The answer is never an exit code: a crash exits non-zero
 * too, and a crash read as "not needed" would skip the replay it exists to run.
 */
import { pathToFileURL } from "node:url";

export const DB_PATHS = [
  // the migrations, the seed and the config the local stack starts from
  "supabase/**",
  // the suites that run against the replayed database, in whichever domain folder they sit
  "tooling/scripts/tests/**/*.db.test.mjs",
  "tooling/scripts/tests/**/*.integration.test.mjs",
  // the *.integration suites call the db package's repositories, through its committed dist
  "packages/db/src/**",
  // the reach-out engine the stack suites run end to end (the clock, the sender, the door by lead, the approve ports):
  // a change to it alone must replay what proves it
  "apps/edge/lib/reach-out/**",
  "apps/edge/lib/email/**",
  "apps/edge/api/cron/reach-out.ts",
  "packages/core/src/campaigns/**",
  "packages/core/src/deliver.ts",
  "packages/jobs/src/handlers.ts",
  "apps/dashboard/src/server/ports/campaign-ports.ts",
  // what the --check steps and the snapshot suite compare with the database (supabase/schema.sql is under supabase/)
  "tooling/scripts/gen/schema-sets.mjs",
  "packages/contracts/src/schema-sets.generated.ts",
  "tooling/scripts/gen/db-types.mjs",
  "tooling/scripts/gen/schema-snapshot.mjs",
  // the workflow, this decision, and what the workflow installs
  ".github/workflows/database.yml",
  "tooling/scripts/checks/db-paths-changed.mjs",
  "package.json",
  "pnpm-lock.yaml",
];

const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
const toRegExp = (glob) =>
  new RegExp(
    "^" +
      glob
        .split("**")
        .map((part) => part.split("*").map(escape).join("[^/]*"))
        .join(".*") +
      "$",
  );
const MATCHERS = DB_PATHS.map(toRegExp);

/** The first of these repository paths the replay depends on, or null. */
export function firstDatabasePath(files) {
  return files.find((file) => MATCHERS.some((m) => m.test(file))) ?? null;
}

/** Whether any of these repository paths could change what the replay proves. */
export function couldTheDatabaseHaveChanged(files) {
  return firstDatabasePath(files) !== null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  const files = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hit = firstDatabasePath(files);
  if (hit) {
    console.error(`${hit} is something the replay depends on, so the migrations replay from zero.`);
    console.log("db=true");
  } else {
    console.error(`None of the ${files.length} changed files can change the database, so the replay is not needed.`);
    console.log("db=false");
  }
}
