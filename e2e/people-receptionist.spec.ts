import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * "Receptionist for …" on the profile rail.
 *
 * Intercepts its own PUT (like the Team card and Delete specs) and answers
 * it, so it proves the control renders from real data, is enabled for the
 * owner, and issues the workspace-scoped request with the chosen mode —
 * without changing what any customer experiences.
 */
test.describe("Receptionist mode for one person", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("shows which mode is in force and issues a workspace-scoped PUT with the chosen mode — intercepted", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to open");
    await rows.first().click();
    await expect(page.locator(".cl-prof-name")).toBeVisible();

    // Since #907 the mode is a row on the record kit, its control in the Receptionist fold behind the row's Change.
    await page.getByTestId("rec-row-act-person-receptionist").click();
    const control = page.getByTestId("receptionist-mode");
    await expect(control).toBeVisible();
    const segs = control.locator(".cl-prof-aut-seg");
    await expect(segs).toHaveCount(3);
    await expect(segs.nth(0)).toHaveText("Answer");
    await expect(segs.nth(1)).toHaveText("Ask me first");
    await expect(segs.nth(2)).toHaveText("Never");
    // Exactly one segment reflects the mode in force (person's own, else the workspace's).
    await expect(control.locator(".cl-prof-aut-seg.active")).toHaveCount(1);
    // The e2e account is an owner, so the control is live.
    await expect(segs.nth(2)).toBeEnabled();

    const seen: { method: string; url: string; body: unknown }[] = [];
    await page.route("**/api/v1/contacts/*/receptionist*", async (route) => {
      const req = route.request();
      seen.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { contact_id: "intercepted", mode: "never" } }),
      });
    });

    await segs.nth(2).click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].url).toContain("workspace=");
    expect(seen[0].body).toEqual({ mode: "never" });
    await expect(page.getByText("Receptionist for")).toBeVisible();
  });
});
