/**
 * `pnpm test` runs through one launcher (tooling/scripts/checks/test.mjs) that sets the zone before Node starts: UTC,
 * unless TEST_TZ names another. 18 of 628 time-related tests failed under Pacific/Auckland on 29 Sep 2026 and none under
 * UTC, where CI runs, so a laptop twelve hours east of CI saw a red suite CI never did.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { planOf, SUITES, zoneOf } from "../../checks/test.mjs";

const LAUNCHER = fileURLToPath(new URL("../../checks/test.mjs", import.meta.url));
const PROBE = "tooling/scripts/tests/fixtures/zone-probe.mjs";

test("the suite runs in UTC unless TEST_TZ names a zone, and a zone Node does not know is refused", () => {
  assert.equal(zoneOf({}), "UTC");
  assert.equal(zoneOf({ TEST_TZ: "  " }), "UTC");
  assert.equal(zoneOf({ TEST_TZ: "Pacific/Auckland" }), "Pacific/Auckland");
  assert.throws(() => zoneOf({ TEST_TZ: "Nowhere/Land" }), /not a zone this Node knows/);
  // The machine's own TZ is not the suite's: a laptop's zone never leaks into a run.
  assert.equal(planOf([], { TZ: "America/New_York" }).env.TZ, "UTC");
});

test("with no files it runs the suite; files, globs and directories asked for replace it; flags pass through", () => {
  const args = (argv) => planOf(argv, {}).args;
  const loader = ["--conditions=react-server", "--import", "tsx", "--test"];
  // a full run is measured: the coverage flags sit between the loader and the files
  const full = args([]);
  assert.deepEqual([full.slice(0, loader.length), full.slice(-SUITES.test.length)], [loader, SUITES.test]);
  assert.ok(full.includes("--experimental-test-coverage"));
  assert.deepEqual(args(["--db"]), [...loader, ...SUITES.db]);
  // pnpm hands on the `--` that separates its own arguments from the script's
  assert.deepEqual(args(["--", PROBE]), [...loader, PROBE]);
  assert.deepEqual(args(["--test-name-pattern=zone", "tooling/scripts/tests/repo/"]), [
    ...loader,
    "--test-name-pattern=zone",
    "tooling/scripts/tests/repo/**/*.test.mjs",
  ]);
});

test("a full run in UTC is measured, and nothing else is: files, a flag, the db suites, a zone leg, TEST_COVERAGE=0", () => {
  const full = planOf([], {});
  assert.match(full.coverage, /chanlytics-\d+\.lcov$/);
  assert.ok(full.args.includes("--test-reporter=./tooling/scripts/checks/tap-reporter.mjs"));
  assert.ok(full.args.includes(`--test-reporter-destination=${full.coverage}`), "lcov goes to the file the plan names");
  for (const [argv, env] of [
    [[PROBE], {}],
    [["--test-name-pattern=zone"], {}],
    [["--db"], {}],
    [[], { TEST_TZ: "Pacific/Auckland" }],
    [[], { TEST_TZ: "UTC" }],
    [[], { TEST_COVERAGE: "0" }],
  ]) {
    const plan = planOf(argv, env);
    assert.equal(plan.coverage, null, JSON.stringify([argv, env]));
    assert.equal(plan.args.includes("--experimental-test-coverage"), false, JSON.stringify([argv, env]));
  }
});

test("a run's children see the zone: UTC by default, and TEST_TZ's when it is set", () => {
  // 12:00 UTC on 21 September is the 21st in UTC and already the 22nd in Auckland.
  for (const [zone, day] of [
    ["UTC", 21],
    ["Pacific/Auckland", 22],
  ]) {
    const env = { ...process.env, EXPECT_ZONE: zone, EXPECT_DAY: String(day), TZ: "America/New_York" };
    if (zone === "UTC") delete env.TEST_TZ;
    else env.TEST_TZ = zone;
    const run = spawnSync(process.execPath, [LAUNCHER, PROBE], { env, encoding: "utf8" });
    assert.equal(run.status, 0, `${zone}: ${run.stdout}\n${run.stderr}`);
    assert.ok(run.stderr.includes(`the suite runs in ${zone}`), run.stderr);
  }
});
