/**
 * The one list of what the migrations replay depends on, and the question the
 * Database workflow asks of every pull request before it starts a Supabase stack.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { couldTheDatabaseHaveChanged } from "../../checks/db-paths-changed.mjs";

const CLI = fileURLToPath(new URL("../../checks/db-paths-changed.mjs", import.meta.url));
const ask = (files) => spawnSync(process.execPath, [CLI], { input: files.join("\n") + "\n", encoding: "utf8" });

test("a migration, a SQL suite, the checks' inputs or the lockfile could change what the replay proves", () => {
  for (const file of [
    "supabase/migrations/00123_a_new_rule.sql",
    "supabase/seed.sql",
    "supabase/config.toml",
    "tooling/scripts/tests/database/tenancy.db.test.mjs",
    "tooling/scripts/tests/reports/metrics.integration.test.mjs",
    "packages/db/src/repositories/calls.ts",
    // The reach-out engine the stack suites run end to end.
    "apps/edge/lib/reach-out/sender.ts",
    "apps/edge/lib/email/email-receipts.ts",
    "apps/edge/api/cron/reach-out.ts",
    "packages/core/src/campaigns/run-reach-out.ts",
    "packages/core/src/deliver.ts",
    "packages/jobs/src/handlers.ts",
    "apps/dashboard/src/server/ports/campaign-ports.ts",
    "packages/contracts/src/schema-sets.generated.ts",
    "tooling/scripts/gen/schema-sets.mjs",
    "tooling/scripts/gen/db-types.mjs",
    "tooling/scripts/gen/schema-snapshot.mjs",
    "supabase/schema.sql",
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
    ["apps/edge/api/whatsapp.ts", "docs/system-map.md", ".github/workflows/ci.yml"],
    ["tooling/scripts/tests/tenancy.test.mjs"],
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
