import { expect, type Locator, type Page } from "@playwright/test";
import type { NewDraftDto } from "../../packages/contracts/src/index";
import { atRoute } from "../address";
import { NOBODY_ONCE } from "./nobody-once";

/**
 * New on the address the page is at, drafted from a line with Ask's answer given (`draft`): the pane, on its draft.
 */
async function draftedFrom(page: Page, draft: NewDraftDto): Promise<Locator> {
  const pane = page.getByTestId("sq-new");
  await pane.getByTestId("sq-nw-line").fill(draft.said);
  await pane.getByTestId("sq-nw-draft").click();
  await expect(pane.getByTestId("sq-nw-sentence")).toBeVisible();
  return pane;
}

/** Ask's answer given, so a nightly asks no model. */
async function answerDraftWith(page: Page, draft: NewDraftDto): Promise<void> {
  // The page asks with its workspace in the query (`?workspace=`): a pattern that ended at `draft` matched nothing, so
  // Ask drafted for real on production every night and the answer was whatever it said; and the answer given here wanted
  // the envelope's `ok`, without which the client reads a refusal (client/api.ts), unseen while nothing matched (25 Oct 2026).
  await page.route("**/api/v1/sequences/draft?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: draft }) }),
  );
}

/**
 * New's Once by its address (`campaigns/sequences/new:once`, where the composer's `campaigns/new` lands), drafted from a
 * line with Ask's answer given (`draft`): the pane, on its draft.
 */
export async function openDraftedOnce(page: Page, draft: NewDraftDto = NOBODY_ONCE): Promise<Locator> {
  await answerDraftWith(page, draft);
  await page.goto("/#/campaigns/new");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(atRoute(/^campaigns\/sequences\/new:once$/));
  return draftedFrom(page, draft);
}

/** One of a sequence's messages as the business would hold it; its id opens nothing, and nothing is made from it. */
const heldMessage = (n: number, title: string, body: string, typed: boolean) => ({
  template_id: `5e0d0000-0000-4000-8000-00000000000${n}`,
  title,
  body,
  channels: ["whatsapp" as const],
  params: [{ kind: "first_name" as const }, ...(typed ? [{ kind: "text" as const, value: "" }] : [])],
  offer: typed,
  written: null,
  labels: ["Name", ...(typed ? ["The offer"] : [])],
});

/**
 * A sequence as Ask would answer it, for a spec that presses a step's own controls: two messages a week apart, the
 * second with a value still to type. The draft is drawn from this answer alone, whatever the workspace holds.
 */
export const TWO_STEPS: NewDraftDto = {
  said: "Thank them after a visit, then tell them about the offer a week later",
  business: "",
  kind: "sequence",
  audience: "people",
  name: "Thank you, then the offer",
  who: { kind: "moment", trigger: "visited", label: "the day after a visit" },
  run_hour: 10,
  at: null,
  channels: ["whatsapp"],
  mailbox: null,
  adds_new: false,
  steps: [
    {
      name: "Thank you, then the offer",
      after_days: null,
      only_if: [],
      does: "message",
      message: heldMessage(1, "Visit follow-up", "Hi {{1}}, thanks for coming in.", false),
      email: null,
      hand: "",
    },
    {
      name: "",
      after_days: 7,
      only_if: [],
      does: "message",
      message: heldMessage(2, "This week's offer", "Hi {{1}}, {{2}} this week.", true),
      email: null,
      hand: "",
    },
  ],
  policy_class: "booking",
  mode: "ask",
  reach: { can: 0, of: 0, left: null },
  checks: [],
  twin: null,
  cannot: null,
};

/** New's sequence by its address (`campaigns/sequences/new`), drafted from a line with Ask's answer given. */
export async function openDraftedSequence(page: Page, draft: NewDraftDto = TWO_STEPS): Promise<Locator> {
  await answerDraftWith(page, draft);
  await page.goto("/#/campaigns/sequences/new");
  await page.waitForLoadState("networkidle");
  return draftedFrom(page, draft);
}
