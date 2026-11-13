import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { CAMPAIGN_ROOMS, startersOffered } from "../../packages/contracts/src/index";
import { activeWorkspace, apiGet, scoped } from "../workspace";
import { libraryRows, messagesOf, type TemplatesRead } from "./offered";

/** The room's name: the frame's head's title (the top bar's crumbs are empty and hidden in Glass, the one look). */
async function expectRoomNamed(page: Page, name: string) {
  await expect(page.locator(".pg-head .pg-title")).toHaveText(name);
}

/**
 * Campaigns › Messages (the Templates page; decision 0060, D4: it was the Library), on a real workspace: one row per message,
 * whatever channels it has a version on, opening beside the list on the bubble the customer sees with its languages, in
 * Campaigns' strip beside Sequences, and never Meta's sample. A message needs no WhatsApp row and the page needs no WhatsApp number: the starter
 * set is offered, a new message is written, and a quiet line says where the number is missing. The first test reads only
 * (it opens the composer and a message's menu); the second writes a message of its own, an email alone, renames it, puts
 * it away and back and deletes it, and leaves nothing behind.
 */
test.describe("Messages on a real workspace", () => {
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
    // Campaigns' strip, Sequences | Messages, with this one lit; the head is the room's, Campaigns, as on Sequences
    // (one head for the two, #1667).
    await expect(page.getByTestId("campaigns-view-messages")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("campaigns-view-sequences")).toBeVisible();
    await expectRoomNamed(page, CAMPAIGN_ROOMS.home);

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
    // The starters offered are contracts' own (the page reads them the same way): every workspace's, the proposal
    // follow-up's too (0008, amended 18 Oct 2026), and the review ask where its Google listing keeps a review link, as
    // GET settings says it to the page.
    const settings = await apiGet(page, "/api/v1/settings");
    expect(settings.status()).toBe(200);
    const reviewLink = ((await settings.json()).data as { review_link?: boolean }).review_link === true;
    const starterNames = startersOffered({ reviewLink }).map((s) => s.name);
    // The list is the messages, in groups: the set's starters, a row each, whatever of it the workspace holds, and a row to
    // each name it wrote or synced, whatever languages and channels it holds, with Put away folding what it hid.
    const rows = libraryRows(messages, starterNames);
    await expect(real.getByTestId("templates-hidden")).toHaveCount(rows.hidden ? 1 : 0);
    // The groups that fold (Ready, Ready-made, Put away: Messages, the canvas of 10 Nov 2026, and the clean list of 13 Nov
    // 2026) opened, so every row is there to count.
    for (const fold of ["templates-fold-idle", "templates-fold-made", "templates-hidden"]) {
      const head = real.getByTestId(fold);
      if ((await head.count()) > 0 && (await head.getAttribute("aria-expanded")) === "false") await head.click();
    }
    // No starter is said to be missing, and nothing under the list asks about WhatsApp (the clean list).
    await expect(real).not.toContainText("Not added");
    await expect(real).not.toContainText("Not in use");
    await expect(real).not.toContainText("Checked with WhatsApp");
    // A message's languages are what it opens into: no closed row carries a language
    // control (they were a column of every row, "● EN ⌄" sixteen times), and the open
    // message carries ONE, however many languages it has.
    await expect(real.getByTestId("template-lang")).toHaveCount(0);
    expect(starterNames.length).toBeGreaterThanOrEqual(5);
    await expect(real.getByTestId("starter-row")).toHaveCount(rows.starterRows);
    await expect(real.getByTestId("custom-row")).toHaveCount(rows.customRows);
    // The set's win-back, wherever it stands: the starters nothing sends are sorted by what each is for, an
    // appointment's first, so the list no longer opens on it.
    const first = real.getByTestId("starter-row").filter({ hasText: "Win-back" }).first();
    await expect(first).toBeVisible();
    // Opened, the message is in the pane beside the list (the Inbox's list + pane, docs/2026-10-02-campaigns-on-the-kit.md
    // §3.1), not under its row, and carries words, never a bare {{1}} for a template WhatsApp holds.
    await first.getByTestId("template-open").click();
    const pane = real.getByTestId("template-pane");
    await expect(pane).toBeVisible();
    await expect(pane.getByTestId("message-preview")).toBeVisible();
    // Its language is a quiet word only where there is a choice (the message sheet's canvas, 12 Nov 2026): at most one, and
    // where it is drawn it opens the languages there are and closes without touching anything.
    const languages = await pane.getByTestId("template-lang").count();
    expect(languages).toBeLessThanOrEqual(1);
    if (languages === 1) {
      // (The kit's Picker: its list pops on the body, its options are the page's `option`s, and Escape closes it.)
      await pane.getByTestId("template-lang").click();
      await expect(page.locator(".rec-combo-pop")).toBeVisible();
      await expect(page.getByRole("option").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".rec-combo-pop")).toHaveCount(0);
    }
    const bubble = (await pane.getByTestId("message-preview").innerText()).trim();
    expect(bubble.length).toBeGreaterThan(20);
    // The pane's menu, on its name (the kit's, drawn on the page's body), offers the verbs and closes without touching anything.
    if ((await pane.getByTestId("template-menu").count()) > 0) {
      await pane.getByTestId("template-menu").click();
      await expect(page.getByTestId("template-delete")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("template-delete")).toHaveCount(0);
    }
    // New is one line to Ask (the Messages redesign's step 4), number or none: no form asks where it is sent first. The
    // page's one act, New, is drawn whenever a person may write, in the frame's head, outside the page's own element.
    await expect(page.getByRole("button", { name: "New message" })).toBeVisible();
    await page.getByRole("button", { name: "New message" }).click();
    await expect(real.getByTestId("template-new-words")).toBeVisible();
    await expect(real.getByTestId("messages-composer")).toHaveCount(0);
    await real.getByTestId("cm-pane-close").click();
    await expect(real.getByTestId("template-new-words")).toHaveCount(0);
  });

  /**
   * A message the spec writes itself, and takes away again (the message sheet's review, 12 Nov 2026): an email-only offer,
   * which needs no number and asks nothing of WhatsApp or Ask. Its name's menu is the message's whole (Rename, Put away,
   * Delete, with no WhatsApp version); a rename names every version; putting it away and back moves it between the groups;
   * Delete takes it, every version, and asks first. Whatever is left is deleted by its own door, so the seed's workspace
   * holds nothing new by morning.
   */
  test("a message of its own: renamed, put away and back, and deleted whole from its sheet", async ({ page }) => {
    await page.goto("/#/messages");
    await page.waitForLoadState("networkidle");
    const ws = await activeWorkspace(page);
    const fromTheApp = { headers: { origin: new URL(page.url()).origin } };
    const name = `e2e_note_${Date.now()}`;
    const made = await page.request.post(scoped("/api/v1/templates/versions", ws), {
      ...fromTheApp,
      data: {
        name,
        language: "en_US",
        channel: "email",
        subject: "This week at the studio",
        body: "Hi {{1}}, everything is 10% off this week.",
        message: {
          category: "marketing",
          variables: [{ position: 1, label: "First name", example: "Dani" }],
          title: "E2E note",
        },
      },
    });
    expect(made.status()).toBe(200);
    try {
      await page.reload();
      await page.waitForLoadState("networkidle");
      const real = page.getByTestId("messages-real");
      for (const fold of ["templates-fold-idle", "templates-hidden"]) {
        const head = real.getByTestId(fold);
        if ((await head.count()) > 0 && (await head.getAttribute("aria-expanded")) === "false") await head.click();
      }
      const row = real.locator(`[data-template="${name}"]`);
      await expect(row).toBeVisible();
      await row.getByTestId("template-open").click();
      const pane = real.getByTestId("template-pane");
      await expect(pane).toBeVisible();

      // Rename: the field opens where the name is read, and the row says the new name.
      await pane.getByTestId("template-menu").click();
      await page.getByTestId("template-rename").click();
      await pane.getByTestId("template-title").fill("E2E note renamed");
      await page.getByTestId("template-title-save").click();
      await expect(row).toContainText("E2E note renamed");

      // Put away, then back: the group it stands in follows.
      await pane.getByTestId("template-menu").click();
      await page.getByTestId("template-hide").click();
      await expect(pane.getByTestId("template-pane-status")).toContainText("Put away");
      await pane.getByTestId("template-menu").click();
      await page.getByTestId("template-hide").click();
      await expect(pane.getByTestId("template-pane-status")).not.toContainText("Put away");

      // Delete asks first, then takes the message whole: its row is gone.
      await pane.getByTestId("template-menu").click();
      await page.getByTestId("template-delete").click();
      await expect(page.getByTestId("template-delete-confirm")).toContainText("Its email version goes");
      await page.getByTestId("template-delete-yes").click();
      await expect(real.locator(`[data-template="${name}"]`)).toHaveCount(0);
    } finally {
      // Whatever of it is left, by its own door: nothing new stays on the seed's workspace.
      const read = (await (await apiGet(page, "/api/v1/templates?all=1")).json()).data as TemplatesRead;
      for (const t of read.templates.filter((r) => r.name === name))
        await page.request.delete(scoped(`/api/v1/templates/versions/${t.id}`, ws), fromTheApp);
    }
  });
});
