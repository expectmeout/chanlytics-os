import { expect, type Locator, type Page } from "@playwright/test";
import type { NewDraftDto } from "../../packages/contracts/src/index";
import { atRoute } from "../address";

/**
 * New's one-off as Ask would answer it, for a spec on a real workspace (decision 0065): POST sequences/draft is answered
 * here, so a nightly asks no model, and everything else New draws is the workspace's own (its lists, its counts, its
 * channels). This one reaches nobody: a once to everyone, now, by WhatsApp, of a message Ask wrote, which a yes to offers
 * hears -- the nightly's workspace has nobody with that yes (tooling/scripts/ops/e2e-workspace.mjs).
 */
export const NOBODY_ONCE: NewDraftDto = {
  said: "Tell everyone we're closed on Thursday",
  business: "",
  kind: "once",
  audience: "people",
  name: "Closed on Thursday",
  who: { kind: "everyone", label: "everyone who said yes to offers" },
  run_hour: 10,
  at: null,
  channels: ["whatsapp"],
  mailbox: null,
  adds_new: false,
  steps: [
    {
      name: "Closed on Thursday",
      after_days: null,
      only_if: [],
      does: "message",
      message: {
        template_id: null,
        title: "Closed on Thursday",
        body: "Hi {{1}}, we're closed this Thursday.",
        channels: ["whatsapp"],
        params: [{ kind: "first_name" }],
        offer: true,
        written: {
          name: "closed_on_thursday",
          category: "marketing",
          versions: { whatsapp: { body: "Hi {{1}}, we're closed this Thursday." } },
          slots: [{ position: 1, label: "First name", example: "Dani", kind: "first_name" }],
        },
      },
      email: null,
      hand: "",
    },
  ],
  policy_class: "campaign",
  mode: null,
  reach: { can: 0, of: 3, left: "3 never said yes" },
  checks: [],
  twin: null,
  cannot: null,
};

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
