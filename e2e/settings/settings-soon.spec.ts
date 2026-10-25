import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * Settings → Memory, on a real workspace.
 *
 * Built since decision 0070 (Ask remembers): what Ask keeps about the business, newest first, each line where it came
 * from, with a line of your own to add (settings/memory/pane.tsx). It was a "not built" pane until then, and before that
 * it fell through the shell's gate, which swapped the whole settings page for a bare "In design" card. It is a pane of
 * Settings: the nav stays, nothing seeded reaches a real session, and it says what is true, its lines or that it keeps none.
 */
const INVENTED = ["forgotten", "playbook defaults"];

test.describe("Settings → Memory on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("memory keeps the nav and says what Ask keeps, or that it keeps nothing yet", async ({ page }) => {
    await page.goto("/#/admin/memory");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("rec-card-memory");
    await expect(card).toBeVisible();
    // Its lines, or the empty line that says there are none: never both, never a seeded line.
    const lines = await card.getByTestId("mem-line").count();
    await expect(card.getByTestId("mem-none")).toHaveCount(lines === 0 ? 1 : 0);
    // The settings nav is still there: this is a pane, not a replacement page.
    await expect(page.locator(".set-nav")).toBeVisible();
    const text = await page.locator(".set-pane").innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
    expect(text).not.toContain("Not in this release");
  });
});
