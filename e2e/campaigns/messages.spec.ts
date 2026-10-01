import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { dealsAreOn, startersOffered } from "../../packages/contracts/src/index";
import { atRoute, routeOf } from "../address";
import { apiGet } from "../workspace";

/**
 * Campaigns › Templates, on a real workspace: one row per template, opening
 * on the bubble the customer sees with its languages, the three doors of
 * Campaigns in one strip, and never Meta's sample. Read-only except for
 * opening the composer and a row's menu; nothing here submits, hides or
 * deletes a template.
 */
test.describe("Templates on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("one row per template, opening on the bubble the customer sees and its languages, the sample never shown", async ({
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
    // The starters offered are contracts' own (the page reads them the same way), by how this workspace says its customers buy.
    const sellsBy = await page.evaluate(() => {
      const w = window as unknown as {
        __WORKSPACES?: Array<{ id: string; sells_by?: string | null }>;
        __ACTIVE_WORKSPACE?: string;
      };
      return w.__WORKSPACES?.find((t) => t.id === w.__ACTIVE_WORKSPACE)?.sells_by ?? null;
    });
    const starterNames = startersOffered(dealsAreOn(sellsBy)).map((s) => s.name);
    // A message's languages are the row it opens: no closed row carries a language
    // control (they were a column of every row, "● EN ⌄" sixteen times), and an open
    // row carries ONE, however many languages the message has.
    await expect(real.getByTestId("template-lang")).toHaveCount(0);
    if (hasNumber) {
      expect(starterNames.length).toBeGreaterThanOrEqual(5);
      await expect(real.getByTestId("starter-row")).toHaveCount(starterNames.length);
      const first = real.getByTestId("starter-row").first();
      await expect(first).toContainText("Win-back");
      // Opened, the message carries words, never a bare {{1}} for a template WhatsApp holds.
      await first.getByTestId("template-open").click();
      await expect(first.getByTestId("message-preview")).toBeVisible();
      // Its one language chip opens the languages there are, and closes without touching anything.
      await expect(first.getByTestId("template-lang")).toHaveCount(1);
      await first.getByTestId("template-lang").click();
      await expect(page.getByTestId("template-lang-pop")).toBeVisible();
      await expect(page.getByTestId("template-lang-option").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("template-lang-pop")).toHaveCount(0);
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
    await expect(page).toHaveURL(atRoute(/^messages/));
    await expect(page.getByTestId("messages-real")).toBeVisible();
    await expect(page.locator(".stabs .stabs-tab.active")).toHaveText("Templates");
    await strip.getByRole("button", { name: "Broadcasts" }).click();
    await expect(page).toHaveURL(atRoute(/^broadcasts/));
    await expect(page.locator(".stabs .stabs-tab.active")).toHaveText("Broadcasts");
  });

  /**
   * Campaigns are three pages of their own (decision 0015, step 7): App Router pages at /w/<slug>/playbooks, /w/<slug>/broadcasts
   * and /w/<slug>/templates, the frame around each. The path says the product's word where the shell's route says another
   * (`outbound`, `messages`), and the old names, in a path and in a hash, move to the word for ever.
   */
  test("Campaigns are pages of their own on their paths: each boots there, the old names move, and the router walks them", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);
    const pages = [
      ["playbooks", "outbound", "playbooks-real"],
      ["broadcasts", "broadcasts", "broadcasts-real"],
      ["templates", "messages", "messages-real"],
    ] as const;

    // A load of each path boots the frame with Campaigns lit and the page drawn inside it.
    for (const [word, route, testid] of pages) {
      await page.goto("/api/version");
      await page.goto(`/w/${slug}/${word}`);
      await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("Campaigns");
      await expect(page.getByTestId(testid)).toBeVisible();
      expect(routeOf(page.url())).toBe(route);
    }

    // The old names still land, and move to the word: a path, and a hash.
    await page.goto(`/w/${slug}/outbound`);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/playbooks`);
    await expect(page.getByTestId("playbooks-real")).toBeVisible();
    await page.goto(`/w/${slug}#/messages`);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/templates`);
    await expect(page.getByTestId("messages-real")).toBeVisible();

    // The strip walks the router, and Back lands on the page before it.
    const strip = page.locator(".stabs");
    await strip.getByRole("button", { name: "Broadcasts" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/broadcasts`);
    await expect(page.getByTestId("broadcasts-real")).toBeVisible();
    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/templates`);
    await expect(page.getByTestId("messages-real")).toBeVisible();

    // Templates has one address: an address under it is not a page of Campaigns.
    await page.goto(`/w/${slug}/templates/anything`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("messages-real")).toHaveCount(0);
  });
});
