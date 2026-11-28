/**
 * Where New ad's answers come from: the workspace's own two routes (bridge/verbs/ads.ts), handed to the screen as one
 * source, so a test can answer it by hand. An answer that never came is null: the screen says so, and nothing is guessed.
 */
import type { AdPreviewAnswer } from "@/server/ads/preview-shape";
import type { AdDraftAnswer, AdDraftState, AdWordsAnswer } from "@/server/ads/draft-shape";
import { SECOND_MS } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { askAdDraft, askAdWords, askWhatsAppStanding, pressTurnOn, type TurnOnPressed } from "@/bridge/verbs/ads";
import { askAdPreview } from "./meta-preview";
import type { CopyAsked } from "./picture-copy";

/** How often a draft's video on its way back is asked after: the pace a clip's own page asks at (files/footage). */
const COPY_ASK_EVERY_MS = 10 * SECOND_MS;

/** What the screen asks the ad writer for. */
type AdWordsAsk =
  { job: "write"; draft: AdDraftState; no_price?: boolean } | { job: "change"; draft: AdDraftState; asked: string };

export interface AdSource {
  /**
   * The workspace's kept draft, or a fresh one, where none is sent; a fresh one around a picture, where Run as an ad
   * named one; else that draft as it stands now.
   */
  draft: (body: { draft?: AdDraftState; act?: "next_picture"; picture?: string }) => Promise<AdDraftAnswer | null>;
  /** Meta's own preview of one version of the kept draft; a source with none draws Chanlytics' own and says so. */
  preview?: (version: number) => Promise<AdPreviewAnswer | null>;
  /** The ad writer's words, or the one change AI was told to make. */
  words: (body: AdWordsAsk) => Promise<AdWordsAnswer | null>;
  /** Turn on, under the press's own key, carrying what the press showed: the ad, or the server's words for no. */
  turnOn: (key: string, expect: TurnOnPressed) => Promise<{ ad: string } | { refused: string } | null>;
  /** Check again: WhatsApp is asked now whether the number can answer an ad's chat; a source with none reads again alone. */
  checkWhatsApp?: () => Promise<boolean>;
  /**
   * Where a draft's video's copy stands now, asked after at the source's own pace while it comes back (its row, on the
   * member's session: asking never spends a return). Null where it was not asked or not answered; a source with none
   * says only what the draft said.
   */
  copy?: (fileId: string) => Promise<CopyAsked>;
}

/** The workspace's own routes. A refusal is no answer: the screen says it could not, in its own words. */
export const LIVE_AD_SOURCE: AdSource = {
  draft: async (body) => {
    const answer = await askAdDraft(body);
    return answer?.ok ? answer.data : null;
  },
  preview: askAdPreview,
  words: async (body) => {
    const answer = await askAdWords(body);
    return answer?.ok ? answer.data : null;
  },
  turnOn: async (key, expect) => {
    const answer = await pressTurnOn(key, expect);
    if (answer === null) return null;
    return answer.ok ? { ad: answer.data.ad_id } : { refused: answer.message };
  },
  checkWhatsApp: askWhatsAppStanding,
  copy: async (fileId) => {
    await new Promise<void>((waited) => window.setTimeout(waited, COPY_ASK_EVERY_MS));
    // A tab nobody is looking at asks nothing: the next turn asks.
    if (document.visibilityState !== "visible") return null;
    const answer = await api()("GET files/[id]/copy", { params: { id: fileId } }).catch(() => null);
    return answer?.ok ? { state: answer.data.copy, why: answer.data.copy_why } : null;
  },
};
