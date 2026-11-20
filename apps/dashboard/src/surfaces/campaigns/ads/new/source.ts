/**
 * Where New ad's answers come from: the workspace's own two routes (bridge/verbs/ads.ts), handed to the screen as one
 * source, so a test can answer it by hand. An answer that never came is null: the screen says so, and nothing is guessed.
 */
import type { AdDraftAnswer, AdDraftState, AdWordsAnswer } from "@/server/ads/draft-shape";
import { askAdDraft, askAdWords } from "@/bridge/verbs/ads";

/** What the screen asks the ad writer for. */
type AdWordsAsk =
  { job: "write"; draft: AdDraftState; no_price?: boolean } | { job: "change"; draft: AdDraftState; asked: string };

export interface AdSource {
  /** The workspace's kept draft, or a fresh one, where none is sent; else that draft as it stands now. */
  draft: (body: { draft?: AdDraftState; act?: "next_picture" }) => Promise<AdDraftAnswer | null>;
  /** The ad writer's words, or the one change AI was told to make. */
  words: (body: AdWordsAsk) => Promise<AdWordsAnswer | null>;
}

/** The workspace's own routes. A refusal is no answer: the screen says it could not, in its own words. */
export const LIVE_AD_SOURCE: AdSource = {
  draft: async (body) => {
    const answer = await askAdDraft(body);
    return answer?.ok ? answer.data : null;
  },
  words: async (body) => {
    const answer = await askAdWords(body);
    return answer?.ok ? answer.data : null;
  },
};
