/**
 * The node suite's one launcher: `pnpm test` and `pnpm test:db` run through it, so every run sees the same clock, and a
 * full run says what it ran of the code.
 *
 * A test that builds a date with no zone, or reads a day in the machine's zone, passes on the laptop it was written on
 * and fails on one twelve hours away: 29 tests failed under Pacific/Auckland on 29 Sep 2026, and none under UTC, where
 * CI runs. So the suite runs in one zone everywhere, UTC unless `TEST_TZ` names another. The zone is set in the
 * child's environment before Node starts, which is the one way that holds on every platform (Git Bash strips a `TZ=`
 * it is handed on its way to a Windows program; a `process.env.TZ` set after start is too late for a module that read
 * the clock at import).
 *
 *   corepack pnpm test                                     the node suite, in UTC, and what it ran of the code
 *   corepack pnpm test -- tooling/scripts/tests/calendar   only these files or globs (a directory is every test in it)
 *   TEST_TZ=Pacific/Auckland corepack pnpm test            the whole suite, twelve hours east (PowerShell:
 *                                                          $env:TEST_TZ='Pacific/Auckland'; corepack pnpm test)
 *   corepack pnpm test:db                                  the stack suites, in the same zone
 *
 * A flag (`--test-name-pattern=...`, `--test-only`) goes to Node's runner as it is.
 *
 * The packages. A test reads each package as its bundle, built here first when its sources moved
 * (tooling/scripts/package-build.mjs, about a second), by the `bundled` export condition the run passes to Node and to
 * every script a test starts.
 *
 * Coverage. A full run in UTC (no files asked, no flag, no TEST_TZ: a zone leg is about the clock) has Node measure
 * what the suite ran of the code, and prints it per package and per tree with each held floor
 * (tooling/scripts/checks/coverage.mjs). Under a floor is a red run. `UPDATE_BASELINES=1` (or `raise`) raises a floor
 * the suite has cleared with room to spare; `COVERAGE_FLOORS=lower` is the one way a floor falls, argued under "Rises"
 * in docs/debt.md. `TEST_COVERAGE=0` skips the measure for a full run that wants the speed, and `TEST_COVERAGE=1`
 * measures a run of some files (the table only: a floor is the suite's, not theirs).
 *
 * A part of the suite, `corepack pnpm test -- --test-shard=2/4` with `TEST_LCOV=<file>`, is measured and its report kept
 * in that file; `node tooling/scripts/checks/coverage.mjs <file>...` judges every part's report together against the
 * floors (the nightly runs the suite in four parts: one runner took longer than its cap from 14 Oct 2026). A part
 * without TEST_LCOV is not measured, as CI's parts are not.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { finish } from "./coverage.mjs";
import { buildPackages } from "../package-build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The network as the suites stand in for it, loaded before every test file: the server's reads of an address a person
 * typed go through channels' guarded fetcher, and a suite that stubs `globalThis.fetch` must not reach the real guard or
 * DNS (tests/calendar/_stand-in-network.mjs says how).
 */
const STAND_IN_NETWORK = "./tooling/scripts/tests/calendar/_stand-in-network.mjs";

/**
 * Base UI, as the page tests stand in for it, loaded before every test file: the suite's react-server condition cannot
 * load a Base UI module, so a surface that draws one of the kit's Base UI parts gets a stand-in
 * (tests/shared/_stand-in-base-ui.mjs says how).
 */
const STAND_IN_BASE_UI = "./tooling/scripts/tests/shared/_stand-in-base-ui.mjs";

/**
 * Stylesheets, as the page tests stand in for them, loaded before every test file: a module loaded on demand imports its
 * own rules, which the suite (no bundler) would read as JavaScript (tests/shared/_stand-in-css.mjs says how).
 */
const STAND_IN_CSS = "./tooling/scripts/tests/shared/_stand-in-css.mjs";

/**
 * Every import a test makes, slow, loaded before every test file when `TEST_SLOW_IMPORTS=1`: a test that counts turns
 * of the loop for work that reads a module fails every time, as it fails once in a while beside a heavy job
 * (tests/shared/_slow-imports.mjs says how). Only where tsx loads modules off the main thread (importsLeaveTheThread).
 */
const SLOW_IMPORTS = "./tooling/scripts/tests/shared/_slow-imports.mjs";

/**
 * Whether tsx answers an import off the main thread, which is what TEST_SLOW_IMPORTS slows: twenty imports asked under
 * tsx, and at least one not answered within its turn of the loop. A newer Node's tsx loads modules in the main thread
 * (Node 24 on CI), where an import is answered within the turn every time: no count of turns falls short across one,
 * there is nothing to slow, and an off-thread hook beside tsx's would change how CommonJS is loaded.
 */
export function importsLeaveTheThread() {
  const probe = `let late = 0;
for (let i = 0; i < 20; i += 1) {
  let answered = false;
  import("node:path").then(() => (answered = true));
  await new Promise((r) => setImmediate(r));
  if (!answered) late += 1;
}
console.log(late > 0 ? "off" : "in");`;
  const run = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", probe],
    { cwd: ROOT, encoding: "utf8" },
  );
  return run.status === 0 && run.stdout.trim() === "off";
}

/**
 * The export condition that hands a test a package's bundle, not its sources (decision 0074): each package's `exports`
 * names its `dist/` under it, which tooling/scripts/package-build.mjs builds before the run. Through tsx, a package's
 * sources load as some 900 modules; a folder of twenty test files took 33 s so, and 18 s over the bundles.
 */
export const BUNDLED = "bundled";

/** What each command runs when it is given no files. */
export const SUITES = {
  test: ["tooling/scripts/tests/**/*.test.mjs", "apps/mobile/test/*.test.mjs"],
  db: ["tooling/scripts/tests/**/*.db.test.mjs", "tooling/scripts/tests/**/*.integration.test.mjs"],
};

/**
 * A database suite that changes a shared table's definition while it runs, in a block it rolls back: a trigger made on
 * the ledger (`events`, `decisions`) to refuse a write, a column renamed, a constraint added, a table locked. Its lock
 * is held until the block ends, and while it is still waited for (behind another suite's long transaction) every other
 * suite's write to that table queues behind it, where a request through PostgREST gives up after eight seconds (the
 * `authenticator` role's lock_timeout). On 31 Oct 2026 the transferred-call suite's trigger on `events`, waiting on
 * playbook-totals' 20-second world, timed out the WhatsApp suites' writes in three runs of one pull request, and
 * take-over's block deadlocked with other suites' writes in three more. So such a suite runs alone, after the others.
 */
export const CHANGES_A_TABLE =
  /\b(?:create|drop)\s+trigger\b[^;]*?\bon\s+public\.|\balter\s+table\s+public\.|\block\s+table\s+public\./i;

/**
 * A database suite that runs a migration's own statement again, as the file has it (a backfill, to prove it fills what it
 * should and is re-runnable): the file named in its code, which is how the suite reads the statement to run. A backfill
 * names no workspace, so it reaches every suite's rows. On 31 Oct 2026 consent-channels' replay of 00297's backfill gave
 * email-offers' opted-in person, mid-test, the WhatsApp list that suite expects never to be kept, and main went red.
 * So such a suite runs alone, after the others. A suite that reads a migration only to compare a body (`migration(n)`,
 * by its number) runs nothing of it, and a file named in words is not read.
 */
export const REPLAYS_A_MIGRATION = /["'/]\d{5}_[a-z0-9_]+\.sql["']/;

/** The names a database suite ends with: SUITES.db's two kinds. */
const DATABASE_ENDINGS = SUITES.db.map((glob) => glob.slice(glob.lastIndexOf("*") + 1));

/** The test files under a folder, sorted as the runner orders them: every one, or the database suites alone. */
function testsUnder(dir, databaseOnly) {
  const endings = databaseOnly ? DATABASE_ENDINGS : [".test.mjs"];
  return fs
    .readdirSync(path.resolve(ROOT, dir), { recursive: true })
    .map((f) => `${dir}/${String(f).replaceAll("\\", "/")}`)
    .filter((f) => endings.some((e) => f.endsWith(e)))
    .sort();
}

/**
 * A database run's files in its two passes: the suites that may share the stack, at the runner's concurrency, then the
 * ones that change a shared table's definition (CHANGES_A_TABLE) or replay a migration (REPLAYS_A_MIGRATION), alone,
 * one at a time. With nothing asked, every database suite; a folder asked for is every test in it; a glob is not read,
 * so it runs in the first pass as it is.
 */
export function databasePasses(asked, read = (f) => fs.readFileSync(path.resolve(ROOT, f), "utf8")) {
  const files = asked.length
    ? asked.flatMap((a) => (isDirectory(a) ? testsUnder(a, false) : [a]))
    : testsUnder("tooling/scripts/tests", true);
  const runsAlone = (text) => CHANGES_A_TABLE.test(text) || REPLAYS_A_MIGRATION.test(text);
  const alone = files.filter((f) => !/[*?[{]/.test(f) && f.endsWith(".mjs") && runsAlone(read(f)));
  return { together: files.filter((f) => !alone.includes(f)), alone };
}

/** The zone a run is in: `TEST_TZ` when it names one, else UTC. */
export function zoneOf(env) {
  const asked = String(env.TEST_TZ ?? "").trim();
  if (!asked) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: asked });
  } catch {
    throw new Error(`TEST_TZ=${asked} is not a zone this Node knows (try UTC, America/Chicago or Pacific/Auckland)`);
  }
  return asked;
}

/**
 * The command a run is: Node's own runner over the suite's files (or the ones asked for), with the loader every test
 * needs, and the environment it runs in. A directory asked for is every `*.test.mjs` under it. `coverage` is where a
 * measured run's lcov report is written, or null for a run that is not measured; `held` is whether the floors judge it.
 * A database run is two passes (databasePasses): `args`, then `alone`, the suites that change a shared table's
 * definition or replay a migration, one at a time; `alone` is null where there is no second pass.
 */
export function planOf(argv, env) {
  const args = argv.filter((a) => a !== "--");
  const db = args.includes("--db");
  const flags = args.filter((a) => a.startsWith("-") && a !== "--db");
  const named = args.filter((a) => !a.startsWith("-")).map((a) => a.replaceAll("\\", "/").replace(/\/$/, ""));
  const asked = named.map((a) => (isDirectory(a) ? `${a}/**/*.test.mjs` : a));
  const { first, alone, lone } = passFilesOf(db, named, asked);
  const oneAtATime = [...flags.filter((f) => !f.startsWith("--test-concurrency")), "--test-concurrency=1"];
  const zone = zoneOf(env);
  // A part of the suite (`--test-shard=i/n`) is the suite, cut: measured when TEST_LCOV names where its report is
  // kept, and judged by no floor, since the floors are the whole suite's (coverage.mjs judges the parts' reports
  // together, as the nightly does).
  const part = flags.length > 0 && flags.every((f) => f.startsWith("--test-shard="));
  const kept = part && String(env.TEST_LCOV ?? "").trim() ? path.resolve(ROOT, String(env.TEST_LCOV).trim()) : null;
  const full = !asked.length && !db && (!flags.length || part) && !String(env.TEST_TZ ?? "").trim();
  const measured = env.TEST_COVERAGE === "1" ? !db : full && env.TEST_COVERAGE !== "0" && (!part || kept !== null);
  const coverage = measured ? (kept ?? path.join(os.tmpdir(), `chanlytics-${process.pid}.lcov`)) : null;
  const report = coverage
    ? [
        "--experimental-test-coverage",
        "--test-reporter=./tooling/scripts/checks/tap-reporter.mjs",
        "--test-reporter-destination=stdout",
        "--test-reporter=lcov",
        `--test-reporter-destination=${coverage}`,
      ]
    : [];
  const loader = [
    "--conditions=react-server",
    `--conditions=${BUNDLED}`,
    "--import",
    "tsx",
    "--import",
    STAND_IN_NETWORK,
    "--import",
    STAND_IN_BASE_UI,
    "--import",
    STAND_IN_CSS,
    ...(env.TEST_SLOW_IMPORTS === "1" ? ["--import", SLOW_IMPORTS] : []),
    "--test",
  ];
  return {
    zone,
    coverage,
    held: measured && full && !part,
    // a part's report stays where TEST_LCOV put it, for the judge of all the parts
    keep: kept !== null,
    args: [...loader, ...report, ...(lone ? oneAtATime : flags), ...first],
    alone: alone ? [...loader, ...oneAtATime, ...alone] : null,
    // A script a test starts (a check, an eval, an ops script) reads the packages as the test does.
    env: { ...env, TZ: zone, NODE_OPTIONS: [env.NODE_OPTIONS, `--conditions=${BUNDLED}`].filter(Boolean).join(" ") },
  };
}

/**
 * The files a run's first pass names, and its second pass's suites (null where there is none): a database run's two
 * passes (databasePasses), or the files asked for, else the suite. `lone` where every suite asked for runs alone, so the
 * one pass is theirs, one at a time (a runner handed no file would look for its own).
 */
function passFilesOf(db, named, asked) {
  if (!db) return { first: asked.length ? asked : SUITES.test, alone: null, lone: false };
  const { together, alone } = databasePasses(named);
  if (!together.length) return { first: alone, alone: null, lone: true };
  return { first: together, alone: alone.length ? alone : null, lone: false };
}

function isDirectory(p) {
  try {
    return fs.statSync(path.resolve(ROOT, p)).isDirectory();
  } catch {
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let plan;
  try {
    plan = planOf(process.argv.slice(2), process.env);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }
  if (process.env.TEST_SLOW_IMPORTS === "1" && !importsLeaveTheThread()) {
    console.error(
      `TEST_SLOW_IMPORTS: on Node ${process.version}, tsx loads modules in the main thread and answers an import within ` +
        "its turn, so no count of turns falls short across one and there is nothing to slow. Run it on a Node whose " +
        "tsx loads off the main thread (an older Node).",
    );
    process.exit(2);
  }
  // On stderr, so a TAP reader of stdout sees only the runner's report.
  console.error(`# the suite runs in ${plan.zone}${plan.zone === "UTC" ? "" : " (TEST_TZ)"}`);
  const built = await buildPackages();
  if (built.length) console.error(`# built the bundles of ${built.join(", ")}`);
  // One pass after another, every pass run; the status is the first that failed.
  const runPasses = (passes, failed) => {
    const [args, ...rest] = passes;
    if (!args) {
      return process.exit(
        plan.coverage
          ? finish({
              coverage: plan.coverage,
              status: failed,
              env: process.env,
              held: plan.held,
              root: ROOT,
              keep: plan.keep,
            })
          : failed,
      );
    }
    if (args === plan.alone)
      console.error("# then, one at a time, the suites that change a shared table's definition or replay a migration");
    spawn(process.execPath, args, { cwd: ROOT, env: plan.env, stdio: "inherit" }).on("exit", (code, signal) =>
      runPasses(rest, failed || (signal ? 1 : (code ?? 1))),
    );
  };
  runPasses([plan.args, ...(plan.alone ? [plan.alone] : [])], 0);
}
