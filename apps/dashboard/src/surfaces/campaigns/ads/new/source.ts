/**
 * Where New ad's answers come from: the workspace's own two routes (bridge/verbs/ads.ts), or, on the page's example,
 * the example itself (sample.ts). The screen asks one and never knows which, so the example draws the product as it
 * is. An answer that never came is null: the screen says so, and nothing is guessed.
 */
import type { AdDraftAnswer, AdDraftState, AdWordsAnswer } from "@/server/ads/draft-shape";
import { askAdDraft, askAdWords } from "@/bridge/verbs/ads";

/** What the screen asks the ad writer for. */
type AdWordsAsk =
  { job: "write"; draft: AdDraftState; no_price?: boolean } | { job: "change"; draft: AdDraftState; asked: string };

export interface AdSource {
  /** An example on the page's sample: nothing is made anywhere. */
  sample: boolean;
  /** The workspace's kept draft, or a fresh one, where none is sent; else that draft as it stands now. */
  draft: (body: { draft?: AdDraftState; act?: "next_picture" }) => Promise<AdDraftAnswer | null>;
  /** The ad writer's words, or the one change AI was told to make. */
  words: (body: AdWordsAsk) => Promise<AdWordsAnswer | null>;
}

/** The workspace's own routes. A refusal is no answer: the screen says it could not, in its own words. */
export const LIVE_AD_SOURCE: AdSource = {
  sample: false,
  draft: async (body) => {
    const answer = await askAdDraft(body);
    return answer?.ok ? answer.data : null;
  },
  words: async (body) => {
    const answer = await askAdWords(body);
    return answer?.ok ? answer.data : null;
  },
};
