import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { dealsAreOn, startersOffered } from "../../packages/contracts/src/index";
import { atRoute, routeOf } from "../address";
import { apiGet } from "../workspace";

/** Whether the page wears Glass, the default look: there the top bar's crumbs are empty and hidden, and the frame's head names the room. */
const wearsGlass = async (page: Page): Promise<boolean> =>
  (await page.locator("html").getAttribute("data-look")) === "glass";

/** The room's name, where the look says it: the head's title in Glass, the top bar's crumbs in Classic. */
async function expectRoomNamed(page: Page, name: string) {
  if (await wearsGlass(page)) await expect(page.locator(".pg-head .pg-title")).toHaveText(name);
  else await expect(page.locator(".crumbs")).toContainText(name);
}

/** A room's way back to Campaigns' home, which every room has: the head's "‹ Campaigns" in Glass, the first crumb in Classic. */
async function backToCampaigns(page: Page) {
  if (await wearsGlass(page)) {
    const back = page.locator(".pg-back");
    await expect(back).toContainText("Campaigns");
    await back.click();
  } else {
    await page.locator(".crumbs").getByRole("button", { name: "Campaigns" }).click();
  }
}

/**
 * Campaigns › Library (the Templates page, a room of Campaigns' home), on a real workspace: one row per template, opening
 * beside the list on the bubble the customer sees with its languages, reached from the home, and never Meta's sample.
 * Read-only except for opening the composer and a message's menu; nothing here
 * submits, hides or deletes a template.
 */
test.describe("The Library on a real workspace", () => {
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
    // No strip of tabs: the Library is a room of the home, and its head says so.
    await expect(page.locator(".stabs-campaigns")).toHaveCount(0);
    await expectRoomNamed(page, "Library");

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
    // A message's languages are what it opens into: no closed row carries a language
    // control (they were a column of every row, "● EN ⌄" sixteen times), and the open
    // message carries ONE, however many languages it has.
    await expect(real.getByTestId("template-lang")).toHaveCount(0);
    if (hasNumber) {
      expect(starterNames.length).toBeGreaterThanOrEqual(5);
      await expect(real.getByTestId("starter-row")).toHaveCount(starterNames.length);
      const first = real.getByTestId("starter-row").first();
      await expect(first).toContainText("Win-back");
      // Opened, the message is in the pane beside the list (the Inbox's list + pane, docs/2026-10-02-campaigns-on-the-kit.md
      // §3.1), not under its row, and carries words, never a bare {{1}} for a template WhatsApp holds.
      await first.getByTestId("template-open").click();
      const pane = real.getByTestId("template-pane");
      await expect(pane).toBeVisible();
      await expect(pane.getByTestId("message-preview")).toBeVisible();
      // Its one language chip opens the languages there are, and closes without touching anything.
      await expect(pane.getByTestId("template-lang")).toHaveCount(1);
      // (The kit's Picker: its list pops on the body, its options are the page's `option`s, and Escape closes it.)
      await pane.getByTestId("template-lang").click();
      await expect(page.locator(".rec-combo-pop")).toBeVisible();
      await expect(page.getByRole("option").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".rec-combo-pop")).toHaveCount(0);
      const bubble = (await pane.getByTestId("message-preview").innerText()).trim();
      expect(bubble.length).toBeGreaterThan(20);
      // The pane's menu (the kit's, drawn on the page's body) offers the verbs and closes without touching anything.
      if ((await pane.getByTestId("template-menu").count()) > 0) {
        await pane.getByTestId("template-menu").click();
        await expect(page.getByTestId("template-delete")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("template-delete")).toHaveCount(0);
      }
      // The composer opens beside the list and is cancelled again (nothing written, so nothing is asked).
      if ((await real.getByTestId("template-new").count()) > 0) {
        await real.getByTestId("template-new").click();
        await expect(real.getByTestId("tpl-composer")).toBeVisible();
        await real.getByTestId("tpl-close").click();
        await expect(real.getByTestId("tpl-composer")).toHaveCount(0);
      }
    }
  });

  test("Campaigns is one home with two rooms: the Library and Sent are reached from it, and each goes back to it", async ({
    page,
  }) => {
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("campaigns-home")).toBeVisible();
    // No strip of tabs: the three doors of the old strip are the home, and its two rooms.
    await expect(page.locator(".stabs-campaigns")).toHaveCount(0);
    // The route is still `messages`: only what a person reads changed.
    await page.getByTestId("cmh-library").click();
    await expect(page).toHaveURL(atRoute(/^messages/));
    await expect(page.getByTestId("messages-real")).toBeVisible();
    // Every room's way back, Campaigns, goes to the home.
    await backToCampaigns(page);
    await expect(page).toHaveURL(atRoute(/^campaigns$/));
    await expect(page.getByTestId("campaigns-home")).toBeVisible();
    // Sent is the Broadcasts page: its runs, one press from "What came back".
    await page.goto("/#/broadcasts");
    await expect(page.getByTestId("broadcasts-real")).toBeVisible();
    await expect(page.locator(".stabs-campaigns")).toHaveCount(0);
    await expectRoomNamed(page, "Sent");
    await backToCampaigns(page);
    await expect(page).toHaveURL(atRoute(/^campaigns$/));
  });

  /**
   * Campaigns are three pages of their own (decision 0015, step 7): App Router pages at /w/<slug>/campaigns, /w/<slug>/broadcasts
   * and /w/<slug>/templates, the frame around each. The path says the product's word where the shell's route says another
   * (`messages`), and the old names, in a path and in a hash, move for ever: the Library to its word, and the old Playbooks
   * list (`outbound`, `playbooks`) to the home.
   */
  test("Campaigns are pages of their own on their paths: each boots there, the old names move, and the router walks them", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);
    const pages = [
      ["campaigns", "campaigns", "campaigns-home"],
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
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/campaigns`);
    await expect(page.getByTestId("campaigns-home")).toBeVisible();
    await page.goto(`/w/${slug}/playbooks`);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/campaigns`);
    await page.goto(`/w/${slug}#/messages`);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/templates`);
    await expect(page.getByTestId("messages-real")).toBeVisible();

    // A move from the home to a room walks the router, and Back lands on the page before it.
    await page.goto(`/w/${slug}/campaigns`);
    await expect(page.getByTestId("campaigns-home")).toBeVisible();
    await page.getByTestId("cmh-library").click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/templates`);
    await expect(page.getByTestId("messages-real")).toBeVisible();
    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/w/${slug}/campaigns`);
    await expect(page.getByTestId("campaigns-home")).toBeVisible();

    // Templates has one address: an address under it is not a page of Campaigns.
    await page.goto(`/w/${slug}/templates/anything`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("messages-real")).toHaveCount(0);
  });
});
