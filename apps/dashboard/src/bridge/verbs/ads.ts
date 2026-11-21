/**
 * New ad's asks (the Ads plan's 4.6 and 4.7): the draft, picked or judged again; the ad writer on it; Turn on, the
 * owner's press, under a key of its own so the same press twice makes one ad; and Check, on an ad whose last switch
 * Meta never answered. Each answers as the typed client answers, or null where no answer came at all.
 */
import { adChangeMostOf } from "@chanlytics/contracts";
import type { AdChangeAsk, AdLiveDto } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import type { AdDraftState, AdWideArea } from "@/server/ads/draft-shape";

/** A fresh draft where none is sent; else that draft as it stands now, after the one act a check offers where named. */
export const askAdDraft = (body: { draft?: AdDraftState; act?: "next_picture" }) =>
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

/** Check: Meta is asked at once what stands of an ad whose last switch it never answered. */
export const pressAdCheck = (id: string, version: number) =>
  api()("POST ads/[id]/check", { params: { id }, body: { version } }).catch(() => null);

/**
 * A change to a running ad made here (the Ads plan's 4.5), to its route, carrying the version the drawer was drawn from
 * and what Meta held then, and the most a raise names (decision 0050, call 3).
 */
export function pressAdChange(ad: AdLiveDto, ask: AdChangeAsk) {
  const params = { id: ad.id };
  const call = api();
  const { version } = ad;
  if (ask.what === "total") {
    const from = ad.budget?.minor ?? 0;
    const most = adChangeMostOf(ask, { totalMinor: from });
    return call("POST ads/[id]/budget", {
      params,
      body: { version, total_minor: ask.total_minor, from_minor: from, expect_max_minor: most },
    }).catch(() => null);
  }
  if (ask.what === "end_day")
    return call("POST ads/[id]/end-date", {
      params,
      body: { version, end_day: ask.end_day, from_ends_at: ad.ends_at ?? "" },
    }).catch(() => null);
  if (ask.what === "miles")
    return call("POST ads/[id]/area", { params, body: { version, miles: ask.miles } }).catch(() => null);
  return call("POST ads/[id]/end", { params, body: { version } }).catch(() => null);
}

/** Fix it: AI rewrites an ad Meta turned down from Meta's words, kept as the draft New ad opens on. */
export const pressAdFix = (id: string) => api()("POST ads/[id]/fix", { params: { id }, body: {} }).catch(() => null);
