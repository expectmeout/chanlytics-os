/**
 * AI stopped with ads still on (the Ads plan's G17; decision 0050, call 11). While Stop everything holds, no draft is
 * written and no ad is turned on from here, but an ad already running keeps running at Meta, which keeps charging for
 * it. The page and the card say so, with how many are on, and the owner's one press pauses them all, each through the
 * pause route and its pace (use-press.ts). An ad is on where it runs, or where its own switch is on while Meta still
 * checks it: that one starts by itself once approved (contracts adLeftOn). Pure: the page's read is handed in.
 */
import { adLeftOn } from "@chanlytics/contracts";
import type { AdLiveDto, AdsLiveDto } from "@chanlytics/contracts";
import { STOP } from "./words";

export interface StopVM {
  title: string;
  body: string;
  /** The owner's one press, naming how many it pauses; null where this member may not press it, or none waits. */
  press: string | null;
  /** Said in the press's place to a member who may not press it. */
  ownerOnly: string | null;
}

/** The ads one press pauses: on, and not already being paused. */
export const adsLeftOn = (dto: AdsLiveDto): AdLiveDto[] =>
  dto.ads.filter((ad) => adLeftOn(ad.state) && ad.pending !== "pausing");

/** What the page and the card say while AI is stopped; null while AI runs, with nothing on, or where nothing can be paused. */
export function aiStopOf(dto: AdsLiveDto | null | undefined): StopVM | null {
  if (!dto?.stopped_at || dto.account.status !== "connected") return null;
  const on = adsLeftOn(dto);
  if (on.length === 0) {
    const pausing = dto.ads.filter((ad) => ad.pending === "pausing").length;
    return pausing === 0 ? null : { title: STOP.title, body: STOP.pausing(pausing), press: null, ownerOnly: null };
  }
  return {
    title: STOP.title,
    body: STOP.on(on.length),
    press: dto.can_press ? STOP.press(on.length) : null,
    ownerOnly: dto.can_press ? null : STOP.ownerOnly,
  };
}
