import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

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
    expect(scriptSrc).toEqual(["'self'", "'unsafe-inline'", "https://connect.facebook.net"]);
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
        "#/outbound",
        "#/broadcasts",
        "#/messages",
        "#/reports",
        "#/admin/setup",
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
            await page.waitForLoadState("networkidle");
          })),
        );
      }
      expect(seen).toEqual([]);
    });
  });
});
