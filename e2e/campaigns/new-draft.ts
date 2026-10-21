import { expect, type Locator, type Page } from "@playwright/test";
import type { NewDraftDto } from "../../packages/contracts/src/index";
import { atRoute } from "../address";
import { NOBODY_ONCE } from "./nobody-once";

/**
 * New's Once by its address (`campaigns/sequences/new:once`, where the composer's `campaigns/new` lands), drafted from a
 * line with Ask's answer given (`draft`): the pane, on its draft.
 */
export async function openDraftedOnce(page: Page, draft: NewDraftDto = NOBODY_ONCE): Promise<Locator> {
  await page.route("**/api/v1/sequences/draft", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: draft }) }),
  );
  await page.goto("/#/campaigns/new");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(atRoute(/^campaigns\/sequences\/new:once$/));
  const pane = page.getByTestId("sq-new");
  await pane.getByTestId("sq-nw-line").fill(draft.said);
  await pane.getByTestId("sq-nw-draft").click();
  await expect(pane.getByTestId("sq-nw-sentence")).toBeVisible();
  return pane;
}
