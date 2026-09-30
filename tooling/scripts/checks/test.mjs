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
 * Coverage. A full run in UTC (no files asked, no flag, no TEST_TZ: a zone leg is about the clock) has Node measure
 * what the suite ran of the code, and prints it per package and per tree with each held floor
 * (tooling/scripts/checks/coverage.mjs). Under a floor is a red run. `UPDATE_BASELINES=1` (or `raise`) raises a floor
 * the suite has cleared with room to spare; `COVERAGE_FLOORS=lower` is the one way a floor falls, argued under "Rises"
 * in docs/debt.md. `TEST_COVERAGE=0` skips the measure for a full run that wants the speed, and `TEST_COVERAGE=1`
 * measures a run of some files (the table only: a floor is the suite's, not theirs).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { finish } from "./coverage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The network as the suites stand in for it, loaded before every test file: the server's reads of an address a person
 * typed go through channels' guarded fetcher, and a suite that stubs `globalThis.fetch` must not reach the real guard or
 * DNS (tests/calendar/_stand-in-network.mjs says how).
 */
const STAND_IN_NETWORK = "./tooling/scripts/tests/calendar/_stand-in-network.mjs";

/** What each command runs when it is given no files. */
export const SUITES = {
  test: ["tooling/scripts/tests/**/*.test.mjs", "apps/mobile/test/*.test.mjs"],
  db: ["tooling/scripts/tests/**/*.db.test.mjs", "tooling/scripts/tests/**/*.integration.test.mjs"],
};

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
 */
export function planOf(argv, env) {
  const args = argv.filter((a) => a !== "--");
  const db = args.includes("--db");
  const flags = args.filter((a) => a.startsWith("-") && a !== "--db");
  const asked = args
    .filter((a) => !a.startsWith("-"))
    .map((a) => a.replaceAll("\\", "/").replace(/\/$/, ""))
    .map((a) => (isDirectory(a) ? `${a}/**/*.test.mjs` : a));
  const files = asked.length ? asked : db ? SUITES.db : SUITES.test;
  const zone = zoneOf(env);
  const full = !asked.length && !db && !flags.length && !String(env.TEST_TZ ?? "").trim();
  const measured = env.TEST_COVERAGE === "1" ? !db : full && env.TEST_COVERAGE !== "0";
  const coverage = measured ? path.join(os.tmpdir(), `chanlytics-${process.pid}.lcov`) : null;
  const report = coverage
    ? [
        "--experimental-test-coverage",
        "--test-reporter=./tooling/scripts/checks/tap-reporter.mjs",
        "--test-reporter-destination=stdout",
        "--test-reporter=lcov",
        `--test-reporter-destination=${coverage}`,
      ]
    : [];
  return {
    zone,
    coverage,
    held: measured && full,
    args: [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--import",
      STAND_IN_NETWORK,
      "--test",
      ...report,
      ...flags,
      ...files,
    ],
    env: { ...env, TZ: zone },
  };
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
  // On stderr, so a TAP reader of stdout sees only the runner's report.
  console.error(`# the suite runs in ${plan.zone}${plan.zone === "UTC" ? "" : " (TEST_TZ)"}`);
  const child = spawn(process.execPath, plan.args, { cwd: ROOT, env: plan.env, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    const status = signal ? 1 : (code ?? 1);
    process.exit(
      plan.coverage
        ? finish({ coverage: plan.coverage, status, env: process.env, held: plan.held, root: ROOT })
        : status,
    );
  });
}
