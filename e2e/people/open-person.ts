import { expect, type Locator, type Page } from "@playwright/test";

/**
 * A person's page, opened from a row of People's list as a member opens it. On a desk a row's press opens the person's
 * peek beside the list (canvas A, PEEK-01: apps/dashboard/src/surfaces/people/peek/person-peek.tsx), and the peek's foot
 * holds the door to their full page; on a phone the press opens the page itself, the rows having no room beside them.
 * Resolves once the page's name is drawn.
 *
 * Since #1574 (12 Oct 2026) a spec that pressed a row and waited for `.cl-prof-name` waited on a peek, whose name is its
 * own (`.pk-name`), and timed out before it reached what it proves.
 */
export async function openPersonPage(page: Page, row: Locator): Promise<void> {
  await row.click();
  await openPeekedPage(page);
}

/**
 * Messages and receptionist, open: the card's fold of what they may be sent and who answers them (canvas A, P9.4), which
 * starts folded and is then left as the member left it. Its rows' controls (`rec-row-act-person-visit`, `-receptionist`)
 * are inside it.
 */
export async function openMessagesFold(page: Page): Promise<void> {
  const press = page.getByTestId("person-messages-fold-press");
  if ((await press.getAttribute("aria-expanded")) !== "true") await press.click();
  await expect(press).toHaveAttribute("aria-expanded", "true");
}

/** The page, from wherever a row's press or Enter left it: through the peek's door on a desk, already open on a phone. */
export async function openPeekedPage(page: Page): Promise<void> {
  const peek = page.getByTestId("person-peek");
  const name = page.locator(".cl-prof-name");
  await expect(peek.or(name).first()).toBeVisible();
  if (await peek.isVisible()) {
    await expect(peek.locator(".pk-name"), "the peek says who it is").not.toBeEmpty();
    await expect(name, "the list is still the page under the peek").toHaveCount(0);
    await peek.getByTestId("person-peek-page").click();
  }
  await expect(name).toBeVisible();
}
