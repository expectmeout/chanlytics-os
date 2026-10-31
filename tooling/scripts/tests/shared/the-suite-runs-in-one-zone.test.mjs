/**
 * `pnpm test` runs through one launcher (tooling/scripts/checks/test.mjs) that sets the zone before Node starts: UTC,
 * unless TEST_TZ names another. 18 of 628 time-related tests failed under Pacific/Auckland on 29 Sep 2026 and none under
 * UTC, where CI runs, so a laptop twelve hours east of CI saw a red suite CI never did.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CHANGES_A_TABLE, databasePasses, importsLeaveTheThread, planOf, SUITES, zoneOf } from "../../checks/test.mjs";

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
  const loader = [
    "--conditions=react-server",
    "--conditions=bundled",
    "--import",
    "tsx",
    "--import",
    "./tooling/scripts/tests/calendar/_stand-in-network.mjs",
    "--import",
    "./tooling/scripts/tests/shared/_stand-in-base-ui.mjs",
    "--import",
    "./tooling/scripts/tests/shared/_stand-in-css.mjs",
    "--test",
  ];
  // a full run is measured: the coverage flags sit between the loader and the files
  const full = args([]);
  assert.deepEqual([full.slice(0, loader.length), full.slice(-SUITES.test.length)], [loader, SUITES.test]);
  assert.ok(full.includes("--experimental-test-coverage"));
  assert.deepEqual(args(["--db"]).slice(0, loader.length), loader);
  // pnpm hands on the `--` that separates its own arguments from the script's
  assert.deepEqual(args(["--", PROBE]), [...loader, PROBE]);
  assert.deepEqual(args(["--test-name-pattern=zone", "tooling/scripts/tests/repo/"]), [
    ...loader,
    "--test-name-pattern=zone",
    "tooling/scripts/tests/repo/**/*.test.mjs",
  ]);
  // TEST_SLOW_IMPORTS=1 makes every import slow (tests/shared/_slow-imports.mjs), loaded before every file as the stand-ins are
  assert.deepEqual(planOf([PROBE], { TEST_SLOW_IMPORTS: "1" }).args, [
    ...loader.slice(0, -1),
    "--import",
    "./tooling/scripts/tests/shared/_slow-imports.mjs",
    "--test",
    PROBE,
  ]);
});

test("a database suite that changes a shared table's definition runs alone, after the rest, one at a time (31 Oct 2026)", () => {
  // What changes a table: a trigger made or dropped on one, a table altered or locked. A table named only in words, or
  // one of a schema the test made for itself, does not.
  for (const sql of [
    "create trigger __transfer_refused before insert on public.events",
    "drop trigger if exists __thread_decision_refused on public.decisions;",
    "alter table public.deals rename column lost_reason to lost_reason_x;",
    "lock table public.jobs in share row exclusive mode;",
  ])
    assert.ok(CHANGES_A_TABLE.test(sql), sql);
  for (const sql of [
    "a key that is not valid: validate it in a migration of its own (alter table <child> validate constraint <key>)",
    "create trigger t after insert on x for each row execute function touch();",
    "create function public.__refused() returns trigger language plpgsql",
  ])
    assert.equal(CHANGES_A_TABLE.test(sql), false, sql);

  const read = (f) => (f.includes("ledger") ? "create trigger x before insert on public.events" : "select 1");
  assert.deepEqual(databasePasses(["a.db.test.mjs", "the-ledger.db.test.mjs", "t/**/*.db.test.mjs"], read), {
    together: ["a.db.test.mjs", "t/**/*.db.test.mjs"],
    alone: ["the-ledger.db.test.mjs"],
  });

  // The whole run: every database suite in one pass or the other; the second one at a time, whatever the first's pace.
  const files = (args) => args.filter((a) => a.startsWith("tooling/scripts/tests/") && a.endsWith(".mjs"));
  const run = planOf(["--db", "--test-concurrency=3"], {});
  const [together, alone] = [files(run.args), files(run.alone ?? [])];
  assert.ok(together.length > 0 && alone.length > 0);
  for (const f of [...together, ...alone]) assert.match(f, /\.(db|integration)\.test\.mjs$/);
  assert.ok(
    alone.includes("tooling/scripts/tests/voice/calls/a-transferred-call-says-whether-it-was-answered.db.test.mjs"),
  );
  assert.ok(
    alone.includes("tooling/scripts/tests/conversations/state/take-over-and-hand-back-are-one-write.db.test.mjs"),
  );
  assert.ok(together.includes("tooling/scripts/tests/whatsapp/echo-replay.db.test.mjs"));
  assert.equal(together.filter((f) => alone.includes(f)).length, 0, "never both");
  assert.deepEqual(
    run.args.filter((a) => a.startsWith("--test-concurrency")),
    ["--test-concurrency=3"],
  );
  assert.deepEqual(
    run.alone.filter((a) => a.startsWith("--test-concurrency")),
    ["--test-concurrency=1"],
  );
  // Asked for alone: its one pass is one at a time, and there is no second.
  const one = planOf(["--db", alone[0]], {});
  assert.deepEqual(files(one.args), [alone[0]]);
  assert.ok(one.args.includes("--test-concurrency=1"));
  assert.equal(one.alone, null);
  // Not a database run: one pass, as ever.
  assert.equal(planOf([PROBE], {}).alone, null);
});

test("under TEST_SLOW_IMPORTS=1 an import a test makes waits where tsx loads off the main thread; where tsx loads in it, the launcher says so and runs nothing", () => {
  const env = { ...process.env, TEST_SLOW_IMPORTS: "1" };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, [LAUNCHER, "tooling/scripts/tests/fixtures/slow-import-probe.mjs"], {
    env,
    encoding: "utf8",
  });
  // Which this machine's Node is (Node 24 on CI loads in the main thread; an older Node off it): each says its own.
  if (importsLeaveTheThread()) {
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /^(?:ok 1 - |✔ )an import a test makes waits/m, "the probe ran, and passed");
  } else {
    assert.equal(run.status, 2, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /tsx loads modules in the main thread/, "said why nothing ran");
    assert.equal(run.stdout, "", "and no test ran");
  }
});

test("a full run in UTC is measured, and nothing else is: files, a flag, the db suites, a zone leg, TEST_COVERAGE=0", () => {
  const full = planOf([], {});
  assert.match(full.coverage, /chanlytics-\d+\.lcov$/);
  assert.ok(full.args.includes("--test-reporter=./tooling/scripts/checks/tap-reporter.mjs"));
  assert.ok(full.args.includes(`--test-reporter-destination=${full.coverage}`), "lcov goes to the file the plan names");
  assert.equal(full.held, true, "and the suite's floors judge it");
  // some files are measured only when asked to be, and no floor judges them; the database suites never
  const some = planOf([PROBE], { TEST_COVERAGE: "1" });
  assert.deepEqual([some.coverage !== null, some.held], [true, false]);
  assert.equal(planOf(["--db"], { TEST_COVERAGE: "1" }).coverage, null);
  assert.deepEqual([planOf([], { TEST_TZ: "Pacific/Auckland", TEST_COVERAGE: "1" }).held], [false]);
  // A part of the suite is measured where TEST_LCOV keeps its report, and no floor judges it alone; CI's parts, with no
  // TEST_LCOV, are not measured.
  const part = planOf(["--", "--test-shard=2/4"], { TEST_LCOV: "coverage-part.lcov" });
  assert.match(part.coverage.replaceAll("\\", "/"), /\/coverage-part\.lcov$/);
  assert.deepEqual([part.held, part.keep], [false, true]);
  assert.ok(part.args.includes("--test-shard=2/4") && part.args.includes("tooling/scripts/tests/**/*.test.mjs"));
  assert.equal(full.keep, false, "a whole run's report goes once it is judged");
  for (const [argv, env] of [
    [["--test-shard=2/4"], {}],
    [["--test-shard=2/4", "--test-name-pattern=zone"], { TEST_LCOV: "x.lcov" }],
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
    // A child of the suite's own runner is told so, and a runner started inside it then skips its files ("run() is
    // being called recursively"): without this the probe would never run, and the launcher's env could be anything.
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, [LAUNCHER, PROBE], { env, encoding: "utf8" });
    assert.equal(run.status, 0, `${zone}: ${run.stdout}\n${run.stderr}`);
    // TAP on Node 22 when stdout is a pipe, the spec reporter's tick on Node 24 (CI): either says the probe ran and passed.
    assert.match(run.stdout, /^(?:ok 1 - |✔ )the zone the launcher set/m, "the probe ran, and passed");
    assert.ok(run.stderr.includes(`the suite runs in ${zone}`), run.stderr);
  }
});
