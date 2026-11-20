/**
 * AI's card for a new ad (the Ads plan's 6.3 and 6.7, "Who calls the writer"; decision 0050, call 12). Asked for an ad
 * in its own turn, AI proposes this card; its press drafts the ad on New ad's own route (POST ads/draft), with the
 * same builder New ad's + New uses, keeps it as the workspace's draft, and opens New ad on it, where the ad writer
 * writes its words as it does for + New. AI decides none of the draft: code picks the service where none was named,
 * the picture, the area, the amount and the end. It never turns an ad on, holds no token and spends nothing at Meta:
 * Turn on is the owner's own press in New ad.
 *
 * What the card carries: the service the person named, as Services names it, or none for the draft's own pick; and the
 * most any ad may cost, in whole units of the ad account's currency, where the owner said one in their own words (the
 * plan's G6), which the press keeps on the account before it drafts. Pure.
 */
import { asText, type ProposalSpec } from "../ask/proposals/spec";
import { newAdRoute } from "./address";

/** What an ad card commits: New ad's own route, with the service named and the owner's most where they said one. */
export const adDraftSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload }) => {
    const service = asText(payload.service);
    const most = typeof payload.most === "number" && Number.isSafeInteger(payload.most) ? payload.most : null;
    return {
      route: "POST ads/draft",
      body: { ...(service ? { service } : {}), ...(most !== null && most > 0 ? { most } : {}) },
    };
  },
  receipt: () => "Drafted. New ad is open on it.",
  open: () => newAdRoute(),
};
