import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { expectDeskSign } from "./desk-sign";

/**
 * The public "say yes to offers" page, on production.
 *
 * Reachable with no session, because a customer opens it from a QR at the
 * desk; a workspace that does not exist is a 404, not a hint; and the page
 * takes no input at all, because a number typed into a form is not proof
 * that its owner agreed.
 */
test.describe("the opt-in page", () => {
  test("an unknown workspace is a 404, and nothing about it is said", async ({ request }) => {
    const res = await request.get("/yes/no-such-workspace-here", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    // Next names the route's own segment in its not-found payload, which the
    // URL already shows. What must never appear is anything about the
    // workspaces that DO exist, or the credential that read them.
    expect(await res.text()).not.toMatch(/service_role|supabase[.]co|tenant_id|eyJ/i);
  });

  test("an unknown workspace has no desk sign either, and nothing about it is said", async ({ request }) => {
    const res = await request.get("/yes/no-such-workspace-here/sign", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toMatch(/service_role|supabase[.]co|tenant_id|eyJ/i);
  });

  test("a malformed slug is refused the same way", async ({ request }) => {
    for (const bad of ["/yes/..%2F..%2Fetc", "/yes/A_B_C", "/yes/" + "x".repeat(80)]) {
      const res = await request.get(bad, { maxRedirects: 0 });
      expect([404, 400], `${bad} answered ${res.status()}`).toContain(res.status());
    }
  });

  test("the live workspace's page is public, shows the ways to say yes and the carriers' wording", async ({ page, request }) => {
    test.skip(!HAVE_SESSION, WHY_SKIPPED);
    // The slug comes from the signed-in session; the page is then opened without one.
    await signIn(page);
    const ws = await (await page.request.get("/api/v1/workspaces")).json();
    const slug: string | undefined = ws.data.workspaces?.[0]?.slug;
    expect(slug).toBeTruthy();

    const res = await request.get(`/yes/${slug}`, { maxRedirects: 0 });
    expect(res.status(), "public: no session, no redirect to /login").toBe(200);
    const html = await res.text();
    expect(html).toContain("Message and data rates may apply");
    expect(html).toContain("No mobile information is shared with third parties");
    expect(html).toContain("Reply STOP");
    // Nothing that could take a customer's number, and nothing internal.
    expect(html).not.toMatch(/<form|<input/i);
    expect(html).not.toMatch(/service_role|supabase\.co|tenant_id/i);
  });

  test("on a phone it reads as one column, with the QR where a customer can scan it", async ({ page }) => {
    test.skip(!HAVE_SESSION, WHY_SKIPPED);
    await signIn(page);
    const ws = await (await page.request.get("/api/v1/workspaces")).json();
    const slug: string | undefined = ws.data.workspaces?.[0]?.slug;
    test.skip(!slug, "no workspace");
    await page.context().clearCookies();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/yes/${slug}`);
    await expect(page.getByTestId("yes-terms")).toBeVisible();
    const qr = page.getByTestId("yes-qr");
    if (await qr.count()) {
      const box = await qr.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(390);
      expect(box!.height).toBeGreaterThan(100);
    }
    // The page never scrolls sideways on a phone.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("the desk sign opens with no session and prints on one sheet, with the code and the words it owes", async ({ page }) => {
    test.skip(!HAVE_SESSION, WHY_SKIPPED);
    await signIn(page);
    const ws = await (await page.request.get("/api/v1/workspaces")).json();
    const slug: string | undefined = ws.data.workspaces?.[0]?.slug;
    expect(slug).toBeTruthy();
    // Opened as a print shop or the front desk's own computer would open it: signed out.
    await page.context().clearCookies();
    const res = await page.goto(`/yes/${slug}/sign`);
    expect(res?.status(), "public: no session, no redirect to /login").toBe(200);
    // The nightly's workspace has a WhatsApp number (tooling/scripts/e2e-workspace.mjs), so it has a sign to print.
    await expectDeskSign(page);
  });
});
