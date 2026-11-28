/**
 * What the morning line watches: every check that runs by itself, where it runs, how often, and how it says it did
 * not really run. morning-line.mjs reads each one's last runs from GitHub and judges them by this list.
 *
 * A check is here when a person should hear of it red, or of it not running, without opening GitHub. Each entry:
 *
 *   says      what the line calls it, in plain words
 *   where     "main" (the code as merged) or "production" (what customers are on)
 *   workflow  its file under .github/workflows, and `event`, the trigger whose runs are the scheduled ones
 *   every     hours between runs, for a check on a clock: one whose newest run is more than twice that old has
 *             stopped running, whatever it last said
 *   jobs      which of the run's jobs are this check, by name, where one workflow holds two (the nightly's suites
 *             and its check of production are said apart, as its own report says them)
 *   step      a step that is the check itself: skipped, the run ended green having checked nothing
 *   off       why it does not run, as a person would be told: the switch, and whose it is
 *   issue     the title of the issue this line keeps while the check is red twice running, where its workflow
 *             opens none of its own; null where the workflow already does
 *
 * tests/ops/workflows/morning-line.test.mjs holds every workflow, job and step named here to a file, a job and a
 * step that exist, so a rename cannot leave a check unwatched.
 */

const DAY_H = 24;
const WEEK_H = 7 * DAY_H;

/** The nightly's two jobs that are no check of their own: the report, and the coverage read of the suite's parts. */
const NIGHTLY_PRODUCTION = "The check of production";
const NIGHTLY_REPORT = "Say what the night came to";
/**
 * The two evals' own jobs. Each is read by its job and not by its run, so the line calls a week "skipped" whether the
 * workflow skips whole (as on 28 Nov 2026) or comes to hold a second job that says in the run's summary why nothing
 * was asked: a run that ends green having said "not run" is still a check that did not run.
 */
const EVALS_JOB = "The receptionist's cases against a sandbox model key";
const OPENING_JOB = "The opening check, graded, against a sandbox model key";

export const WATCHED = [
  // What is merged.
  {
    key: "ci",
    says: "CI on main",
    where: "main",
    workflow: "ci.yml",
    event: "push",
    issue: "CI is red on main",
  },
  {
    key: "database",
    says: "The migrations' replay on main",
    where: "main",
    workflow: "database.yml",
    event: "push",
    issue: "The migrations' replay is red on main",
  },
  {
    key: "nightly",
    says: "The nightly browser run",
    where: "main",
    workflow: "nightly-e2e.yml",
    event: "schedule",
    every: DAY_H,
    jobs: (name) => name !== NIGHTLY_PRODUCTION && name !== NIGHTLY_REPORT,
    issue: null,
  },
  {
    key: "nightly_database",
    says: "The nightly database suites",
    where: "main",
    workflow: "nightly-database.yml",
    event: "schedule",
    every: DAY_H,
    issue: "The nightly database suites are red",
  },
  {
    key: "kit",
    says: "The kit run",
    where: "main",
    workflow: "nightly-kit.yml",
    event: "schedule",
    every: DAY_H,
    issue: null,
  },
  {
    key: "register",
    says: "The register of what the code owes",
    where: "main",
    workflow: "register.yml",
    event: "schedule",
    every: DAY_H,
    issue: "The register could not be read",
  },
  {
    key: "evals",
    says: "The receptionist's evals",
    where: "main",
    workflow: "nightly-evals.yml",
    event: "schedule",
    every: WEEK_H,
    jobs: (name) => name === EVALS_JOB,
    off: "The repository variable NIGHTLY_EVALS is not 1. Ruben's switch.",
    issue: null,
  },
  {
    key: "opening_eval",
    says: "The cold email opening's eval",
    where: "main",
    workflow: "opening-check-eval.yml",
    event: "schedule",
    every: WEEK_H,
    jobs: (name) => name === OPENING_JOB,
    off: "The repository variable OPENING_EVAL is not 1. Ruben's switch.",
    issue: null,
  },
  // What customers are on.
  {
    key: "smoke",
    says: "The smoke after a deploy",
    where: "production",
    workflow: "production-smoke.yml",
    event: "deployment_status",
    issue: null,
  },
  {
    key: "production_check",
    says: "The nightly's check of production",
    where: "production",
    workflow: "nightly-e2e.yml",
    event: "schedule",
    every: DAY_H,
    jobs: (name) => name === NIGHTLY_PRODUCTION,
    issue: null,
  },
  {
    key: "ask_weekly",
    says: "The weekly AI test",
    where: "production",
    workflow: "ask-weekly.yml",
    event: "schedule",
    every: WEEK_H,
    off: "The repository variable ASK_WEEKLY is off.",
    issue: null,
  },
  {
    key: "leads_weekly",
    says: "The lead finder's weekly search",
    where: "production",
    workflow: "leads-weekly.yml",
    event: "schedule",
    every: WEEK_H,
    off: "The repository variable LEADS_WEEKLY is off.",
    issue: null,
  },
  {
    key: "voice_canary",
    says: "The voice canary",
    where: "production",
    workflow: "voice-canary.yml",
    event: "schedule",
    every: DAY_H,
    step: "Ring the canary's line",
    off: "VOICE_CANARY_KEY is not set, so no call is placed. Ruben's secret, here and on the edge.",
    issue: null,
  },
  {
    key: "migration_compare",
    says: "The weekly compare of production's migrations",
    where: "production",
    workflow: "migration-ledger.yml",
    event: "schedule",
    every: WEEK_H,
    step: "Compare",
    off: "SUPABASE_PROD_READ_URL is not set, so production's ledger is not read. Ruben's secret.",
    issue: null,
  },
];
