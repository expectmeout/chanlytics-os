import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { routeOf } from "../address";
import { openDraftedOnce } from "../campaigns/new-draft";
import { GET_YES_HASH, expectFoundWellFormed, expectQrInView } from "../signals";

/**
 * The one thing wrong, said where the owner looks, with a door that lands on the fix.
 *
 * On 17 Sep 2026 a real salon had seven people who had said yes to messages and
 * nobody who had said yes to offers. That one fact left every playbook reaching
 * nobody, every broadcast without an audience, and the booking link unsendable to
 * the seventeen people who asked and never booked -- and the product printed it
 * as a clause in a sentence beside a disabled button. #651 said it on Today,
 * #661 on Playbooks, #663 made every mention a door to Broadcasts' "Get their
 * yes": the QR for the desk, the phrase, the link for a bio.
 *
 * The nightly's workspace is put in exactly that state before these run
 * (tooling/scripts/ops/e2e-workspace.mjs: three people, a yes to messages, nothing
 * to offers; its verify() refuses a workspace that drifted), so every check here
 * reads a known page rather than hoping the workspace happens to show one.
 */

/**
 * New's Once says it too (decision 0065): a one-off nobody it is for can hear holds its Send now, and its card offers the
 * ways it could be heard, the yes nobody gave among them, a door to People's Get their yes that closes New and lands on
 * the QR. Ask's answer is given (campaigns/new-draft.ts), so a nightly asks no model.
 */
async function newsDoorLandsOnTheQr(page: Page): Promise<void> {
  const pane = await openDraftedOnce(page);
  await expect(pane.getByTestId("sq-nw-send-now")).toBeDisabled();
  const door = pane.getByTestId("sq-nw-nobody-yes");
  await expect(door).toHaveText(/get their yes/i);
  await door.click();
  await expect(page.getByTestId("sq-new")).toHaveCount(0);
  await expectQrInView(page);
}

test.describe("What the owner could not have seen, and the door to the fix", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Today names it -- nobody can be sent an offer -- with its arithmetic, and its door lands on the QR", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    // A rule of the workspace's own counts, a row of Ask found (Today in three zones, 2 Nov 2026).
    const rows = await expectFoundWellFormed(page);
    const reach = rows.find((r) => r.key === "rule:unreachable");
    expect(
      reach,
      `the seeded workspace said yes to messages and nothing to offers; Ask found said: ${JSON.stringify(rows)}`,
    ).toBeTruthy();
    expect(reach!.text).toMatch(/^\d+ people have said yes to messages, but nobody has said yes to offers\.$/);
    expect(reach!.act).toBe("Get their yes to offers");
    await page.locator('[data-key="rule:unreachable"]').getByTestId("today-found-act").click();
    await expectQrInView(page);
  });

  test("Today's number is People's number: the row re-prints a list, it never counts one of its own", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const reach = (await expectFoundWellFormed(page)).find((r) => r.key === "rule:unreachable");
    expect(reach, "the seeded state").toBeTruthy();
    const said = Number(/^(\d+) people/.exec(reach!.text)?.[1]);
    // The list the number is, as People names it: Said yes to messages, opened from People, not a URL built from the
    // row (its one act is the QR's door, which the test above takes).
    await page.goto("/#/clients/seg:opted_in");
    await page.waitForLoadState("networkidle");
    await expect.poll(() => routeOf(page.url())).toBe("clients/seg:opted_in");
    await expect(page.locator(".cl-table tbody tr:not(:has(.empty))")).toHaveCount(said);
  });

  test("People's list step is the door to that yes, not a disabled button beside a sentence about it", async ({
    page,
  }) => {
    await page.goto("/#/clients/seg:opted_in");
    await page.waitForLoadState("networkidle");
    const step = page.getByTestId("list-action");
    await expect(step).toBeVisible();
    const door = step.getByRole("button", { name: /Get their yes to offers/ });
    await expect(door).toBeEnabled();
    await door.click();
    await expectQrInView(page);
  });

  test("New's 'no one to send to' card is a door that lands on the QR", async ({ page }) => {
    await newsDoorLandsOnTheQr(page);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    // The case that was broken: the old door opened the top of Broadcasts and
    // left the QR 834px down an 844px screen -- present, visible, and off it.
    test("the door lands the QR on the screen of the phone holding it", async ({ page }) => {
      await page.goto(`/${GET_YES_HASH}`);
      await page.waitForLoadState("networkidle");
      await expectQrInView(page);
    });

    test("New's card does the same on a phone: the QR on its screen", async ({ page }) => {
      await newsDoorLandsOnTheQr(page);
    });
  });
});
