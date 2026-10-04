/**
 * What a pull request's change runs (tooling/scripts/checks/changed-tests.mjs, which ci.yml runs on every pull request):
 * a source file its domain's tests, a test file itself, the rules and ratchets always, and the whole suite when what
 * every test loads changed. Executed over the real folder names, so a folder renamed under tests is seen here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ALWAYS, testTargets } from "../../../checks/changed-tests.mjs";
import { ROOT } from "../../_source.mjs";

const FOLDERS = new Set(
  execFileSync("git", ["ls-files", "tooling/scripts/tests/*/**.test.mjs"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((f) => f.split("/")[3]),
);
const run = (...changed) => testTargets(changed, FOLDERS);

test("a source file runs the tests of every folder its path names, and the rules and ratchets always", () => {
  const { whole, targets } = run("packages/core/src/leads/cards.ts", "apps/edge/lib/receptionist/steer.ts");
  assert.equal(whole, false);
  for (const t of ALWAYS) assert.ok(targets.includes(t), t);
  for (const t of ["tooling/scripts/tests/leads", "tooling/scripts/tests/edge", "tooling/scripts/tests/receptionist"])
    assert.ok(targets.includes(t), t);
  assert.ok(!targets.includes("tooling/scripts/tests/people"), "nothing the change does not name");
});

test("a changed test runs itself; a folder already asked for covers it; a helper of a folder runs the folder", () => {
  assert.ok(
    run("tooling/scripts/tests/calendar/calendar-vm.test.mjs").targets.includes(
      "tooling/scripts/tests/calendar/calendar-vm.test.mjs",
    ),
  );
  const both = run(
    "tooling/scripts/tests/calendar/calendar-vm.test.mjs",
    "apps/dashboard/src/surfaces/calendar/surface.ts",
  );
  assert.ok(both.targets.includes("tooling/scripts/tests/calendar"));
  assert.ok(
    !both.targets.includes("tooling/scripts/tests/calendar/calendar-vm.test.mjs"),
    "the folder covers the file",
  );
  assert.ok(run("tooling/scripts/tests/leads/_mark-images.mjs").targets.includes("tooling/scripts/tests/leads"));
});

test("the runner, a shared helper at the tests' root or a stand-in every test loads runs the whole suite", () => {
  for (const f of [
    "tooling/scripts/checks/test.mjs",
    "tooling/scripts/checks/coverage.mjs",
    "tooling/scripts/tests/_fake-db.mjs",
    "tooling/scripts/tests/shared/_stand-in-base-ui.mjs",
    "tooling/scripts/tests/calendar/_stand-in-network.mjs",
  ])
    assert.equal(run(f).whole, true, f);
});

test("a migration runs the database folder, the phone app its own tests, a doc the history too, and a bump the rules alone", () => {
  assert.ok(run("supabase/migrations/00300_x.sql").targets.includes("tooling/scripts/tests/database"));
  assert.ok(run("apps/mobile/src/shell/Surface.tsx").targets.includes("apps/mobile/test"));
  assert.deepEqual(run("pnpm-lock.yaml", "package.json").targets, ALWAYS);
  assert.deepEqual(run("docs/decisions/README.md").targets, [...ALWAYS, "tooling/scripts/tests/history"]);
});
