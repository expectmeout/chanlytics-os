/**
 * Which ads the Ads list holds, and how many: the one rule the page's rows (model.ts), Reports' Ads lens (lens-model.ts) and
 * the Ads tab's figure beside Made and the Library (../needs-you.ts) read. A leaf the strip's chrome may import.
 */
import type { AdLiveDto, AdsLiveDto } from "@chanlytics/contracts";

/** Whether an ad's run is over. */
export const over = (ad: Pick<AdLiveDto, "state">): boolean => ad.state === "ended" || ad.state === "finished";

/** The ads a page lists: every one still running or waiting, and a finished one only while it has numbers to show. */
export const shown = (dto: AdsLiveDto): AdLiveDto[] =>
  dto.ads.filter((ad) => !over(ad) || ad.people > 0 || ad.spend_minor > 0);

/** How many ads the list holds, the Ads tab's figure on Made and the Library: the ads it shows. */
export const adsListedOf = (dto: AdsLiveDto): number => shown(dto).length;
