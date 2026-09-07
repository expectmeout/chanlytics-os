import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Campaigns › Broadcasts on a real workspace.
 *
 * The route renders the real page, not the Coming Soon card: the audience
 * chips carry the count of people who said yes, the templates are the
 * approved ones the workspace holds (or the honest line), the history is
 * what the route returns, and nothing is invented. Sending is never done
 * here — the workspace keeps no test broadcast — but the send button must
 * be disabled whenever nobody on the chosen audience has said yes.
 */
const INVENTED = ["credits", "Booked from broadcasts", "April win-back", "Serenity"];

test.describe("Broadcasts on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders the real page from the workspace's rows, templates and audiences, and never invents a number", async ({ page }) => {
    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    const real = page.getByTestId("broadcasts-real");
    await expect(real).toBeVisible();

    const [bc, tpl] = await Promise.all([
      page.request.get("/api/v1/broadcasts"),
      page.request.get("/api/v1/templates"),
    ]);
    expect(bc.status()).toBe(200);
    expect(tpl.status()).toBe(200);
    const broadcasts = (await bc.json()).data.broadcasts as { state: string }[];
    const approved = ((await tpl.json()).data.templates as { channel: string; meta_status: string }[]).filter((t) => t.channel === "whatsapp" && t.meta_status === "approved");

    // Audiences: at least "Everyone who said yes", each with a count.
    const chips = real.getByTestId("bc-audience");
    expect(await chips.count()).toBeGreaterThanOrEqual(1);
    await expect(chips.first()).toContainText("Everyone who said yes");

    // Templates: the approved ones, or the honest line.
    if (approved.length === 0) {
      await expect(real.getByTestId("bc-no-template")).toBeVisible();
    } else {
      await expect(real.getByTestId("bc-template")).toHaveCount(approved.length);
      await expect(real.getByTestId("bc-preview")).toBeVisible();
    }

    // History and Scheduled are exactly what the route holds.
    // Open = still to go out: scheduled, sending, or a playbook run held for a person (the page's own rule).
    const open = broadcasts.filter((b) => b.state === "scheduled" || b.state === "sending" || b.state === "pending_approval").length;
    await expect(real.getByTestId("bc-open")).toHaveCount(open);
    await expect(real.getByTestId("bc-history")).toHaveCount(broadcasts.length - open);

    const text = await real.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);

    // The number a broadcast goes out on, and what WhatsApp has said about it.
    await expect(real.getByTestId("bc-number")).toBeVisible();
    await expect(real.getByTestId("bc-number")).toContainText(/quality|No WhatsApp number/);

    // How a customer says yes: the card and the code, whenever there is a number.
    const numberLine = await real.getByTestId("bc-number").innerText();
    if (/WhatsApp \+/.test(numberLine)) {
      await expect(real.getByTestId("bc-optin")).toBeVisible();
      await expect(real.getByTestId("bc-optin")).toContainText("YES OFFERS");
      const qr = await page.request.get("/api/v1/consent/qr");
      expect(qr.status()).toBe(200);
      expect(qr.headers()["content-type"]).toContain("image/svg+xml");
      expect((await qr.text()).startsWith("<svg")).toBe(true);
    }

    // A template can be written here: the composer opens, and nothing is submitted.
    if (/WhatsApp \+/.test(numberLine)) {
      await real.getByTestId("bc-new-template").click();
      await expect(real.getByTestId("tpl-composer")).toBeVisible();
      await expect(real.getByTestId("tpl-submit")).toBeDisabled();
      await real.getByTestId("tpl-body").fill("Hi {{1}}, a quick note from {{2}}.");
      await expect(real.getByTestId("tpl-examples").locator("input")).toHaveCount(2);
      await expect(real.getByTestId("tpl-preview")).toContainText("{{1}}");
    }

    // A history row opens its people.
    if (broadcasts.length - open > 0) {
      await real.getByTestId("bc-history").first().click();
      await expect(real.getByTestId("bc-detail")).toBeVisible();
      await expect(real.getByTestId("bc-detail")).toContainText(/Got it|Held back|Reading/);
    }
  });

  test("the send button is disabled whenever nobody on the chosen audience has said yes", async ({ page }) => {
    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    const real = page.getByTestId("broadcasts-real");
    await expect(real).toBeVisible();
    const active = real.locator('[data-testid="bc-audience"].active');
    await expect(active).toHaveCount(1);
    const count = Number((await active.locator(".bc-chip-count").innerText()).trim());
    if (count === 0) {
      await expect(real.getByTestId("bc-send")).toBeDisabled();
      await expect(real.getByTestId("bc-nobody")).toBeVisible();
    } else {
      // Someone said yes: the button follows the template and its values, never the count alone.
      await expect(real.getByTestId("bc-nobody")).toHaveCount(0);
    }
  });
});
