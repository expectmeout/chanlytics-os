import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";

/**
 * Setup on a real workspace: one page whose every row is a fact the
 * workspace holds — a state in words, a sentence, at most one verb — with a
 * readiness sentence Today repeats as one line while something is open.
 */
test.describe("Setup on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the rows, each with a state in words, a sentence and at most one verb; Setup is the first Workspace tab, after Profile", async ({ page }) => {
    // Nine rows, and a tenth for the Google listing where the platform can look one up.
    const google = (await (await apiGet(page, "/api/v1/google")).json()).data as { google: { ready: { places: boolean } } };
    await page.goto("/#/admin/setup");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("setup-readiness")).toBeVisible();
    // The rail: You (Profile) first, then the Workspace group, which Setup opens.
    await expect(page.locator(".set-nav-row").first()).toHaveText(/Profile/);
    await expect(page.locator(".set-nav-row").nth(1)).toHaveText(/Setup/);
    await expect(page.getByTestId("setup-count")).toHaveText(/^\d+ of \d+ ready$/);
    expect((await page.getByTestId("setup-sentence").innerText()).trim().length).toBeGreaterThan(0);
    const rows = page.getByTestId("setup-rows").locator(".cl-attn-row");
    await expect(rows).toHaveCount(google.google.ready.places ? 10 : 9);
    for (const row of await rows.all()) {
      await expect(row.locator(".cl-attn-status .lead")).toHaveText(/^(Not started|Waiting on you|Waiting on us|Waiting on Meta|Ready)$/);
      expect((await row.locator(".cl-attn-sentence").innerText()).trim().length).toBeGreaterThan(0);
      expect((await row.locator(".cl-attn-status").innerText()).trim().length).toBeGreaterThan(0);
      expect(await row.getByTestId("setup-verb").count()).toBeLessThanOrEqual(1);
    }
    // Nothing invented: no prices on a page that reads facts -- except the
    // line row, which names the carrier's real monthly cost before an owner
    // buys a number, and the chooser that opens under it.
    for (const row of await rows.all()) {
      if ((await row.getAttribute("data-testid")) === "setup-row-line") continue;
      expect(await row.innerText()).not.toMatch(/\$\d/);
    }
  });

  test("later is a preference on this device: an optional open row fades and leaves the count, and comes back", async ({ page }) => {
    await page.goto("/#/admin/setup");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("setup-readiness")).toBeVisible();
    const laterButtons = page.locator('[data-testid^="setup-later-"]');
    test.skip((await laterButtons.count()) === 0, "every optional row on this workspace is ready — nothing to put off");
    const btn = laterButtons.first();
    await expect(btn).toHaveText("Later");
    await btn.click();
    const faded = page.locator(".setup-later");
    await expect(faded).toHaveCount(1);
    await expect(faded.locator('[data-testid^="setup-later-"]')).toHaveText("Undo later");
    await faded.locator('[data-testid^="setup-later-"]').click();
    await expect(page.locator(".setup-later")).toHaveCount(0);
  });

  test("Today carries one Setup line only while something is open, with the same count as the page", async ({ page }) => {
    await page.goto("/#/admin/setup");
    await page.waitForLoadState("networkidle");
    const count = (await page.getByTestId("setup-count").innerText()).match(/^(\d+) of (\d+)/);
    expect(count).not.toBeNull();
    const hasNext = (await page.getByTestId("setup-next").count()) > 0;
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-standing")).toBeVisible();
    const line = page.getByTestId("brief-setup");
    if (!hasNext) {
      await expect(line).toHaveCount(0);
      return;
    }
    await expect(line).toHaveText(new RegExp(`^Setup · ${count![1]} of ${count![2]} · `));
    await line.getByRole("button", { name: /Open Setup/ }).click();
    await expect(page).toHaveURL(/#\/admin\/setup/);
    await expect(page.getByTestId("setup-readiness")).toBeVisible();
  });

  test("a workspace whose receptionist answers is not sent to Setup on arrival", async ({ page }) => {
    await page.goto("/#/admin/setup");
    await page.waitForLoadState("networkidle");
    const sentence = await page.getByTestId("setup-sentence").innerText();
    test.skip(/not answering yet/.test(sentence), "this workspace answers nowhere yet — the landing rule applies");
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-standing")).toBeVisible();
    await expect(page).toHaveURL(/#\/today/);
  });
});
