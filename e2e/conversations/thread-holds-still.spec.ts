import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { motionSettled, pullHeld } from "../signals";

/**
 * An open thread on a phone holds its head and its reply box under every pull, and only the conversation gives (Ruben,
 * 2 Nov 2026: "only thread content can be dragged up and down").
 *
 * An open thread is a screen of its own (mobile.css, "An open thread is a screen of its own"; Ruben's recording, 3 Nov
 * 2026): fixed to the window, its conversation the one box that scrolls, its head at its top and its reply box on the
 * screen's bottom edge. Scrolled by the window, as it was from 21 Oct, the screen's band carried what was stuck to the
 * window along with the page, the reply box floated over the screen's foot at a thread's end, and the scroll to the end
 * undid the keyboard's lift. Now the window has nothing to scroll and its band is off, and the conversation bands in its
 * own box, which an iPhone draws and Chromium does not, so what this reads is the shape: the window still, the reply box
 * on the screen's edge, and the head and the reply box where they stood at both ends of the conversation and under a pull
 * past either.
 *
 * The reply box moves only as a sheet with two rests does (kit sheet/dock.ts dockSwipe; Ruben, 3 Nov 2026: "it should
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

    // The window holds still: nothing to scroll, and its band off at the root and the body.
    const theWindow = () =>
      page.evaluate(() => ({
        scrolls: getComputedStyle(document.documentElement).overflowY,
        band: [document.documentElement, document.body].map((el) => getComputedStyle(el).overscrollBehaviorY),
        y: Math.round(window.scrollY),
      }));
    await expect
      .poll(theWindow, { message: "the window holds still while a thread is open" })
      .toEqual({ scrolls: "hidden", band: ["none", "none"], y: 0 });
    // The reply box stands on the screen's bottom edge, where Safari reads its colour for the band under its bar.
    const edge = await page.evaluate(() =>
      Math.round(window.innerHeight - document.querySelector(".ix-th-foot")!.getBoundingClientRect().bottom),
    );
    expect(edge, "the reply box ends at the screen's bottom edge").toBe(0);

    // At the conversation's top, and pulled down past it: the head and the reply box hold.
    const conversation = page.locator(CONVERSATION).first();
    await conversation.evaluate((el) => {
      el.scrollTop = 0;
    });
    const atTop = await standing(page);
    const down = await pullHeld(page, 195, 400, 180);
    expect(await standing(page), "the head and the reply box hold").toEqual(atTop);
    await down.letGo();
    // At its end, and pulled up past it: the same, where they stood at its top.
    await conversation.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const atFoot = await standing(page);
    expect(atFoot, "the conversation scrolls in its own box, under the head and over the reply box").toEqual(atTop);
    const up = await pullHeld(page, 195, 500, -180);
    expect(await standing(page), "the head and the reply box hold").toEqual(atFoot);
    await up.letGo();
    expect((await theWindow()).y, "and the window never moved").toBe(0);

    // The reply box, folded, pulled up by its handle: it opens, and the head holds. From its foot the pull began in a
    // chat's one-line field, whose words are the field's to scroll and select (kit sheet/dock.ts), and nothing opened.
    const foot = page.locator(".ix-th-foot").first();
    test.skip((await foot.getAttribute("data-folded")) === null, "this thread's reply box does not fold");
    const folded = (await foot.boundingBox())!;
    const opening = await pullHeld(page, 195, folded.y + 8, -60);
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
