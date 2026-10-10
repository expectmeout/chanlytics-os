/**
 * What a pull request's change runs (tooling/scripts/checks/changed-tests.mjs, which ci.yml runs on every pull request
 * and database.yml for its database suites): a source file its domain's tests, a test file itself, the rules and
 * ratchets always, and never the whole suite (Ruben, 10 Oct 2026: under ten minutes). Executed over the real folder
 * names, so a folder renamed under tests is seen here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ALWAYS, databaseSuitesOf, isDatabaseSuite, testTargets } from "../../../checks/changed-tests.mjs";
import { ROOT } from "../../_source.mjs";

const FOLDERS = new Set(
  execFileSync("git", ["ls-files", "tooling/scripts/tests/*/**.test.mjs"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((f) => f.split("/")[3]),
);
const run = (...changed) => testTargets(changed, FOLDERS);

test("a source file runs the tests of every folder its path names, and the rules and ratchets always", () => {
  const targets = run("packages/core/src/leads/cards.ts", "apps/edge/lib/receptionist/steer.ts");
  for (const t of ALWAYS) assert.ok(targets.includes(t), t);
  for (const t of ["tooling/scripts/tests/leads", "tooling/scripts/tests/edge", "tooling/scripts/tests/receptionist"])
    assert.ok(targets.includes(t), t);
  assert.ok(!targets.includes("tooling/scripts/tests/people"), "nothing the change does not name");
});

test("a changed test runs itself; a folder already asked for covers it; a helper of a folder runs the folder", () => {
  assert.ok(
    run("tooling/scripts/tests/calendar/calendar-vm.test.mjs").includes(
      "tooling/scripts/tests/calendar/calendar-vm.test.mjs",
    ),
  );
  const both = run(
    "tooling/scripts/tests/calendar/calendar-vm.test.mjs",
    "apps/dashboard/src/surfaces/calendar/surface.ts",
  );
  assert.ok(both.includes("tooling/scripts/tests/calendar"));
  assert.ok(!both.includes("tooling/scripts/tests/calendar/calendar-vm.test.mjs"), "the folder covers the file");
  assert.ok(run("tooling/scripts/tests/leads/_mark-images.mjs").includes("tooling/scripts/tests/leads"));
});

test("the runner, a shared helper at the tests' root or a stand-in runs the rules and ratchets, never the whole suite", () => {
  // 10 Oct 2026: one line in tests/_legacy-react.mjs ran #1539's whole suite, 21 to 40 minutes, past CI's cap. The
  // nightly runs everything; a pull request that wants it asks with the `suite` label.
  for (const f of ["tooling/scripts/tests/_fake-db.mjs", "tooling/scripts/tests/_legacy-react.mjs"])
    assert.deepEqual(run(f), ALWAYS, f);
  for (const f of ["tooling/scripts/checks/test.mjs", "tooling/scripts/checks/coverage.mjs"])
    assert.deepEqual(run(f), [...ALWAYS, "tooling/scripts/tests/checks"], `${f}: the runner's own tests`);
  assert.ok(run("tooling/scripts/tests/shared/_stand-in-base-ui.mjs").includes("tooling/scripts/tests/shared"));
});

test("a migration runs the database folder, the phone app its own tests, a doc the history too, and a bump the rules alone", () => {
  assert.ok(run("supabase/migrations/00300_x.sql").includes("tooling/scripts/tests/database"));
  assert.ok(run("apps/mobile/src/shell/Surface.tsx").includes("apps/mobile/test"));
  assert.deepEqual(run("pnpm-lock.yaml", "package.json"), ALWAYS);
  assert.deepEqual(run("docs/decisions/README.md"), [...ALWAYS, "tooling/scripts/tests/history"]);
});

test("--db runs the database suites that lie where the change names, and nothing for a change that names none", () => {
  const suites = execFileSync("git", ["ls-files", "tooling/scripts/tests/**.test.mjs"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(isDatabaseSuite);
  assert.ok(suites.length > 50, "the repository's database suites were read");
  assert.ok(
    suites.every((f) => /\.(db|integration)\.test\.mjs$/.test(f)),
    "only `pnpm test:db`'s two globs",
  );
  const migration = databaseSuitesOf(run("supabase/migrations/00300_x.sql"), suites);
  assert.ok(migration.length > 0 && migration.some((f) => f.startsWith("tooling/scripts/tests/database/")));
  assert.ok(
    migration.every((f) => [...ALWAYS, "tooling/scripts/tests/database"].some((t) => f.startsWith(`${t}/`))),
    "nothing outside what the change names",
  );
  const reports = databaseSuitesOf(run("packages/db/src/repositories/reports/report-series.ts"), suites);
  assert.ok(
    reports.some((f) => f.startsWith("tooling/scripts/tests/reports/")),
    "the domain's own suites",
  );
  const one = "tooling/scripts/tests/reports/report-series.db.test.mjs";
  assert.deepEqual(databaseSuitesOf([one, "tooling/scripts/tests/reports/reports-vm.test.mjs"], suites), [one]);
});
