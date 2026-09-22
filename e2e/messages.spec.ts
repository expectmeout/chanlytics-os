import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";

/**
 * Campaigns › Templates, on a real workspace: one card per template showing
 * the bubble the customer sees, the languages beside it, the three doors of
 * Campaigns in one strip, and never Meta's sample. Read-only except for
 * opening the composer and a card's menu; nothing here submits, hides or
 * deletes a template.
 */
test.describe("Templates on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("one card per template, the bubble the customer sees, the languages beside it, the sample never shown", async ({
    page,
  }) => {
    await page.goto("/#/messages");
    await page.waitForLoadState("networkidle");
    const real = page.getByTestId("messages-real");
    await expect(real).toBeVisible();
    // The strip is the shell's own, above the page: Playbooks · Broadcasts · Templates.
    const strip = page.locator(".stabs");
    await expect(strip).toContainText("Playbooks");
    await expect(strip.locator(".stabs-tab.active")).toHaveText("Templates");

    const res = await apiGet(page, "/api/v1/templates?all=1");
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    const wa = data.templates.filter(
      (t: { channel: string; name: string }) => t.channel === "whatsapp" && t.name !== "hello_world",
    );
    const shown = wa.filter((t: { hidden_at: string | null }) => !t.hidden_at);
    await expect(real).not.toContainText("hello_world");
    await expect(real.getByTestId("templates-hidden")).toHaveCount(wa.length - shown.length > 0 ? 1 : 0);

    const hasNumber = (await real.getByTestId("messages-no-number").count()) === 0;
    const starterNames = await page.evaluate(
      () =>
        (window as unknown as { __starters?: { list: Array<{ name: string }> } }).__starters?.list.map((s) => s.name) ??
        [],
    );
    // ONE language chip per message, however many languages it has: every starter
    // (with a number), and each message the workspace keeps in the composers,
    // counted once by its name. It was a slot per language, "EN ES" on every row.
    const own = new Set(shown.map((t: { name: string }) => t.name).filter((n: string) => !starterNames.includes(n)));
    await expect(real.getByTestId("template-lang")).toHaveCount(own.size + (hasNumber ? starterNames.length : 0));
    if (hasNumber) {
      expect(starterNames.length).toBeGreaterThanOrEqual(5);
      await expect(real.getByTestId("starter-row")).toHaveCount(starterNames.length);
      const first = real.getByTestId("starter-row").first();
      await expect(first).toContainText("Win-back");
      // The chip opens the languages there are, and closes without touching anything.
      await first.getByTestId("template-lang").click();
      await expect(page.getByTestId("template-lang-pop")).toBeVisible();
      await expect(page.getByTestId("template-lang-option").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("template-lang-pop")).toHaveCount(0);
      // Opened, the message carries words, never a bare {{1}} for a template WhatsApp holds.
      await first.getByTestId("template-open").click();
      await expect(first.getByTestId("message-preview")).toBeVisible();
      const bubble = (await first.getByTestId("message-preview").innerText()).trim();
      expect(bubble.length).toBeGreaterThan(20);
      // A card's menu offers the verbs and closes without touching anything.
      if ((await first.getByTestId("template-menu").count()) > 0) {
        await first.getByTestId("template-menu").click();
        await expect(first.getByTestId("template-delete")).toBeVisible();
        await first.getByRole("button", { name: "Close" }).click();
        await expect(first.getByTestId("template-delete")).toHaveCount(0);
      }
      // The composer opens on the page and closes again.
      if ((await real.getByTestId("template-new").count()) > 0) {
        await real.getByTestId("template-new").click();
        await expect(real.getByTestId("tpl-composer")).toBeVisible();
        await real.getByTestId("template-new").click();
        await expect(real.getByTestId("tpl-composer")).toHaveCount(0);
      }
    }
  });

  test("the three doors of Campaigns are one strip on each page", async ({ page }) => {
    await page.goto("/#/outbound");
    await page.waitForLoadState("networkidle");
    const strip = page.locator(".stabs");
    await expect(strip.locator(".stabs-tab.active")).toHaveText("Playbooks");
    // Three doors on a real workspace: Content is seed-only and stays out of the strip.
    await expect(strip.locator(".stabs-tab")).toHaveCount(3);
    // The route is still `messages`: only what a person reads changed.
    await strip.getByRole("button", { name: "Templates" }).click();
    await expect(page).toHaveURL(/#\/messages/);
    await expect(page.getByTestId("messages-real")).toBeVisible();
    await expect(page.locator(".stabs .stabs-tab.active")).toHaveText("Templates");
    await strip.getByRole("button", { name: "Broadcasts" }).click();
    await expect(page).toHaveURL(/#\/broadcasts/);
    await expect(page.locator(".stabs .stabs-tab.active")).toHaveText("Broadcasts");
  });
});
