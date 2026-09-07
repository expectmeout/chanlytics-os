import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * A person's own name: set on the team card, shown on the sidebar chip and
 * the roster, cleared again. The account under test keeps whatever name it
 * had before.
 */
test.describe("identity on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("the name you give is the name the chrome shows; clearing it brings 'Your account' back", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/admin/workspace");
    await page.waitForLoadState("networkidle");
    const field = page.getByTestId("set-you-name");
    await expect(field).toBeVisible();
    const before = await field.inputValue();
    const put = (name: string) =>
      page.evaluate(async (n) => {
        const r = await fetch("/api/v1/me", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ display_name: n }) });
        return { status: r.status, body: await r.json() };
      }, name);
    try {
      const set = await put("Ruben Test");
      expect(set.status).toBe(200);
      expect(set.body.data.display_name).toBe("Ruben Test");
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".user-chip .name")).toHaveText("Ruben Test");
      await expect(page.locator(".user-chip .avatar")).toHaveText("RT");
      await expect(page.locator(".set-team-row").filter({ hasText: "You" }).locator(".set-team-name")).toContainText("Ruben Test");
      const cleared = await put("");
      expect(cleared.status).toBe(200);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".user-chip .name")).toHaveText("Your account");
      const tooLong = await put("x".repeat(81));
      expect(tooLong.status).toBe(400);
    } finally {
      await put(before);
    }
  });
});
