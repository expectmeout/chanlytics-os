import { test, expect, errors, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * The Content-Security-Policy, reporting.
 *
 * The policy (apps/dashboard/src/csp.ts) ships report-only: the browser
 * applies it, logs what it WOULD have blocked, and blocks nothing. This is
 * the reader of those logs. It walks the public pages and, signed in, every
 * real surface, and fails on the first violation the console reports -- so a
 * script, a style, a font, an image or a socket the policy forgot shows up
 * here, in the nightly, before the header is flipped to enforcing and takes
 * the page down instead.
 */
const VIOLATION = /Content Security Policy|Report Only|Refused to (load|execute|apply|connect|frame)/i;

async function violationsOn(page: Page, path: string, settle: () => Promise<void>): Promise<string[]> {
  const seen: string[] = [];
  // A directive the browser ignores in a report-only policy is a note about the header, not a page the policy would break.
  const NOTE = /is ignored when delivered in a report-only policy/i;
  const onConsole = (m: { text(): string }) => {
    const t = m.text();
    if (VIOLATION.test(t) && !NOTE.test(t)) seen.push(`${path}: ${t.slice(0, 240)}`);
  };
  page.on("console", onConsole);
  await page.goto(path);
  await settle();
  page.off("console", onConsole);
  return seen;
}

/**
 * How long a signed-in page is given to fall quiet. What it loads to draw, and so whatever the policy could refuse it,
 * is in long before; a page still reading after that (a live re-read, the frame warming the next pages) is not waited
 * out. The Inbox never fell quiet on 29 and 31 Oct 2026, and the walk spent its three minutes there.
 */
const QUIET_MS = 8_000;

/** The page loaded, and quiet or given its time to be. */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  try {
    await page.waitForLoadState("networkidle", { timeout: QUIET_MS });
  } catch (e) {
    if (!(e instanceof errors.TimeoutError)) throw e;
  }
}

test.describe("Content-Security-Policy, enforced", () => {
  test("every page carries the policy, with no foreign script origin and no eval, and frame-ancestors beside it", async ({
    page,
  }) => {
    const res = await page.goto("/login");
    expect(res).not.toBeNull();
    const headers = res!.headers();
    // Two headers of the name arrive (next.config.ts's frame-ancestors, and the proxy's policy); Playwright joins them.
    const policy = headers["content-security-policy"];
    expect(policy, "the enforced policy").toBeTruthy();
    expect(headers["content-security-policy-report-only"], "nothing rides report-only any more").toBeUndefined();
    const scriptSrc = /script-src ([^;,]*)/.exec(policy)![1].trim().split(/\s+/);
    // Meta's SDK host, and Stripe's for paying in the page (decision 0073, R16): the origins Stripe's CSP guide names,
    // as tooling/scripts/tests/routes/csp.test.mjs holds them.
    expect(scriptSrc).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://connect.facebook.net",
      "https://js.stripe.com",
      "https://*.js.stripe.com",
      "https://checkout.stripe.com",
    ]);
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  test("the public pages raise no violation", async ({ page }) => {
    const seen: string[] = [];
    for (const path of ["/login", "/signup", "/reset-password", "/privacy", "/terms", "/data-deletion"]) {
      seen.push(...(await violationsOn(page, path, () => page.waitForLoadState("networkidle"))));
    }
    expect(seen).toEqual([]);
  });

  test.describe("signed in", () => {
    test.skip(!HAVE_SESSION, WHY_SKIPPED);
    test("every real surface raises no violation", async ({ page }) => {
      test.setTimeout(180_000);
      await signIn(page);
      const seen: string[] = [];
      for (const hash of [
        "#/today",
        "#/inbox",
        "#/conversations",
        "#/live",
        "#/clients",
        "#/calendar",
        "#/campaigns",
        "#/broadcasts",
        "#/messages",
        "#/reports",
        "#/start",
        "#/admin/workspace",
        "#/admin/team",
        "#/admin/autonomy",
        "#/admin/notifications",
        "#/admin/integrations",
        "#/admin/billing",
        "#/admin/activity",
      ]) {
        seen.push(
          ...(await violationsOn(page, `/${hash}`, async () => {
            await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
            await settled(page);
          })),
        );
      }
      expect(seen).toEqual([]);
    });
  });
});
