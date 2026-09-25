import { test, expect, type Page } from "@playwright/test";
import { signInAndGo, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * No field zooms a phone.
 *
 * An iPhone zooms the page into any field whose words are under 16px when it
 * takes focus, and stays zoomed after. The type scale draws fields at 12 to
 * 14.5px, so about 110 of 123 did it, the sign-in first. One (pointer: coarse)
 * rule in app/globals.css lifts every text field to 16px; this measures what the
 * browser computes on a touch phone, the doors without a session and the OS's
 * pages with one, where two-class rules (.settings .sd-input) are what the rule
 * has to beat. And the viewport never "fixes" it with maximum-scale, which takes
 * pinch-zoom away on Android.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const NOT_TEXT = new Set([
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "hidden",
  "button",
  "submit",
  "reset",
  "image",
]);

/** Every text field on the page under 16px, by what the browser computed. */
async function under16(page: Page): Promise<string[]> {
  return page.evaluate(
    (notText) => {
      const skip = new Set(notText);
      return [...document.querySelectorAll<HTMLElement>("input, textarea, select, [contenteditable]")]
        .filter((e) => !(e instanceof HTMLInputElement && skip.has(e.type)))
        .filter((e) => e.getAttribute("contenteditable") !== "false")
        .map((e) => ({ e, px: parseFloat(getComputedStyle(e).fontSize) }))
        .filter(({ px }) => px < 16)
        .map(
          ({ e, px }) =>
            `${e.tagName.toLowerCase()}.${e.className || "(no class)"} ${e.getAttribute("placeholder") ?? ""}: ${px}px`,
        );
    },
    [...NOT_TEXT],
  );
}

async function fieldCount(page: Page): Promise<number> {
  return page.locator("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select").count();
}

test.describe("The doors, no session", () => {
  for (const path of ["/login", "/signup", "/reset-password"]) {
    test(`${path}: a touch phone matches (pointer: coarse), and every field is 16px or larger`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      expect(await fieldCount(page)).toBeGreaterThan(0);
      expect(await under16(page)).toEqual([]);
    });
  }

  test("the viewport keeps pinch-zoom: no maximum-scale, no user-scalable", async ({ page }) => {
    await page.goto("/login");
    const content = (await page.locator('meta[name="viewport"]').getAttribute("content")) ?? "";
    expect(content).toContain("width=device-width");
    expect(content).not.toMatch(/maximum-scale|user-scalable/);
  });
});

test.describe("The OS's pages on a touch phone", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  // Each has a field on first paint: the Inbox's search and reply, People's and the Pipeline's search, the Live
  // whisper, and the settings panes whose fields are sized by two-class rules.
  for (const hash of ["#/inbox", "#/clients", "#/conversations", "#/live", "#/admin/integrations", "#/admin/team"]) {
    test(`${hash}: every field is 16px or larger`, async ({ page }) => {
      await signInAndGo(page, hash);
      await page.waitForLoadState("networkidle");
      expect(await under16(page)).toEqual([]);
    });
  }
});
