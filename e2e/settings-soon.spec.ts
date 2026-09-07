import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Settings → AI memory, on a real workspace.
 *
 * Not built. It used to fall through the shell's gate, which swapped the
 * whole settings page for a bare "In design" card and sent the owner back
 * to Today. Now it is a pane: it keeps the settings nav, says what is true,
 * and nothing seeded (learned rules) reaches a real session. Billing became
 * real in the accounts-and-billing slice; billing.spec.ts covers it.
 */
const INVENTED = ["forgotten", "playbook defaults"];

test.describe("Settings → AI memory on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const [pane, says] of [
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
