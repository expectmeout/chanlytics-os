/**
 * AI's card for a new ad (the Ads plan's 6.3 and 6.7, "Who calls the writer"; decision 0050, call 12). Asked for an ad
 * in its own turn, AI proposes this card; its press drafts the ad on New ad's own route (POST ads/draft), with the
 * same builder New ad's + New uses, keeps it as the workspace's draft, and opens New ad on it, where the ad writer
 * writes its words as it does for + New. AI decides none of the draft: code picks the service where none was named,
 * the picture where no piece was, the area, the amount and the end. It never turns an ad on, holds no token and spends nothing at Meta:
 * Turn on is the owner's own press in New ad.
 *
 * What the card carries: the service the person named, as Services names it, or none for the draft's own pick; the
 * most any ad may cost, in whole units of the ad account's currency, where the owner said one in their own words (the
 * plan's G6), which the press keeps on the account before it drafts; and the piece AI made that the owner asked about,
 * by its file's id, where Content's rule lets it run, which the press drafts around as Run as an ad does (6.8, join 3).
 * New ad opens on the draft the press kept, never on the piece's own address, which would draft it again. Pure.
 */
import type { ProposalSpec } from "../ask/proposals/spec";
import { newAdRoute } from "./address";

/** What an ad card commits: New ad's own route, with the service named, the owner's most and the piece, each as carried. */
export const adDraftSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload }) => {
    // Read here, not through the specs' own helpers: the cards' folder imports this one, and leans one way.
    const service = typeof payload.service === "string" ? payload.service.trim() : "";
    const most = typeof payload.most === "number" && Number.isSafeInteger(payload.most) ? payload.most : null;
    const picture = typeof payload.picture === "string" ? payload.picture : "";
    return {
      route: "POST ads/draft",
      body: {
        ...(service ? { service } : {}),
        ...(most !== null && most > 0 ? { most } : {}),
        ...(picture ? { picture } : {}),
      },
    };
  },
  receipt: () => "Drafted. New ad is open on it.",
  open: () => newAdRoute(),
};
