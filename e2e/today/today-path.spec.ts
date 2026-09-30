import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { routeOf } from "../address";

/**
 * Today on its path, in a real browser (decision 0015, step 4).
 *
 * Today left the shell as an App Router page: `/w/<slug>/today` is its route, and `/w/<slug>` itself, which names no route,
 * is Today too. The frame in the layout draws its chrome around it. What is held here is what only a browser can say: that a
 * load of either address boots the frame with the page in it and Today lit in the sidebar, that the old hash address still
 * lands, and that Away to another page and Back draws it again. It reads and moves nothing on the workspace.
 */
async function slugOfHome(page: Page): Promise<string> {
  await page.goto("/");
  await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
  const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
  if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);
  return slug;
}

async function loadFresh(page: Page, path: string): Promise<void> {
  await page.goto("/api/version");
  await page.goto(path);
  await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
}

test.describe("Today on its path", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the workspace's own address and /today draw the same page, lit in the sidebar", async ({ page }) => {
    const slug = await slugOfHome(page);
    for (const path of [`/w/${slug}`, `/w/${slug}/today`]) {
      await loadFresh(page, path);
      // The day's page: its card or its queue is there, or the read's own failed-read stands where they would be.
      await expect(
        page.locator('.dash-a-v2, [data-testid="today-card"], [data-testid="today-queue"]').first(),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("Today");
      expect(routeOf(page.url()), path).toBe("today");
    }
  });

  test("the hash address moves to the path; Away and Back draws Today again", async ({ page }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}#/today`);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/today`);
    expect(new URL(page.url()).hash).toBe("");
    await expect(
      page.locator('.dash-a-v2, [data-testid="today-card"], [data-testid="today-queue"]').first(),
    ).toBeVisible();

    await page.locator(".nav-item", { hasText: "Reports" }).first().click();
    await expect.poll(() => routeOf(page.url())).toBe("reports");
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe("today");
    await expect(
      page.locator('.dash-a-v2, [data-testid="today-card"], [data-testid="today-queue"]').first(),
    ).toBeVisible();
  });
});
