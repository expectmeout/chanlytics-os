/**
 * New ad's asks (the Ads plan's 4.6 and 4.7): the draft, picked or judged again; the ad writer on it; Turn on, the
 * owner's press, under a key of its own so the same press twice makes one ad; and Check, on an ad whose last switch
 * Meta never answered. Each answers as the typed client answers, or null where no answer came at all.
 */
import { api } from "@/bridge/api";
import type { AdDraftState, AdWideArea } from "@/server/ads/draft-shape";

/**
 * A fresh draft where none is sent (around a picture, where Run as an ad named one); else that draft as it stands now,
 * after the one act a check offers where named.
 */
export const askAdDraft = (body: { draft?: AdDraftState; act?: "next_picture"; picture?: string }) =>
  api()("POST ads/draft", { body }).catch(() => null);

/** The ad writer: three versions of a draft's words, or the one change the owner told AI to make. */
export const askAdWords = (
  body:
    { job: "write"; draft: AdDraftState; no_price?: boolean } | { job: "change"; draft: AdDraftState; asked: string },
) => api()("POST ads/words", { body }).catch(() => null);

/** What Turn on's press showed: refused where the draft holds anything else now (decision 0050, call 3). */
export interface TurnOnPressed {
  service: string;
  picture: string;
  miles: number;
  /** The wider place it showed the ad across; none for the circle. */
  area?: Pick<AdWideArea, "kind" | "key">;
  most_minor: number;
  end_day: string;
  versions: { text: string; headline: string }[];
}

/** Turn on: the kept draft, as the press showed it, set up at Meta. The press's key goes in its body and its header. */
export const pressTurnOn = (key: string, expect: TurnOnPressed) =>
  api()("POST ads/turn-on", { body: { key, expect }, idempotencyKey: key }).catch(() => null);

/**
 * Pause all: every ad still on paused in one press, each with the version it was drawn from (the Ads plan's G17). The
 * server keeps every pause before it answers; null where no answer came at all.
 */
export const pressPauseAll = (ads: readonly { id: string; version: number }[]) =>
  api()("POST ads/pause-all", { body: { ads: ads.map((ad) => ({ id: ad.id, version: ad.version })) } }).catch(
    () => null,
  );

/** Check: Meta is asked at once what stands of an ad whose last switch it never answered. */
export const pressAdCheck = (id: string, version: number) =>
  api()("POST ads/[id]/check", { params: { id }, body: { version } }).catch(() => null);
