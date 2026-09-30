import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { routeOf } from "../address";

/**
 * The Inbox and Conversations on their paths, in a real browser (decision 0015, step 3).
 *
 * Both left the shell together: each is an App Router page of its own (`/w/<slug>/inbox/<thread>`,
 * `/w/<slug>/conversations/<tab>:<row>`), and the frame in the layout draws its chrome around them. What is held here is
 * what only a browser can say: that a load of the path boots the frame with the page in it, that the thread open is the
 * address's and is written as a replace (Back leaves the Inbox instead of replaying every thread read), that the page
 * stays mounted while the address moves under it, and that the old hash address still lands. It reads and moves nothing on
 * the workspace: no verb is pressed.
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

test.describe("The Inbox and Conversations on their paths", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the Inbox is a page of its own on its path: it boots there, lit in the sidebar, and a thread the address names follows it", async ({
    page,
  }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}/inbox`);
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("Inbox");
    await expect(page.locator(".inbox")).toBeVisible();
    expect(routeOf(page.url())).toBe("inbox");

    // A thread pressed is the address's, replaced: the router is not asked for it, and the page stays mounted.
    const rows = page.locator(".ix-thread");
    if (!(await rows.count())) return;
    await page.evaluate(() => {
      (window as unknown as { __inboxSpec?: boolean }).__inboxSpec = true;
    });
    const before = await page.evaluate(() => window.history.length);
    await rows.last().click();
    await expect.poll(() => routeOf(page.url())).toMatch(/^inbox\/th-/);
    expect(
      await page.evaluate(() => (window as unknown as { __inboxSpec?: boolean }).__inboxSpec === true),
      "the move loaded no page",
    ).toBe(true);
    expect(await page.evaluate(() => window.history.length), "a thread read is no new entry on a desktop").toBe(before);
    const at = routeOf(page.url());

    // A reload of that address opens the same thread, and the hash spelling of it moves to the path.
    await page.reload();
    await expect(page.locator(".inbox")).toBeVisible({ timeout: 30_000 });
    expect(routeOf(page.url())).toBe(at);
    await loadFresh(page, `/w/${slug}#/${at}`);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/${at}`);
    expect(new URL(page.url()).hash).toBe("");
    await expect(page.locator(".inbox")).toBeVisible();
  });

  test("Conversations is a page of its own on its path, and a tab pressed is its address", async ({ page }) => {
    const slug = await slugOfHome(page);
    await loadFresh(page, `/w/${slug}/conversations`);
    await expect(page.locator(".conversations")).toBeVisible();
    expect(routeOf(page.url())).toBe("conversations");

    const tabs = page.locator('[data-testid^="cv-tab-"]');
    await expect(tabs.first()).toBeVisible();
    if ((await tabs.count()) > 1) {
      await tabs.nth(1).click();
      await expect.poll(() => routeOf(page.url())).toMatch(/^conversations\/[a-z]+$/);
      await expect(page.locator(".conversations")).toBeVisible();
    }

    // Away by the sidebar to the Inbox, and Back: the router lands on Conversations again, and the page is there.
    await page.locator(".nav-item", { hasText: "Inbox" }).first().click();
    await expect.poll(() => routeOf(page.url())).toMatch(/^inbox/);
    await expect(page.locator(".inbox")).toBeVisible();
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toMatch(/^conversations/);
    await expect(page.locator(".conversations")).toBeVisible();
  });
});
