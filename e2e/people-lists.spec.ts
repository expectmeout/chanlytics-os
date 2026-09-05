import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Saved lists on People.
 *
 * The rail's Saved section is real: it reads the workspace's lists, offers
 * "New list" to an owner, and a name typed there becomes a POST to the
 * lists route — intercepted here, so the workspace keeps no test list. The
 * profile shows the person's lists and offers the rest.
 */
test.describe("Saved lists on People", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the rail reads the workspace's lists and a new name becomes a workspace-scoped POST — intercepted", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const saved = page.getByTestId("saved-lists");
    await expect(saved).toBeVisible();
    await expect(saved).toContainText("Saved");
    // What the server holds is what the rail shows: the same count of rows.
    const res = await page.request.get("/api/v1/segments");
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(Array.isArray(data.lists)).toBe(true);
    await expect(saved.locator(".cl-rail-row")).toHaveCount(data.lists.length);

    const seen: { method: string; url: string; body: unknown }[] = [];
    await page.route("**/api/v1/segments?*", async (route) => {
      const req = route.request();
      if (req.method() !== "POST") return route.continue();
      seen.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { id: "intercepted", name: "Regulars", ids: [] } }),
      });
    });
    await page.getByTestId("new-list").click();
    const input = page.getByTestId("new-list-name");
    await expect(input).toBeVisible();
    await input.fill("Regulars");
    await input.press("Enter");
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toContain("workspace=");
    expect(seen[0].body).toEqual({ name: "Regulars" });
  });

  test("a profile shows the person's lists and offers the rest", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.cl-table-empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to open");
    await rows.first().click();
    await expect(page.locator(".cl-prof-name")).toBeVisible();
    const section = page.getByTestId("person-lists");
    await expect(section).toBeVisible();
    await expect(section).toContainText("Lists");
    // Either an "Add to…" control (lists exist) or the honest empty line.
    await expect(section).toContainText(/Add to|No lists yet/);
  });
});
