import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests, against a DEPLOYED url.
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
 * credential-gated integration suites in tooling/scripts/tests already do.
 */

/** Deployed by default; override for a preview or a local server. */
const baseURL = process.env.E2E_BASE_URL ?? "https://chanlytics-os.vercel.app";

export default defineConfig({
  testDir: "./e2e",
  // These hit a real deployment over the network, so failures are far more
  // often a slow cold start than a real regression. One retry locally, two in
  // CI, and a generous per-assertion timeout.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 1,
  // Against a shared deployment, parallel workers are just concurrent load on
  // one Vercel function. Serial is slower and far less flaky.
  workers: 1,
  fullyParallel: false,
  // A stray `test.only` must not silently shrink the suite in CI.
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    // Kept only for failures: a passing run's traces are noise, and these
    // artifacts can contain a real workspace's data.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
