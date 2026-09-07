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

  test("the signup route says whether a number can be connected, and why not", async ({ page }) => {
    const res = await page.request.get("/api/v1/channels/whatsapp/signup");
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(typeof data.ready).toBe("boolean");
    if (!data.ready) expect(typeof data.reason).toBe("string");
    expect(typeof data.canConnect).toBe("boolean");
    // Never a credential in the answer.
    expect(JSON.stringify(data)).not.toMatch(/secret|token/i);
  });

  test("a workspace without a WhatsApp channel is offered the connection, or told why it cannot start", async ({ page }) => {
    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("channels");
    await expect(card).toBeVisible();
    const hasWhatsApp = (await card.locator(".set-int-row", { hasText: "WhatsApp" }).count()) > 0;
    if (hasWhatsApp) return;
    const row = page.getByTestId("connect-whatsapp");
    await expect(row).toBeVisible();
    await expect(row).toContainText(/Connect WhatsApp|isn't set up to connect|connected by an owner|Checking/);
  });

  test("Integrations lists no template: the WhatsApp row points at Campaigns › Messages", async ({ page }) => {
    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("channels")).toBeVisible();
    await expect(page.getByTestId("templates")).toHaveCount(0);
    const link = page.getByTestId("channel-messages");
    if (await link.count()) {
      await link.click();
      await expect(page).toHaveURL(/#\/messages/);
      await expect(page.getByTestId("messages-real")).toBeVisible();
    }
  });

  test("on a phone, every card keeps its height", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    const channels = page.getByTestId("channels");
    await expect(channels).toBeVisible();
    // A collapsed card is its head alone: about 64px. A whole one carries its rows.
    const rows = await channels.locator(".set-int-row, .set-row").count();
    const box = await channels.boundingBox();
    expect(box).not.toBeNull();
    if (rows > 0) expect(box!.height).toBeGreaterThan(100);
    const google = page.getByTestId("google-card");
    if (await google.count()) {
      const gb = await google.boundingBox();
      expect(gb!.height).toBeGreaterThan(100);
    }
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
    // No "Connected" pill on a channel: the schema has 'active' and 'disabled', and the card says those.
    expect(await card.innerText()).not.toMatch(/\bConnected\b/);
    // The unbuilt services are named as such.
    await expect(page.getByTestId("not-available")).toBeVisible();
    await expect(page.getByTestId("not-available")).toContainText("Instagram");
  });
});
