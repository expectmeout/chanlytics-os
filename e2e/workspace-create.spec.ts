import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * A second workspace from the workspace menu: the create screen on demand,
 * the new workspace listed and viewed, then the probe removed with the
 * service role and the person put back where they were.
 */
test.describe("creating another workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("New workspace in the menu creates one, switches to it, and lists both", async ({ page }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const rest = (path: string, init: RequestInit = {}) =>
      fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });

    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".brief")).toBeVisible();
    const homeId = await page.evaluate(() => (window as unknown as { __ACTIVE_WORKSPACE?: string }).__ACTIVE_WORKSPACE ?? null);
    expect(homeId).not.toBeNull();
    const name = `E2E probe ${Date.now()}`;
    let createdId: string | null = null;
    try {
      await page.getByTestId("sb-workspace").click();
      await page.getByTestId("sb-ws-new").click();
      const screen = page.getByTestId("create-workspace");
      await expect(screen).toBeVisible();
      await expect(screen).toContainText("New workspace");
      await screen.getByLabel("Business name").fill(name);
      await screen.getByRole("button", { name: "Create workspace" }).click();
      await expect(page.locator(".brief")).toBeVisible({ timeout: 20000 });
      await expect(page.getByTestId("sb-workspace")).toContainText(name);
      createdId = await page.evaluate(() => (window as unknown as { __ACTIVE_WORKSPACE?: string }).__ACTIVE_WORKSPACE ?? null);
      expect(createdId).not.toBeNull();
      expect(createdId).not.toBe(homeId);
      await page.getByTestId("sb-workspace").click();
      const items = page.getByTestId("sb-workspace-menu").getByTestId("sb-ws-item");
      await expect(items).toHaveCount(2);
      await expect(items.filter({ hasText: name })).toHaveAttribute("aria-checked", "true");
      // Back to where they were, through the same menu.
      await items.filter({ hasNotText: name }).first().click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("sb-workspace")).not.toContainText(name, { timeout: 20000 });
    } finally {
      if (createdId) {
        await rest(`events?tenant_id=eq.${createdId}`, { method: "DELETE" });
        await rest(`tenants?id=eq.${createdId}`, { method: "DELETE" });
      }
      await page.evaluate((id) => { if (id) localStorage.setItem("chanlytics.workspace", id); }, homeId);
    }
  });
});
