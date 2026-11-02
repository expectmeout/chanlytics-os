import type { Page } from "@playwright/test";

/**
 * A thumb on a phone's screen, through the browser's own input (CDP), and what it moves (kit motion/page-give.ts): the
 * phone shell's pulls (shell/phone.spec.ts) and an open thread's (conversations/thread-holds-still.spec.ts).
 */

/**
 * A thumb down the screen from (x, y) by `by` pixels (up it where `by` is negative), still down at the end: what the
 * page does under it is read before `letGo`.
 */
export const pullHeld = async (page: Page, x: number, y: number, by: number) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 6; i += 1)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (by * i) / 6 }] });
  return { letGo: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }) };
};

/** How far down the screen a pull past its end has moved the first box `sel` names (kit motion/page-give.ts): 0 at rest. */
export const givenOf = (page: Page, sel: string) =>
  page.evaluate(
    (s) => parseFloat(getComputedStyle(document.querySelector(s)!).translate.split(" ")[1] ?? "") || 0,
    sel,
  );
