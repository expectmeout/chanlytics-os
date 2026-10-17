import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { routeOf } from "../address";
import { GET_YES_HASH, expectLeaksWellFormed, expectQrInView } from "../signals";

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
 * The send screen says it too: nobody on the audience it opens on has said yes
 * to offers. The send has been its own screen since #758 and the QR is a pane of
 * its own (broadcasts/get-yes), so its "the phrase and QR below" pointed at
 * nothing. Its door closes the send and lands on the QR. Where no channel ticked
 * can carry the message at all, the line says that and is no door.
 */
async function sendScreenDoorLandsOnTheQr(page: Page): Promise<void> {
  // The send is Campaigns' composer, a sheet over Sequences at its own address (campaigns/new): a date's New opens it.
  await page.goto("/#/campaigns/new");
  await page.waitForLoadState("networkidle");
  const nobody = page.getByTestId("bc-nobody");
  const foot = page.getByTestId("bc-foot-say");
  await expect(nobody.or(foot).first()).toBeVisible();
  if (!(await nobody.count())) {
    // Since a message goes by the channels it ticks, the screen says first when none of them can carry this message
    // (an offer to US numbers while Meta holds marketing there, a text, which carries no offers, email before its
    // campaigns domain): a yes would change nothing, so there is no door, and each channel says why beside its tick.
    // The foot says it, once, by the act it stops (Ruben, 10 Oct 2026: said in the line too, it was the same sentence
    // twice in one screen). The suite's workspace is in that state while Meta's hold lasts; the door itself is run in
    // the node suite (broadcasts.test.mjs), and Today's and People's doors to the same QR are pressed above.
    await expect(foot).toHaveText(/None of the channels ticked can carry this message yet/);
    // Each channel that cannot carry it says why, under its switch in the channels' list the sentence's word opens
    // (#1556: the drawers read as one sentence).
    await page.getByTestId("bc-via-word").click();
    const whys = page.getByTestId("bc-via").locator('[data-warn="true"]');
    await expect(whys.first()).toBeVisible();
    await expect(whys.first()).not.toBeEmpty();
    return;
  }
  await expect(nobody).not.toContainText("below");
  const door = nobody.getByTestId("bc-nobody-door");
  await expect(door).toHaveText(/get their yes/i);
  await door.click();
  await expect(page.getByTestId("bc-composer")).toHaveCount(0);
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
    const rows = await expectLeaksWellFormed(page);
    const reach = rows.find((r) => r.id === "unreachable");
    expect(
      reach,
      `the seeded workspace said yes to messages and nothing to offers; the band said: ${JSON.stringify(rows)}`,
    ).toBeTruthy();
    expect(reach!.text).toMatch(/^\d+ people have said yes to messages, but nobody has said yes to offers\.$/);
    expect(reach!.doors).toContain("Get their yes to offers");
    await page.getByTestId("today-leak-unreachable").getByRole("button", { name: "Get their yes to offers" }).click();
    await expectQrInView(page);
  });

  test("Today's number is People's number: the band re-prints a list, it never counts one of its own", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const reach = (await expectLeaksWellFormed(page)).find((r) => r.id === "unreachable");
    expect(reach, "the seeded state").toBeTruthy();
    const said = Number(/^(\d+) people/.exec(reach!.text)?.[1]);
    // The row's own door to the list, not a URL typed here: the number and the
    // list it opens are the claim.
    await page
      .getByTestId("today-leak-unreachable")
      .getByRole("button", { name: /Open People/ })
      .click();
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

  test("the send screen's 'nobody' line is a door that lands on the QR, or says no channel can carry the message", async ({
    page,
  }) => {
    await sendScreenDoorLandsOnTheQr(page);
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

    test("the send screen's line does the same on a phone: the QR on its screen, or why nothing can be sent", async ({
      page,
    }) => {
      await sendScreenDoorLandsOnTheQr(page);
    });
  });
});
