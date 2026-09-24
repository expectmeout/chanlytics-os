import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Setup on a real workspace, as the first run draws it (#/start): Setup's own rows, one step to a screen, every row a
 * fact the workspace holds -- a state in words, a sentence, at most one verb -- and what is left after it as one card
 * on Today. The Setup tab left Settings; its old address lands on the first run.
 */

/** Every step the rail lets the owner open: the ones done, and the one the workspace is on. */
async function stepsReached(page: Page): Promise<string[]> {
  const ids: string[] = [];
  for (const b of await page.locator('[data-testid^="fr-rail-"]').all()) {
    const id = await b.getAttribute("data-testid");
    if (id) ids.push(id.slice("fr-rail-".length));
  }
  return ids;
}

test.describe("Setup on a real workspace, a step at a time", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("every step's rows read a state in words, a sentence and at most one verb, and name no price", async ({
    page,
  }) => {
    await page.goto("/#/start");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("first-run")).toBeVisible();
    const reached = await stepsReached(page);
    expect(reached.length, "the step the workspace is on is always open").toBeGreaterThan(0);
    for (const step of reached) {
      await page.getByTestId(`fr-rail-${step}`).click();
      const rows = page.getByTestId("fr-rows").locator(".cl-attn-row");
      for (const row of await rows.all()) {
        // The row reads across: its glyph, then its words, then its verbs. Today's queue hides its own disc, and while
        // that rule named only .tq -- the card these rows sit in too -- it hid Setup's glyphs as well.
        await expect(row.locator(".cl-attn-avatar")).toBeVisible();
        expect(
          await row.locator(".cl-attn-who").evaluate((el) => el.scrollWidth <= el.clientWidth),
          "the title is whole",
        ).toBe(true);
        await expect(row.locator(".cl-attn-status .lead")).toHaveText(
          /^(Not started|Waiting on you|Waiting on us|Waiting on Meta|Ready)$/,
        );
        expect((await row.locator(".cl-attn-sentence").innerText()).trim().length).toBeGreaterThan(0);
        expect(await row.getByTestId("setup-verb").count()).toBeLessThanOrEqual(1);
        // The number is part of the plan (decision 1): nothing here names a price.
        expect(await row.innerText()).not.toMatch(/\$\d/);
      }
    }
  });

  test("Setup is not a Settings tab any more, and its old address opens the first run", async ({ page }) => {
    await page.goto("/#/admin");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".set-nav-row").first()).toHaveText(/Profile/);
    for (const label of await page.locator(".set-nav-row").allInnerTexts()) expect(label).not.toMatch(/^Setup\b/);
    await page.goto("/#/admin/setup");
    await expect(page).toHaveURL(/#\/start$/);
    await expect(page.getByTestId("first-run")).toBeVisible();
  });

  test("Later is this person's: a row put off stays put off after a reload, and comes back when taken back", async ({
    page,
  }) => {
    await page.goto("/#/start");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("first-run")).toBeVisible();
    let step: string | null = null;
    for (const s of await stepsReached(page)) {
      await page.getByTestId(`fr-rail-${s}`).click();
      if ((await page.locator('[data-testid^="setup-later-"]').count()) > 0) {
        step = s;
        break;
      }
    }
    test.skip(step === null, "every optional row this workspace has reached is ready — nothing to put off");
    const btn = page.locator('[data-testid^="setup-later-"]').first();
    const id = await btn.getAttribute("data-testid");
    await expect(btn).toHaveText("Later");
    await btn.click();
    await expect(page.getByTestId(id!)).toHaveText("Undo later");
    // Kept in the member's saved view, not this tab: a reload still has it.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByTestId(`fr-rail-${step}`).click();
    await expect(page.getByTestId(id!)).toHaveText("Undo later");
    await page.getByTestId(id!).click();
    await expect(page.getByTestId(id!)).toHaveText("Later");
  });

  test("Today carries one card of what is left: the first run while nothing answers, Setup's own rows after", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-queue")).toBeVisible();
    const card = page.getByTestId("today-setup");
    if ((await card.count()) === 0) return; // nothing left to set up
    await expect(card.locator(".tq-sub")).toHaveText(/^\d+ (steps? )?left$/);
    const start = card.getByTestId("today-setup-go");
    if ((await start.count()) > 0) {
      await expect(start).toHaveText("Continue setting up");
      await start.click();
      await expect(page).toHaveURL(/#\/start/);
      await expect(page.getByTestId("first-run")).toBeVisible();
      return;
    }
    const rows = card.locator(".cl-attn-row");
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.first().locator('[data-testid^="setup-later-"]')).toHaveText("Skip");
  });

  test("a workspace whose receptionist answers is not sent to the first run on arrival", async ({ page }) => {
    await page.goto("/#/start");
    await page.waitForLoadState("networkidle");
    const status = await page.getByTestId("fr-card-status").innerText();
    test.skip(/Not answering yet/.test(status), "this workspace answers nowhere yet — the landing rule applies");
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-queue")).toBeVisible();
    await expect(page).toHaveURL(/#\/today/);
  });
});
