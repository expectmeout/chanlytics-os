import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Settings → Billing and → AI memory, on a real workspace.
 *
 * Neither is built. They used to fall through the shell's gate, which swapped
 * the whole settings page for a bare "In design" card titled "billing" and
 * sent the owner back to Today. Now each is a pane: it keeps the settings
 * nav, says what is true, and nothing seeded (a plan, credits, learned rules)
 * reaches a real session.
 */
const INVENTED = ["Professional", "Buy credits", "Credits left", "Used this cycle", "forgotten", "playbook defaults"];

test.describe("Settings → Billing and AI memory on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const [pane, says] of [
    ["billing", "There is no billing in the product yet"],
    ["memory", "does not learn rules on its own yet"],
  ] as const) {
    test(`${pane} keeps the nav and says it is not built`, async ({ page }) => {
      await page.goto(`/#/admin/${pane}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId(`soon-${pane}`)).toBeVisible();
      await expect(page.getByTestId(`soon-${pane}`)).toContainText(says);
      // The settings nav is still there: this is a pane, not a replacement page.
      await expect(page.locator(".set-nav")).toBeVisible();
      const text = await page.locator(".set-pane").innerText();
      for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
      expect(text).not.toContain("In design — shipping next");
    });
  }
});
