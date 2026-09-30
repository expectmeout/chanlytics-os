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
 * after it on the answer. It names every module a stack suite loads, followed
 * through its imports: database/db-paths-changed.test.mjs walks each suite and
 * fails one that loads a module outside it, so the list cannot fall behind the
 * suites again (on 29 Sep 2026, 41 of 101 suites loaded past it, and 11 main
 * commits that changed what they load skipped the replay).
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
  // the suites that run against the replayed database, in whichever domain folder they sit, and the helpers they share
  "tooling/scripts/tests/**/*.db.test.mjs",
  "tooling/scripts/tests/**/*.integration.test.mjs",
  "tooling/scripts/tests/_*.mjs",
  // what the suites run against it: the packages that write rows, their sources and the dists built from them (a change
  // to contracts or channels that reaches a suite through one of them rewrites that dist, and so replays)
  "packages/core/**",
  "packages/jobs/**",
  "packages/db/**",
  // the edge's doors and sweeps and what they call, and the dashboard's server, its database client and its routes
  "apps/edge/api/**",
  "apps/edge/lib/**",
  "apps/dashboard/src/server/**",
  "apps/dashboard/src/lib/**",
  "apps/dashboard/app/api/**",
  // what the two --check steps compare with the database: the closed sets, the types, and the unique keys the tests'
  // in-memory database refuses a duplicate on (db-types.mjs writes and checks both of the last two)
  "tooling/scripts/gen/schema-sets.mjs",
  "packages/contracts/src/schema-sets.generated.ts",
  "tooling/scripts/gen/db-types.mjs",
  "tooling/scripts/gen/unique-keys.mjs",
  "tooling/scripts/tests/_unique-keys.generated.json",
  // the ledger the migrations are held to, which a stack suite (migration-head) loads
  "tooling/scripts/checks/migration-ledger.mjs",
  // the workflow, this decision, and what the workflow installs
  ".github/workflows/database.yml",
  "tooling/scripts/checks/db-paths-changed.mjs",
  "tooling/scripts/checks/replay-range.mjs",
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
