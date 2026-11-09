import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests, against a running app: a deployed url by default, the nightly's own copy on its stack.
 *
 * There are 415 unit tests in this repo and, until now, none that opened the
 * app. Every user-facing bug this project has shipped was found by loading the
 * page and looking at it — a fabricated team on a real owner's settings, the
 * mockup's invented salon painted during a cold load, a canceled message
 * rendered as delivered, a finished form unreachable from the sidebar. Not one
 * was caught by a unit test, because each was a composition of things that
 * were individually correct.
 *
 * So this suite is deliberately narrow: it encodes the class of bug this
 * project actually has, rather than re-testing logic the unit suite already
 * covers from the inside.
 *
 * WHAT RUNS WHERE. The auth-gate specs need no credentials and run anywhere,
 * including against production — they only make unauthenticated requests. The
 * signed-in specs need a session, and this repo has no service-role key on any
 * developer machine and none in CI (ci.yml: "CI holds no live service secrets").
 * They skip with a stated reason rather than failing, exactly as the six
 * credential-gated integration suites in tests already do.
 *
 * The nightly runs every spec on a copy of the commit, on the runner, and only
 * e2e/production/ and a few doors against production (.github/workflows/nightly-e2e.yml).
 * e2e/production/ is asked for by name: a run that does not say E2E_PRODUCTION leaves it out,
 * because a copy's timings say nothing about a customer's, and its doors are production's alone.
 */

/** Deployed by default; override for a preview or a local server. */
const baseURL = process.env.E2E_BASE_URL ?? "https://app.chanlytics.com";

/**
 * A Vercel preview sits behind the team's deployment protection (a preview answers 302 to Vercel's sign-in, measured
 * 29 Sep 2026). The project's Protection Bypass for Automation lets a run in: e2e/preview-bypass.ts asks for the
 * cookie once, with the secret, and every page opens with that cookie (.github/workflows/preview-smoke.yml). The
 * secret itself never rides on the pages' requests, so no other origin a page calls ever sees it. Unset, nothing
 * changes.
 */
const bypass = !!process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
/** Where e2e/preview-bypass.ts leaves the cookie; test-results is the run's own, and ignored by git. */
const PREVIEW_STATE = "test-results/preview-bypass.json";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: process.env.E2E_PRODUCTION ? [] : ["**/production/**"],
  // Against a real deployment over the network, failures are far more often a
  // slow cold start than a real regression. One retry locally, two in CI (a run
  // on its own stack says one), and a generous per-assertion timeout.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 1,
  // The specs share one workspace, and against a deployment parallel workers are
  // just concurrent load on one Vercel function.
  workers: 1,
  fullyParallel: false,
  // A stray `test.only` must not silently shrink the suite in CI.
  forbidOnly: !!process.env.CI,
  // ./e2e/skip-ceiling: a run that claims credentials and then skips most of
  // itself is the same defect as a run that skipped everything and passed.
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["./e2e/skip-ceiling.ts"]]
    : [["list"], ["./e2e/skip-ceiling.ts"]],
  ...(bypass ? { globalSetup: "./e2e/preview-bypass.ts" } : {}),
  use: {
    baseURL,
    ...(bypass ? { storageState: PREVIEW_STATE } : {}),
    // Kept only for failures: a passing run's traces are noise, and these
    // artifacts can contain a real workspace's data.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // The nightly says every request's touches (apps/dashboard/src/server/shared/server-timing.ts TOUCHES_ALL_HEADER): the refresh
    // map's derivation reads them (tooling/scripts/ops/write-shadow.mjs; decision 0058 stage C).
    ...(process.env.E2E_TOUCHES_ALL ? { extraHTTPHeaders: { "x-touches-said": "all" } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
