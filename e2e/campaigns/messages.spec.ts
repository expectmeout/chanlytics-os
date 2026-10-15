import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { dealsAreOn, startersOffered } from "../../packages/contracts/src/index";
import { HOME_GIVES_WAY, sequencesShownIn } from "./shown";
import { atRoute, routeOf } from "../address";
import { apiGet } from "../workspace";
import { libraryRows, messagesOf, type TemplatesRead } from "./offered";

/** The room's name: the frame's head's title (the top bar's crumbs are empty and hidden in Glass, the one look). */
async function expectRoomNamed(page: Page, name: string) {
  await expect(page.locator(".pg-head .pg-title")).toHaveText(name);
}

/** A room's way back to Campaigns' home, which every room has: the head's "‹ Campaigns". */
async function backToCampaigns(page: Page) {
  const back = page.locator(".pg-back");
  await expect(back).toContainText("Campaigns");
  await back.click();
}

/**
 * Campaigns › Library (the Templates page, a room of Campaigns' home), on a real workspace: one row per message, whatever
 * channels it has a version on, opening beside the list on the bubble the customer sees with its languages, reached from
 * the home, and never Meta's sample. A message needs no WhatsApp row and the page needs no WhatsApp number: the starter
 * set is offered, a new message is written, and a quiet line says where the number is missing. Read-only except for
 * opening the composer and a message's menu; nothing here submits, hides or deletes a message.
 */
test.describe("The Library on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("one row per message, opening on the bubble the customer sees and its languages, the sample never shown", async ({
    page,
  }) => {
    await page.goto("/#/messages");
    await page.waitForLoadState("networkidle");
    const real = page.getByTestId("messages-real");
    await expect(real).toBeVisible();
    // No strip of tabs: the Library is a room of the home, and its head says so.
    await expect(page.locator(".stabs-campaigns")).toHaveCount(0);
    await expectRoomNamed(page, "Library");

    const [res, ch] = await Promise.all([apiGet(page, "/api/v1/templates?all=1"), apiGet(page, "/api/v1/channels")]);
    expect(res.status()).toBe(200);
    expect(ch.status()).toBe(200);
    const read = (await res.json()).data as TemplatesRead;
    // The page lists the messages the route answers (a name in a language, with a version on each channel it was written
    // for), not the WhatsApp rows: a message written for email or text alone is a row.
    const messages = messagesOf(read);
    await expect(real).not.toContainText("hello_world");
    // Whether there is a WhatsApp number, as the page reads it: a WhatsApp channel among the workspace's.
    const hasNumber = ((await ch.json()).data.channels as { kind: string }[]).some((c) => c.kind === "whatsapp");
    // The quiet line where the number is missing, and no wall: the list below it is drawn either way.
    await expect(real.getByTestId("messages-no-number")).toHaveCount(hasNumber ? 0 : 1);
    // The starters offered are contracts' own (the page reads them the same way), by how this workspace says its customers buy.
    const sellsBy = await page.evaluate(() => {
      const w = window as unknown as {
        __WORKSPACES?: Array<{ id: string; sells_by?: string | null }>;
        __ACTIVE_WORKSPACE?: string;
      };
      return w.__WORKSPACES?.find((t) => t.id === w.__ACTIVE_WORKSPACE)?.sells_by ?? null;
    });
    // And whether its Google listing keeps a review link, as GET settings says it to the page (the review ask's offer).
    const settings = await apiGet(page, "/api/v1/settings");
    expect(settings.status()).toBe(200);
    const reviewLink = ((await settings.json()).data as { review_link?: boolean }).review_link === true;
    const starterNames = startersOffered({ dealsOn: dealsAreOn(sellsBy), reviewLink }).map((s) => s.name);
    // The list is the messages: the set's starters, a row each, whatever of it the workspace holds, then a row to each name it
    // wrote or synced, whatever languages and channels it holds, and a fold for what it hid.
    const rows = libraryRows(messages, starterNames);
    await expect(real.getByTestId("templates-hidden")).toHaveCount(rows.hidden ? 1 : 0);
    // A message's languages are what it opens into: no closed row carries a language
    // control (they were a column of every row, "● EN ⌄" sixteen times), and the open
    // message carries ONE, however many languages it has.
    await expect(real.getByTestId("template-lang")).toHaveCount(0);
    expect(starterNames.length).toBeGreaterThanOrEqual(5);
    await expect(real.getByTestId("starter-row")).toHaveCount(rows.starterRows);
    await expect(real.getByTestId("custom-row")).toHaveCount(rows.customRows);
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
    // The composer opens beside the list and asks where the message is sent first -- Email, Text, WhatsApp -- opening on
    // WhatsApp where there is a number to write to and on Email where there is none, so a workspace without one is not
    // met by a wall; it is cancelled again (nothing written, so nothing is asked). The page's one act, New, is drawn
    // whenever a person may write, number or none, in the frame's head, outside the page's own element.
    await expect(page.getByTestId("template-new")).toBeVisible();
    await page.getByTestId("template-new").click();
    const step = real.getByTestId("tpl-where-step");
    await expect(step).toBeVisible();
    for (const where of ["email", "sms", "whatsapp"])
      await expect(step.getByTestId(`tpl-where-${where}`)).toBeVisible();
    await expect(step.getByTestId(`tpl-where-${hasNumber ? "whatsapp" : "email"}`)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    if (hasNumber) {
      await expect(real.getByTestId("tpl-composer")).toBeVisible();
    } else {
      await expect(real.getByTestId("tpl-own")).toBeVisible();
      await expect(real.getByTestId("tpl-composer")).toHaveCount(0);
    }
    await real.getByTestId("tpl-close").click();
    await expect(real.getByTestId("messages-composer")).toHaveCount(0);
  });

  test("Campaigns is one home with two rooms: the Library and Sent are reached from it, and each goes back to it", async ({
    page,
  }) => {
    test.skip(await sequencesShownIn(page), HOME_GIVES_WAY);
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
    test.skip(await sequencesShownIn(page), HOME_GIVES_WAY);
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
