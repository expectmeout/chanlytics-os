/**
 * The one list of what the migrations replay depends on, and the question the
 * Database workflow asks of every pull request before it starts a Supabase stack.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { couldTheDatabaseHaveChanged } from "../../checks/db-paths-changed.mjs";
import { ROOT } from "../_source.mjs";
import { loadedBy } from "../_loads.mjs";

const CLI = fileURLToPath(new URL("../../checks/db-paths-changed.mjs", import.meta.url));
const ask = (files) => spawnSync(process.execPath, [CLI], { input: files.join("\n") + "\n", encoding: "utf8" });

test("a migration, a SQL suite, the checks' inputs or the lockfile could change what the replay proves", () => {
  for (const file of [
    "supabase/migrations/00123_a_new_rule.sql",
    "supabase/seed.sql",
    "supabase/config.toml",
    "tooling/scripts/tests/database/tenancy.db.test.mjs",
    "tooling/scripts/tests/reports/metrics.integration.test.mjs",
    "tooling/scripts/tests/_second-factor.mjs",
    "packages/db/src/repositories/calls.ts",
    "packages/db/dist/index.js",
    // What the suites run against the stack: core, jobs, the edge, the dashboard's server and routes. Each of these
    // skipped the replay on main while a suite loaded it (06ebd0a2f, 00e310ef5, 65b12330a).
    "packages/core/src/inbound/answer-inbound.ts",
    "packages/core/dist/index.js",
    "packages/jobs/src/broadcast-send.ts",
    "packages/jobs/dist/index.js",
    "apps/edge/api/cron/calls.ts",
    "apps/edge/lib/billing/billing.ts",
    "apps/edge/lib/reach-out/sender.ts",
    "apps/dashboard/src/server/people/erasure/erasure.ts",
    "apps/dashboard/src/lib/supabase/server.ts",
    "apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts",
    "packages/contracts/src/schema-sets.generated.ts",
    "tooling/scripts/gen/schema-sets.mjs",
    "tooling/scripts/gen/db-types.mjs",
    ".github/workflows/database.yml",
    "tooling/scripts/checks/db-paths-changed.mjs",
    "package.json",
    "pnpm-lock.yaml",
  ]) {
    assert.equal(couldTheDatabaseHaveChanged([file]), true, file);
  }
});

test("a change that leaves the database alone does not start a stack", () => {
  for (const files of [
    [],
    ["apps/dashboard/src/x.tsx"],
    ["apps/dashboard/src/legacy/pages/inbox.jsx", "docs/system-map.md", ".github/workflows/ci.yml"],
    ["tooling/scripts/tests/tenancy.test.mjs"],
    ["packages/contracts/src/calendar/calendar-words.ts", "packages/contracts/dist/index.js"],
    ["packages/channels/src/lines/sms.ts", "packages/channels/dist/index.js"],
  ]) {
    assert.equal(couldTheDatabaseHaveChanged(files), false, files.join(", ") || "no files");
  }
});

test("patterns read the way GitHub reads paths filters", () => {
  // ** crosses directories
  assert.equal(couldTheDatabaseHaveChanged(["packages/db/src/deep/nested/file.ts"]), true);
  // and the suites sit in domain folders, at any depth
  assert.equal(couldTheDatabaseHaveChanged(["tooling/scripts/tests/nested/x.db.test.mjs"]), true);
  assert.equal(couldTheDatabaseHaveChanged(["tooling/scripts/tests/nested/deeper/x.integration.test.mjs"]), true);
  // * does not: a helper is one at the root of the tests
  assert.equal(couldTheDatabaseHaveChanged(["tooling/scripts/tests/nested/_world.mjs"]), false);
  // a pattern with no directory matches at the root only
  assert.equal(couldTheDatabaseHaveChanged(["apps/dashboard/package.json"]), false);
  // a dot is a dot
  assert.equal(couldTheDatabaseHaveChanged(["pnpm-lockxyaml"]), false);
});

test("the workflow reads the answer from stdout and the reason from the log", () => {
  const yes = ask(["apps/dashboard/src/x.tsx", "supabase/migrations/00123_a_new_rule.sql"]);
  assert.equal(yes.status, 0, yes.stderr);
  assert.equal(yes.stdout.trim(), "db=true");
  assert.match(yes.stderr, /supabase\/migrations\/00123_a_new_rule\.sql is something the replay depends on/);

  const no = ask(["apps/dashboard/src/x.tsx", "docs/system-map.md"]);
  assert.equal(no.status, 0, no.stderr);
  assert.equal(no.stdout.trim(), "db=false");
  assert.match(no.stderr, /None of the 2 changed files can change the database/);

  const nothing = ask([]);
  assert.equal(nothing.status, 0, nothing.stderr);
  assert.equal(nothing.stdout.trim(), "db=false");
});

/**
 * What a stack suite loads and the list may leave out, each with why. Contracts is words and shapes, pure functions
 * with no database in them; the one database fact it holds, the CHECK sets, is schema-sets.generated.ts, which the
 * list names. Channels is the providers' wires. Either reaches a suite's rows only through core, jobs or db, whose dists
 * a change to it rewrites (they bundle both), so the replay runs when it matters and not on every change of a word.
 */
const NOT_THE_DATABASE = [
  [/^packages\/contracts\/(src|dist)\//, "contracts: words and shapes; its CHECK sets are on the list"],
  [/^packages\/channels\/(src|dist)\//, "channels: the providers' wires; core and jobs bundle what they use"],
];

test("every module a stack suite loads, followed through its imports, is on the list", () => {
  const suites = execFileSync("git", ["ls-files", "tooling/scripts/tests"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => /\.(db|integration)\.test\.mjs$/.test(f));
  assert.ok(suites.length > 50, `found only ${suites.length} stack suites: is this the repository's tree?`);
  const outside = new Map();
  for (const suite of suites) {
    for (const file of loadedBy(suite)) {
      if (couldTheDatabaseHaveChanged([file]) || NOT_THE_DATABASE.some(([re]) => re.test(file))) continue;
      outside.set(file, [...(outside.get(file) ?? []), suite]);
    }
  }
  assert.deepEqual(
    [...outside].map(
      ([file, by]) => `${file} (loaded by ${by[0]}${by.length > 1 ? ` and ${by.length - 1} more` : ""})`,
    ),
    [],
    "a stack suite loads these, and a change to one would skip the replay: add their tree to DB_PATHS " +
      "(tooling/scripts/checks/db-paths-changed.mjs), or to NOT_THE_DATABASE here with why",
  );
});
