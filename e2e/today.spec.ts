import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Today on a real workspace: the hero says what is happening, and everything
 * that asks for a person is one queue in the strip's row grammar — a
 * sentence, a state line and one verb per row — never the same rows twice.
 */
test.describe("Today on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("one queue: every row has a sentence, a state line and one verb; the hero keeps the narrative", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".brief")).toBeVisible();
    const queue = page.getByTestId("today-queue");
    await expect(queue).toBeVisible();
    const rows = queue.locator(".cl-attn-row");
    const n = await rows.count();
    for (const row of await rows.all()) {
      expect((await row.locator(".cl-attn-sentence").innerText()).trim().length).toBeGreaterThan(0);
      expect((await row.locator(".cl-attn-status").innerText()).trim().length).toBeGreaterThan(0);
      await expect(row.locator(".cl-attn-cta.primary")).toHaveCount(1);
    }
    if (n === 0) await expect(queue.getByText("All caught up")).toBeVisible();
    // The rows live in the queue alone: the hero no longer repeats them.
    await expect(page.locator(".brief").getByText("Open and reply")).toHaveCount(0);
    await expect(page.getByText("Agent Command")).toHaveCount(0);
    // Nothing invented: no dollar amounts on a page with no revenue column.
    expect(await page.locator("body").innerText()).not.toMatch(/\$\d/);
  });
});
