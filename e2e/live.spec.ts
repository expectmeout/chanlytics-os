import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Live, on a real workspace.
 *
 * The seeded console showed Selena Cho on an invented call with Live Listen,
 * Take Over and End Call — none of which the phone provider offers for a
 * hosted agent. The real page lists the calls in progress under the heartbeat
 * rule, runs a clock from each call's real start, and shows the calls that
 * just ended with their summary state. Read-only: nothing here changes a call.
 */
const INVENTED = ["Selena Cho", "Aisha Khan", "Maya Rodriguez", "Serenity Spa", "Phone Rep", "Live Listen", "Take Over", "End Call", "Take-overs"];

test.describe("Live on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the page is real, honest about the line, and offers no control the provider lacks", async ({ page }) => {
    await page.goto("/#/live");
    await page.waitForLoadState("networkidle");
    const live = page.getByTestId("live-real");
    await expect(live).toBeVisible();

    const text = await live.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);

    // The list leads with "Right now" and a count.
    await expect(live.locator(".lm-list-label").first()).toContainText(/right now/i);
    const count = live.locator(".lm-list-count").first();
    await expect(count).toHaveText(/^\d+ calls?$/);

    // Either a call is up — a Live pill and a clock that moves — or the page
    // says what the line is doing instead of inventing a caller.
    const liveRows = live.getByTestId("live-row");
    if ((await liveRows.count()) > 0) {
      await expect(liveRows.first().locator(".pill-accent")).toContainText("Live");
      const clock = liveRows.first().locator("td").nth(1);
      const before = await clock.innerText();
      await page.waitForTimeout(2200);
      expect(await clock.innerText(), "the elapsed clock runs").not.toBe(before);
    } else {
      await expect(live.getByText(/No call in progress|no phone line yet/)).toBeVisible();
    }

    // A finished call, when there is one, shows a summary state — never a blank.
    const recent = live.getByTestId("recent-row");
    if ((await recent.count()) > 0) {
      await recent.first().click();
      const summary = live.getByTestId("live-summary");
      await expect(summary).toBeVisible();
      await expect(summary.locator(".lm-summary-title")).not.toBeEmpty();
    }
  });

  test("the Conversations tab strip pulses only when a call is really up", async ({ page }) => {
    await page.goto("/#/live");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("live-real")).toBeVisible();
    const liveRows = await page.getByTestId("live-row").count();
    const tab = page.locator(".stabs-tab", { hasText: "Live" });
    await expect(tab).toBeVisible();
    await expect(tab.locator(".live-dot")).toHaveCount(liveRows > 0 ? 1 : 0);
  });
});
