/**
 * Which ads the Ads list holds, and how many: the one rule the page's rows (model.ts), Reports' Ads lens (lens-model.ts) and
 * the Ads tab's figure beside Made and the Library (../needs-you.ts) read. A leaf the strip's chrome may import.
 *
 * Two halves of one account, and every ad is in one of them (the review of 28 Nov 2026, R2.7: an owner asking "why did that
 * ad never run" could not find it). `shown`: what the list shows without a press, the tab counts and Reports lists, as
 * before. `quiet`: the ads that are over with nothing to show over the page's days, which the page keeps under Ended,
 * folded (ad-list.ts). An account with years of ads still reads as the few that matter, and none is ever out of reach.
 */
import type { AdLiveDto, AdsLiveDto } from "@chanlytics/contracts";

/** Whether an ad's run is over. */
export const over = (ad: Pick<AdLiveDto, "state">): boolean => ad.state === "ended" || ad.state === "finished";

/** The ads a page lists: every one still running or waiting, and a finished one only while it has numbers to show. */
export const shown = (dto: AdsLiveDto): AdLiveDto[] =>
  dto.ads.filter((ad) => !over(ad) || ad.people > 0 || ad.spend_minor > 0);

/**
 * The ads that are over with nothing to show over the page's days: nobody came from them and they spent nothing in it,
 * one that never ran and one that ended long ago alike. Under Ended, folded: found by a press or by name, never counted in
 * the tab's figure or listed in Reports, where a row of zeros says nothing.
 */
export const quiet = (dto: AdsLiveDto): AdLiveDto[] =>
  dto.ads.filter((ad) => over(ad) && ad.people === 0 && ad.spend_minor === 0);

/** How many ads the list holds, the Ads tab's figure on Made and the Library: the ads it shows. */
export const adsListedOf = (dto: AdsLiveDto): number => shown(dto).length;
