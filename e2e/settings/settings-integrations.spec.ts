import { test, expect, type Locator } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute } from "../address";
import { apiGet } from "../workspace";

/**
 * Settings → Integrations, on a real workspace.
 *
 * The seeded pane showed seven "connected" services — Instagram, two
 * calendars, Stripe, Twilio, Gmail with a re-authorize nag — none of which
 * exist. The real pane is one row per connection in three groups: Connected
 * (from tenant_channels, Google, the calendar feed), Available (a door this
 * deployment has), Later (built for nobody yet: a Connect that is gated until
 * it is, and says so, #614). Nothing pretends.
 */
const INVENTED = ["Reauthorize by May 1", "7 of 7 healthy", "Twilio", "Apple Calendar", "Email Agent"];
const KINDS = [
  "whatsapp",
  "phone",
  "sms",
  "google_profile",
  "google_listing",
  "calendar",
  "instagram",
  "email",
  "deposits",
];

/**
 * Where a channel's row states its health. A row that waits on the owner says it in a line of its own; any other says
 * it when asked, in place, under the press beside its name (#1493, 8 Oct 2026: "all extra info should be on a need to
 * know"). Until then every row drew it, and these specs read the row's whole text.
 */
async function healthOf(row: Locator, kind: string): Promise<Locator> {
  const line = row.getByTestId(`connection-${kind}-line`);
  if (await line.count()) return line;
  await row.getByTestId(`connection-${kind}-why`).click();
  return row.getByTestId(`connection-${kind}-says`);
}

test.describe("Settings → Integrations on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the signup route says whether a number can be connected, and why not", async ({ page }) => {
    const res = await apiGet(page, "/api/v1/channels/whatsapp/signup");
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(typeof data.ready).toBe("boolean");
    if (!data.ready) expect(typeof data.reason).toBe("string");
    expect(typeof data.canConnect).toBe("boolean");
    // Never a credential in the answer.
    expect(JSON.stringify(data)).not.toMatch(/secret|token/i);
  });

  test("every connection is a row, once, in its group; Later rows offer nothing live", async ({ page }) => {
    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("connections-connected")).toBeVisible();
    await expect(page.getByTestId("connections-later")).toBeVisible();
    for (const k of KINDS) await expect(page.getByTestId(`connection-${k}`)).toHaveCount(1);
    const later = page.getByTestId("connections-later");
    await expect(later).toContainText("Instagram");
    await expect(later).toContainText("nothing here is connected");
    // A Later row offers nothing to press. It drew a gated Connect (#614) until the page said less (#1493, 8 Oct 2026):
    // now its word is "Soon", which says why when asked, and the one button a Later row may hold is the press beside
    // its name that opens what it would say.
    const soon = later.locator('[data-testid^="connection-"][data-testid$="-later"]');
    await expect(soon.first()).toBeVisible();
    for (const word of await soon.all()) {
      await expect(word).toHaveText("Soon");
      await expect(word).toHaveAttribute("title", /Not built yet/);
    }
    for (const button of await later.locator(".set-int-row button").all())
      await expect(button, "a Later row's only button opens what it says").toHaveAttribute("aria-label", /^About /);
    const text = await page.locator(".set-pane").innerText();
    for (const s of INVENTED) expect(text, `invented service: "${s}"`).not.toContain(s);
  });

  test("a workspace without a WhatsApp channel is offered the connection, or told why it cannot start", async ({
    page,
  }) => {
    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    const row = page.getByTestId("connection-whatsapp");
    await expect(row).toBeVisible();
    const state = await row.getAttribute("data-state");
    if (state === "connected" || state === "off") {
      await expect(await healthOf(row, "whatsapp")).toContainText(
        /Receiving|Quiet|Switched off|no message has arrived yet/,
      );
      return;
    }
    await expect(row).toContainText(/Connect WhatsApp|isn't set up to connect|Checking|Sign in to Meta/);
  });

  test("Integrations lists no template: the WhatsApp row points at Campaigns › Messages", async ({ page }) => {
    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("connections-connected")).toBeVisible();
    await expect(page.getByTestId("templates")).toHaveCount(0);
    const link = page.getByTestId("channel-messages");
    if (await link.count()) {
      await link.click();
      await expect(page).toHaveURL(atRoute(/^messages/));
      await expect(page.getByTestId("messages-real")).toBeVisible();
    }
  });

  test("on a phone, every card keeps its height", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    for (const g of ["connected", "available", "later"]) {
      const card = page.getByTestId(`connections-${g}`);
      if (!(await card.count())) continue;
      // A collapsed card is its head alone: about 64px. A whole one carries its rows.
      const rows = await card.locator(".set-int-row, .set-row").count();
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      if (rows > 0) expect(box!.height).toBeGreaterThan(100);
    }
  });

  test("connected rows state their health in the schema's words, and nothing invented", async ({ page }) => {
    await page.goto("/#/admin/integrations");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("connections-connected");
    await expect(card).toBeVisible();
    for (const k of ["whatsapp", "phone"]) {
      const row = card.getByTestId(`connection-${k}`);
      if (!(await row.count())) continue;
      await expect(await healthOf(row, k), "each channel states its health in the schema's words").toContainText(
        /Receiving|Quiet|Switched off|no (message|call) has arrived yet/,
      );
      await expect(row.locator(".pill")).toContainText(/^On$|^Off$/);
    }
  });
});
