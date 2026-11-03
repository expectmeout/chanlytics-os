import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { givenOf, motionSettled, pullHeld } from "../signals";

/**
 * An open thread on a phone holds its head and its reply box under every pull, and only the conversation gives (Ruben,
 * 2 Nov 2026: "only thread content can be dragged up and down").
 *
 * The window scrolls an open thread, with its head stuck under the frame's top and its reply box over the screen's foot
 * (mobile.css, "An open thread"). The screen's own band carries what is stuck to the window along with the page, so on an
 * iPhone a pull down at the top slid the head 250px down the screen, and a pull up at the foot lifted the reply box with
 * the page's ground showing under it. So while a thread is open the screen's band is off at both ends, and a pull past
 * either is drawn by the page on the conversation alone (kit motion/page-give.ts). Chromium draws no band of its own, so
 * what this reads is the page's: the band off, the conversation moved, the head and the reply box where they stood.
 *
 * The reply box moves only as a sheet with two rests does (kit sheet/rests.ts dockSwipe; Ruben, 3 Nov 2026: "it should
 * also work like the drawer sheets"): a pull up on it folded opens it, and a pull down from its handle follows the finger
 * and folds it again, with the head where it stood through both. Read-only: nothing here writes.
 */
const CONVERSATION = ".ix-th-scroll";

/** Where the head and the reply box stand on the screen. */
const standing = (page: Page) =>
  page.evaluate(() => {
    const top = (sel: string) => Math.round(document.querySelector(sel)!.getBoundingClientRect().top);
    return { head: top(".ix-th-head"), foot: top(".ix-th-foot") };
  });

test.describe("An open thread on a phone", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("holds its head and its reply box under a pull at either end, and only the conversation gives", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    const row = page.locator(".ix-thread").first();
    test.skip((await row.count()) === 0, "no thread on this workspace");
    await row.click();
    await expect(page.locator(".ix-th-foot").first()).toBeVisible();
    await motionSettled(page);
    // Every email opened whole, so the conversation is as long as the thread can make it.
    for (const whole of await page.getByText("Show whole email").all()) await whole.click();

    // Past the top: a thumb down the conversation from its middle.
    await page.evaluate(() => window.scrollTo(0, 0));
    const atTop = await standing(page);
    const down = await pullHeld(page, 195, 400, 180);
    expect(await givenOf(page, CONVERSATION), "the conversation comes down under the thumb").toBeGreaterThan(20);
    expect(await standing(page), "the head and the reply box hold").toEqual(atTop);
    await down.letGo();
    await expect.poll(() => givenOf(page, CONVERSATION), { message: "let go, it goes home" }).toBe(0);

    // Past the foot: a thumb up the conversation. A conversation shorter than the screen gives nothing at its foot (its
    // top is still under the head), and the two hold all the same.
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
    // Away from its top too, where a page's band is the screen's (mobile.css, "The page's ends"): a thread's is off.
    const band = () =>
      page.evaluate(() =>
        [document.documentElement, document.body].map((el) => getComputedStyle(el).overscrollBehaviorY),
      );
    await expect
      .poll(band, { message: "the screen's band is off at the root and the body while a thread is open" })
      .toEqual(["none", "none"]);
    const long = await page.evaluate(
      (sel) => document.querySelector(sel)!.getBoundingClientRect().top < 0,
      CONVERSATION,
    );
    const atFoot = await standing(page);
    const up = await pullHeld(page, 195, 500, -180);
    if (long) expect(await givenOf(page, CONVERSATION), "the conversation goes up under the thumb").toBeLessThan(-20);
    expect(await standing(page), "the head and the reply box hold").toEqual(atFoot);
    await up.letGo();
    await expect.poll(() => givenOf(page, CONVERSATION), { message: "let go, it goes home" }).toBe(0);

    // The reply box, folded, pulled up: it opens, and the head holds.
    const foot = page.locator(".ix-th-foot").first();
    test.skip((await foot.getAttribute("data-folded")) === null, "this thread's reply box does not fold");
    const folded = (await foot.boundingBox())!;
    const opening = await pullHeld(page, 195, folded.y + folded.height - 24, -60);
    await opening.letGo();
    await expect(foot, "pulled up, it opens").not.toHaveAttribute("data-folded");
    expect((await standing(page)).head, "the head holds").toBe(atFoot.head);
    // Open, pulled down from its handle: it follows the finger, and let go past its length it folds again.
    const opened = (await foot.boundingBox())!;
    const folding = await pullHeld(page, 195, opened.y + 8, 120);
    const followed = await foot.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);
    expect(followed, "the box comes down under the thumb").toBeGreaterThan(60);
    expect((await standing(page)).head, "the head holds").toBe(atFoot.head);
    await folding.letGo();
    await expect(foot, "let go, it folds away").toHaveAttribute("data-folded", "");
  });
});
