import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * The phone shell, on a real workspace at a phone's width.
 *
 * The tab bar is there and the hamburger is not; Ask is the ✦ in the tab bar,
 * and the top bar has no second Ask and no theme button; the Inbox shows its
 * list and not its thread until a tap, then the thread and a Back;
 * Conversations does the same. And the installable pieces are served to a
 * browser with no session, because that is how a phone's installer asks for
 * them.
 */
test.describe("Installable shell, no session", () => {
  test("the manifest, the worker and the icons are public", async ({ request }) => {
    const m = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(m.status()).toBe(200);
    expect(m.headers()["content-type"]).toContain("manifest");
    const json = await m.json();
    expect(json.name).toBe("Chanlytics OS");
    expect(json.display).toBe("standalone");
    expect(json.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    const sw = await request.get("/sw.js", { maxRedirects: 0 });
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("skipWaiting");
    const icon = await request.get("/icons/icon-192.png", { maxRedirects: 0 });
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("image/png");
  });
});

test.describe("Phone shell on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the ✦ in the tab bar opens Ask as a sheet and hides while the sheet is open, and the top bar says neither Ask nor the theme again", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const fab = page.getByTestId("phone-ask");
    await expect(fab).toBeVisible();
    // In the tab bar's own row, clear of the tabs: it floated 126px up, over the page.
    const bar = await page.getByTestId("phone-tabs").boundingBox();
    const at = await fab.boundingBox();
    expect(bar && at && at.y >= bar.y, `the ✦ at ${JSON.stringify(at)} sits in the tab bar at ${JSON.stringify(bar)}`).toBe(true);
    const rightmost = await page.getByTestId("phone-tabs").getByRole("button").evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)));
    expect(rightmost, "no tab runs under it").toBeLessThanOrEqual((at?.x ?? 0) + 1);
    await expect(page.getByTestId("tb-ask")).toBeHidden();
    await expect(page.locator(".tb-theme")).toBeHidden();
    await fab.click();
    const pal = page.getByTestId("ask-real");
    await expect(pal).toBeVisible();
    await expect(fab).toBeHidden();
    await expect(page.getByTestId("ask-input")).toBeVisible();
    await page.screenshot({ path: "test-results/phone-ask.png" });
    await page.keyboard.press("Escape");
    await expect(pal).toBeHidden();
    await expect(fab).toBeVisible();
  });

  test("the tab bar replaces the menu button, and the Inbox shows one pane at a time", async ({ page }) => {
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("phone-tabs")).toBeVisible();
    await expect(page.locator(".tb-menu")).toBeHidden();
    // The four places a thumb reaches, and what is NOT among them: a call is
    // live for minutes a week, so it is a bar while it is happening rather
    // than a slot that is empty the rest of the time. Calendar took it.
    const tabs = page.getByTestId("phone-tabs").getByRole("button");
    await expect(tabs).toHaveText(["Today", "Inbox", "Calendar", "People", "More"]);
    await tabs.filter({ hasText: "Calendar" }).click();
    await expect(page).toHaveURL(/#\/calendar/);
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".ix-list")).toBeVisible();
    await expect(page.locator(".ix-thread-pane")).toBeHidden();
    await page.screenshot({ path: "test-results/phone-inbox-list.png" });

    const row = page.locator(".ix-thread").first();
    test.skip((await row.count()) === 0, "no threads in this workspace");
    await row.click();
    await expect(page.locator(".ix-thread-pane")).toBeVisible();
    await expect(page.locator(".ix-list")).toBeHidden();
    await expect(page.getByTestId("ix-back")).toBeVisible();
    await page.screenshot({ path: "test-results/phone-inbox-thread.png" });
    await page.getByTestId("ix-back").click();
    await expect(page.locator(".ix-list")).toBeVisible();
    await expect(page.locator(".ix-thread-pane")).toBeHidden();
  });

  test("the tab bar navigates, and Conversations takes turns too", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("phone-tabs").getByRole("button", { name: "People" }).click();
    await expect(page).toHaveURL(/#\/clients/);
    await page.goto("/#/conversations");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".cv-list")).toBeVisible();
    await expect(page.locator(".cv-viewer")).toBeHidden();
    const row = page.locator(".cv-row").first();
    test.skip((await row.count()) === 0, "no conversations in this workspace");
    await row.click();
    await expect(page.locator(".cv-viewer")).toBeVisible();
    await expect(page.getByTestId("cv-back")).toBeVisible();
    await page.getByTestId("cv-back").click();
    await expect(page.locator(".cv-list")).toBeVisible();
  });
  /**
   * Broadcasts had no phone case at all, and its primary control was off the
   * screen: .bc-actions is a flex row with no wrap, its children need 491px, the
   * page column is 283px, and .main-scroll is overflow-x: hidden -- so "Send
   * now" sat 208px past the right edge with no scrollbar to reach it. A case
   * that only looks for the button would have passed the whole time.
   */
  test("Campaigns: every control on Broadcasts is inside the screen, and the page opens on the work", async ({ page }) => {
    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    const composer = page.getByTestId("bc-composer");
    await expect(composer).toBeVisible();
    const width = page.viewportSize()?.width ?? 390;
    for (const el of await composer.getByRole("button").all()) {
      const box = await el.boundingBox();
      if (!box) continue;
      expect(box.x + box.width, `${(await el.textContent())?.trim()} runs off a ${width}px screen`).toBeLessThanOrEqual(width + 1);
    }
    // Nothing scrolls sideways: the row wraps rather than being clipped.
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, "the page scrolls sideways").toBeLessThanOrEqual(1);
    // The work first: one line of numbers, and no page title under a top bar
    // that already says Broadcasts.
    await expect(page.getByTestId("bc-standing")).toBeVisible();
    await expect(page.locator(".ct-h2")).toHaveCount(0);
    const line = await page.getByTestId("bc-standing").boundingBox();
    const first = await composer.boundingBox();
    expect(line && first && first.y - line.y < 120, "the composer follows the line, not a header block").toBe(true);
  });

  /**
   * Live's call panel head wraps before it squeezes. Its titles were `flex: 1` beside controls that would
   * not shrink, so on a phone the name had ~90px and the meta line's number and start time fell into
   * columns one word wide. With nobody on the line the panel still opens on the last call, so the head is
   * there whenever the workspace has had a call at all. Read-only: nothing here is pressed.
   */
  test("Live: the call panel's head gives the name the width, and each fact stays on one line", async ({ page }) => {
    await page.goto("/#/live");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("live-real")).toBeVisible();
    const head = page.locator(".lm-head").first();
    test.skip((await head.count()) === 0, "no call on this workspace yet: no panel head to measure");
    const width = page.viewportSize()?.width ?? 390;
    const titles = await page.locator(".lm-head-titles").first().boundingBox();
    expect(titles && titles.width >= Math.min(260, width - 40), `the name and its facts had ${titles?.width}px`).toBe(true);
    for (const fact of await page.locator(".lm-head-meta > *").all()) {
      const box = await fact.boundingBox();
      if (!box || box.height < 4) continue; // the separator dots
      expect(box.height, `"${(await fact.textContent())?.trim()}" broke across lines`).toBeLessThanOrEqual(24);
    }
    for (const el of await page.locator(".lm-head-actions").getByRole("button").all()) {
      const box = await el.boundingBox();
      if (!box) continue;
      expect(box.x + box.width, `${(await el.textContent())?.trim()} runs off a ${width}px screen`).toBeLessThanOrEqual(width + 1);
    }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, "the page scrolls sideways").toBeLessThanOrEqual(1);
  });

  test("Campaigns: Send now asks before it sends", async ({ page }) => {
    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    const send = page.getByTestId("bc-send");
    test.skip(!(await send.isEnabled().catch(() => false)), "nothing approved to send in this workspace");
    await send.click();
    await expect(page.getByTestId("bc-send-confirm")).toBeVisible();
    await expect(page.getByTestId("bc-send-yes")).toBeVisible();
    // Nothing has gone: the question can be dismissed and the button comes back.
    await page.getByTestId("bc-send-no").click();
    await expect(page.getByTestId("bc-send")).toBeVisible();
  });
});
