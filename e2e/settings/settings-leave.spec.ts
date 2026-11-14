import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { routeOf } from "../address";
import { placeRow } from "../shell/places";
import { apiGet } from "../workspace";

/**
 * Leaving a page with a change not saved asks first (kit/record/held-move.ts, bridge/workspace.ts guardLeaving): the
 * sidebar, and the browser's Back. Only a browser can prove the Back: the App Router follows Back from its own popstate
 * listener, heard before anything of the frame's, so the guard asks before Back happens (the Navigation API's `navigate`).
 * The unit suite draws a made-up tab whose history behaves as Chrome's did on 13 Nov 2026, the first guard passed it, and
 * Chrome lost the change; a browser upgrade or a router upgrade that moves that order is caught here.
 *
 * It NEVER saves: it types into Details' Website and leaves by Stay or Yes, leave, and the record is read before and after.
 */

const WEBSITE = "https://leave-check.example.com";

/** What GET settings holds, to prove nothing was saved. */
async function readConfig(page: Page): Promise<unknown> {
  const res = await apiGet(page, "/api/v1/settings");
  expect(res.status()).toBe(200);
  const { data } = (await res.json()) as { data: { config: unknown; version: number } };
  return { config: data.config, version: data.version };
}

/** Details open, moved to in the page's own hand, so Back stays in the one document. */
async function openDetails(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { CHANLY: { address: { go: (r: string) => void } } }).CHANLY.address.go("admin/workspace");
  });
  await expect(page.getByTestId("rec-card-who")).toBeVisible({ timeout: 40_000 });
}

/** The Website typed, key by key, as a person types it, and not saved. */
async function typeWebsite(page: Page): Promise<void> {
  await page.getByTestId("rec-row-act-website").click();
  const box = page.getByTestId("rec-inline-website").locator("input");
  await expect(box).toBeFocused();
  await box.pressSequentially(WEBSITE);
}

/** The browser's Back, which a held move cancels: nothing is waited for, since a cancelled Back moves nothing. */
async function pressBack(page: Page): Promise<void> {
  await page.goBack({ timeout: 3_000 }).catch(() => null);
}

const question = (page: Page) => page.getByTestId("leave-confirm");
const typed = (page: Page) => page.getByTestId("rec-inline-website").locator("input");

test.describe("leaving a page with a change not saved", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/#/today");
    await expect(placeRow(page, "Today")).toBeVisible({ timeout: 40_000 });
  });

  test("the sidebar asks first: Stay keeps the change, Yes, leave goes", async ({ page }) => {
    await openDetails(page);
    const before = await readConfig(page);
    await typeWebsite(page);
    await placeRow(page, "People").click();
    await expect(question(page)).toBeInViewport({ ratio: 1 });
    await expect(question(page)).toContainText("Leave without saving?");
    expect(routeOf(page.url())).toBe("admin/workspace");
    await page.getByTestId("leave-no").click();
    await expect(question(page)).toBeHidden();
    await expect(typed(page)).toHaveValue(WEBSITE);
    await placeRow(page, "People").click();
    await page.getByTestId("leave-yes").click();
    // People is a page of its own: the address moves once the router has it.
    await expect.poll(() => routeOf(page.url()), { timeout: 30_000 }).toBe("clients");
    expect(await readConfig(page), "the journey changed the shared workspace").toEqual(before);
  });

  test("Back asks before the address moves, and Yes, leave goes where Back was going", async ({ page }) => {
    await openDetails(page);
    const before = await readConfig(page);
    await typeWebsite(page);
    await pressBack(page);
    await expect(question(page)).toBeInViewport({ ratio: 1 });
    expect(routeOf(page.url()), "the address never moved").toBe("admin/workspace");
    await page.getByTestId("leave-no").click();
    await expect(typed(page)).toHaveValue(WEBSITE);
    // The Stay was a press on the page, so the browser lets the next Back be asked about too.
    await pressBack(page);
    await expect(question(page)).toBeInViewport({ ratio: 1 });
    await page.getByTestId("leave-yes").click();
    await expect.poll(() => routeOf(page.url())).toBe("today");
    expect(await readConfig(page), "the journey changed the shared workspace").toEqual(before);
  });
});
