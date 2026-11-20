/**
 * New ad's two asks (the Ads plan's 4.6): the draft, picked or judged again, and the ad writer on it. Each answers as
 * the typed client answers, or null where no answer came at all. Neither keeps anything, and neither reaches Meta: the
 * draft is the screen's to hold until Turn on.
 */
import { api } from "@/bridge/api";
import type { AdDraftState } from "@/server/ads/draft-shape";

/** A fresh draft where none is sent; else that draft as it stands now, after the one act a check offers where named. */
export const askAdDraft = (body: { draft?: AdDraftState; act?: "next_picture" }) =>
  api()("POST ads/draft", { body }).catch(() => null);

/** The ad writer: three versions of a draft's words, or the one change the owner told AI to make. */
export const askAdWords = (
  body:
    { job: "write"; draft: AdDraftState; no_price?: boolean } | { job: "change"; draft: AdDraftState; asked: string },
) => api()("POST ads/words", { body }).catch(() => null);
