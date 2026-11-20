/**
 * Loads Reports' Ads lens on demand: its body (lenses/ads-live.tsx) and the Ads page's own read (GET ads/page) are
 * fetched together, only where Ads is drawn here (`adsAreOn`, campaigns/ads/shown.ts) and on the Ads lens, so its model
 * and words are not part of the Reports page every workspace loads. Nothing draws until both land. `useAdsLens` is what
 * the page asks: the head's sentence and what the lens draws, each none where Ads is not on.
 */
import { useEffect, useState } from "react";
import type { AdsLiveDto, LensId } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { adsAreOn } from "../chrome";

/** The lens's body and its read: the workspace's own ads, none connected, or a read that failed. */
export interface AdsDraw {
  Live: (typeof import("./ads-live"))["AdsLiveLens"];
  live: AdsLiveDto | null;
  failed: boolean;
}

/** What Reports asks of the Ads. */
interface AdsHere {
  /** The Ads lens's head: the page's own sentence, none where the lens is not the one drawn or has nothing to say. */
  head: { head: string | null } | null;
  draw: AdsDraw | null;
}

const LENS_NOTHING: AdsHere = { head: null, draw: null };

/** The lens of the workspace's own ads, where the Ads lens is on screen. */
export function useAdsLens(lens: LensId): AdsHere {
  const on = adsAreOn() && lens === "ads";
  const [held, setHeld] = useState<{
    Live: AdsDraw["Live"];
    head: (typeof import("./ads-live"))["adsLiveHead"];
    dto: AdsLiveDto | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    const page = read("GET ads/page").then(
      (dto) => ({ dto, failed: false }),
      () => ({ dto: null, failed: true }),
    );
    const lens = import("./ads-live").then((m) => m.AdsLiveLens);
    const head = import("./ads-live").then((m) => m.adsLiveHead);
    void Promise.all([lens, head, page]).then(([drawn, headline, answer]) => {
      if (live) setHeld({ Live: drawn, head: headline, ...answer });
    });
    return () => {
      live = false;
    };
  }, [on]);
  if (!on || held === null) return LENS_NOTHING;
  return {
    head: { head: held.dto ? held.head(held.dto) : null },
    draw: { Live: held.Live, live: held.dto, failed: held.failed },
  };
}
