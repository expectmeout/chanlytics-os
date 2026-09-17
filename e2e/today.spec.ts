import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";

/**
 * Today on a real workspace: the hero says what is happening, and everything
 * that asks for a person is one queue in the strip's row grammar — a
 * sentence, a state line and one verb per row — never the same rows twice.
 */
test.describe("Today on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("one queue: every row has a sentence, a state line and one verb; the hero keeps the narrative", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-standing")).toBeVisible();
    const queue = page.getByTestId("today-queue");
    await expect(queue).toBeVisible();
    const rows = queue.locator(".cl-attn-row");
    const n = await rows.count();
    for (const row of await rows.all()) {
      expect((await row.locator(".cl-attn-sentence").innerText()).trim().length).toBeGreaterThan(0);
      expect((await row.locator(".cl-attn-status").innerText()).trim().length).toBeGreaterThan(0);
      await expect(row.locator(".cl-attn-cta.primary")).toHaveCount(1);
    }
    if (n === 0) await expect(queue.getByText("All caught up")).toBeVisible();
    // The rows live in the queue alone: neither the standing line above it nor the recap under it repeats them.
    await expect(page.getByTestId("today-standing").getByText("Open and reply")).toHaveCount(0);
    await expect(page.getByTestId("today-recap").getByText("Open and reply")).toHaveCount(0);
    await expect(page.getByText("Agent Command")).toHaveCount(0);
    // Nothing invented: no dollar amounts in any fact or tile on a page with no
    // revenue column. A customer's own words may name a price; the numbers may not.
    for (const cell of await page.locator(".today-standing, .today-recap-line, .rp2-tile").allInnerTexts()) expect(cell).not.toMatch(/\$\d/);
  });

  test("the day beside the queue: today and tomorrow from the calendar when there is one, nothing when there is not", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    // The page decides: with a readable feed the module is there; without one
    // it is absent, and the calendar route says why.
    const day = page.getByTestId("today-day");
    await day.waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
    if ((await day.count()) === 0) {
      const res = await apiGet(page, "/api/v1/calendar");
      const cal = ((await res.json()).data?.calendar as { feed?: { state?: string } } | undefined)?.feed;
      expect(cal?.state, "no day module, so the feed must not be readable").not.toBe("ok");
      return;
    }
    await expect(day).toBeVisible();
    const frames = day.getByTestId("today-day-frame");
    await expect(frames).toHaveCount(2);
    await expect(frames.first()).toContainText(/^Today · /);
    await expect(frames.nth(1)).toContainText(/^Tomorrow · /);
    // Every item is a time, a title, and a person when the calendar names one.
    for (const item of await day.getByTestId("today-day-item").all()) {
      expect((await item.locator(".td-item-title").innerText()).trim().length).toBeGreaterThan(0);
    }
    await expect(day.getByRole("button", { name: /Open Calendar/ })).toBeVisible();
    await expect(day.getByTestId("today-day-reminders")).toBeVisible();
    // The day's own numbers join the recap's sentence under the work; the strip of cards they sat in is gone (#556).
    await expect(page.getByTestId("today-recap-line")).toContainText(/\d+ appointments? today/);
  });

  test("below the core: the period as Reports counts it, where people are, and what happened while away", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    // The period: Reports' six tiles, real values, the two lines, Open Reports.
    const week = page.getByTestId("today-week");
    await expect(week).toBeVisible();
    await expect(week.locator(".rp2-tile")).toHaveCount(6);
    for (const v of await week.locator(".rp2-tile-value").allInnerTexts()) expect(v.trim()).toMatch(/^(\d+|\d+%|—|\d+s|\d+m( \d{2}s)?|\d+h \d{2}m)$/);
    await expect(week).toContainText(/^Last (7|30|90) days/);
    await expect(week.getByTestId("today-week-campaigns")).toBeVisible();
    await expect(week.getByTestId("today-week-booking")).toBeVisible();
    await expect(week.getByRole("button", { name: /Open Reports/ })).toBeVisible();
    // The journey: People's lists with counts; a row opens its list.
    const journey = page.getByTestId("today-journey");
    await expect(journey).toBeVisible();
    const rows = journey.getByTestId("today-journey-row");
    expect(await rows.count()).toBeGreaterThan(0);
    for (const c of await rows.locator(".tj-count").allInnerTexts()) expect(c.trim()).toMatch(/^\d+$/);
    await rows.first().locator(".tj-open").click();
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/clients\/seg:[a-z_]+$/);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    // While away: the bell's unread rows, or the plain word that there are none.
    const away = page.getByTestId("today-away");
    await expect(away).toBeVisible();
    const n = await away.getByTestId("today-away-row").count();
    if (n === 0) await expect(away.getByTestId("today-away-empty")).toBeVisible();
    else await expect(away.getByRole("button", { name: "Mark all read" })).toBeVisible();
  });
});
