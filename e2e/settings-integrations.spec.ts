import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Settings → Integrations, on a real workspace.
 *
 * The seeded pane showed seven "connected" services — Instagram, two
 * calendars, Stripe, Twilio, Gmail with a re-authorize nag — none of which
 * exist. The real pane lists the workspace's channels from tenant_channels
 * with whether each is on and when a customer last used it, and names the
 * rest as not available yet. Read-only.
 */
const INVENTED = ["Reauthorize by May 1", "7 of 7 healthy", "Twilio", "Apple Calendar", "Email Agent"];

test.describe("Settings → Integrations on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("lists the real channels with their state and nothing invented", async ({ page }) => {
    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("channels");
    await expect(card).toBeVisible();
    const text = await page.locator(".set-pane").innerText();
    for (const s of INVENTED) expect(text, `invented service: "${s}"`).not.toContain(s);

    const rows = card.locator(".set-int-row");
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all()) {
      const t = await row.innerText();
      expect(t, "each channel states its health in the schema's words").toMatch(/Receiving|Quiet|Switched off|no (message|call) has arrived yet/);
    }
    // No "Connected" pill: the schema has 'active' and 'disabled', and the pane says those.
    expect(text).not.toMatch(/\bConnected\b/);
    // The unbuilt services are named as such.
    await expect(page.getByTestId("not-available")).toBeVisible();
    await expect(page.getByTestId("not-available")).toContainText("Instagram");
  });
});
