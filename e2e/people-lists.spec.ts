import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";

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
    const res = await apiGet(page, "/api/v1/segments");
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

  test("People › Lists is the real page: the workspace's lists, their people, and a broadcast as the onward step", async ({ page }) => {
    await page.goto("/#/segments");
    await page.waitForLoadState("networkidle");
    const real = page.getByTestId("lists-real");
    await expect(real).toBeVisible();
    await expect(page.getByTestId("lists-rail-smart")).toContainText("Needs you");
    const res = await apiGet(page, "/api/v1/segments");
    const { data } = await res.json();
    await expect(page.getByTestId("lists-rail-saved").locator(".cl-rail-row")).toHaveCount(data.lists.length);
    // A computed list opens with its people, never a Coming Soon card.
    await page.getByTestId("lists-rail-smart").locator(".cl-rail-row").first().click();
    await expect(page.getByTestId("lists-members")).toBeVisible();
    await expect(page.locator("text=Coming soon")).toHaveCount(0);
  });

  test("a profile shows the person's lists and offers the rest", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.empty))");
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
