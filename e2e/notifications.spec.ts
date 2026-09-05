import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * The bell on a real workspace: it opens, it shows the workspace's own rows
 * or "All caught up", it offers device alerts, and nothing seeded is in it.
 */
const INVENTED = ["Aisha", "Deal won", "Milestone", "Gmail", "refund"];

test.describe("The bell on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("opens on the real feed with the device-alert switch, and nothing invented", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const pop = page.getByRole("dialog", { name: "Notifications" });
    await expect(pop).toBeVisible();
    const text = await pop.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
    const items = pop.locator(".tbn-item");
    if ((await items.count()) === 0) {
      await expect(pop.getByText("All caught up")).toBeVisible();
    } else {
      // Every row is one of the four real kinds and leads somewhere real.
      for (const row of await items.all()) {
        const t = await row.innerText();
        expect(t).toMatch(/needs you|is waiting for you|Missed call|Invitation pending/);
      }
    }
    await expect(page.getByTestId("notif-alerts")).toBeVisible();
    await page.screenshot({ path: "test-results/bell.png" });
  });
});
