/**
 * AI stopped, and the ads (the content loop PRD's 14.1, call 21, taken 21 Nov 2026; it reverses the Ads plan's G17).
 * Stop everything pauses the ads made here itself, in the same act, since while it holds nobody answers the people an ad
 * brings. The page and the card say so, and tell of every ad still on: one made in Meta's own tools is never paused by
 * the stop, and the owner's one press pauses them, each through the pause route and its pace (use-press.ts). After a
 * Resume, the ads the stop paused stay paused, since turning an ad on spends: the page names how many, with the owner's
 * own press that turns them back on. An ad is on where it runs, or where its own switch is on while Meta still checks it:
 * that one starts by itself once approved (contracts adLeftOn). Pure: the page's read is handed in.
 */
import { adLeftOn } from "@chanlytics/contracts";
import type { AdLiveDto, AdsLiveDto } from "@chanlytics/contracts";
import { maySpend } from "./change-model";
import { STOP, STOPPED_ADS } from "./words";

export interface StopVM {
  title: string;
  body: string;
  /** The owner's one press, naming how many it pauses or turns back on; null where this member may not, or none waits. */
  press: string | null;
  /** What the press does: pause the ads still on while AI is stopped, or turn back on the ones the stop paused. */
  act: "pause" | "resume";
  /** Said in the press's place to a member who may not press it. */
  ownerOnly: string | null;
}

/** The ads one press pauses: on, and not already being paused. */
export const adsLeftOn = (dto: AdsLiveDto): AdLiveDto[] =>
  dto.ads.filter((ad) => adLeftOn(ad.state) && ad.pending !== "pausing");

/** The ads Stop everything paused that stand so: what the owner's own press turns back on after a Resume. */
export const adsPausedByStop = (dto: AdsLiveDto): AdLiveDto[] =>
  dto.ads.filter((ad) => ad.paused_by === "stop" && ad.pending !== "resuming");

/** After a Resume: how many the stop paused, with the press that turns them back on; null where none waits. */
function afterResumeOf(dto: AdsLiveDto): StopVM | null {
  const held = adsPausedByStop(dto);
  if (held.length === 0) return null;
  return {
    title: STOPPED_ADS.title,
    body: STOPPED_ADS.body(held.length),
    press: maySpend(dto) ? STOPPED_ADS.press(held.length) : null,
    act: "resume",
    // Turning an ad back on can spend: where that is switched off here, the owner is told where it is done.
    ownerOnly: maySpend(dto) ? null : dto.can_press ? STOPPED_ADS.inMeta : STOPPED_ADS.ownerOnly,
  };
}

/**
 * What the page and the card say of the ads while AI is stopped, or once it runs again with ads the stop paused; null
 * while AI runs with none, where Chanlytics is signed out or let go, or before the page is read.
 */
export function aiStopOf(dto: AdsLiveDto | null | undefined): StopVM | null {
  if (!dto || dto.account.status !== "connected") return null;
  if (!dto.stopped_at) return afterResumeOf(dto);
  const here = dto.ads.filter((ad) => ad.paused_by === "stop").length;
  const on = adsLeftOn(dto);
  const pausing = dto.ads.filter((ad) => ad.pending === "pausing" && ad.paused_by !== "stop").length;
  if (on.length === 0) {
    if (here === 0 && pausing === 0) return null;
    return {
      title: STOP.title,
      body: here > 0 ? STOP.pausedHere(here) : STOP.pausing(pausing),
      press: null,
      act: "pause",
      ownerOnly: null,
    };
  }
  const stillOn = STOP.on(
    on.length,
    on.every((ad) => ad.made_in_platform),
  );
  return {
    title: STOP.title,
    body: here > 0 ? `${STOP.pausedHere(here)} ${stillOn}` : stillOn,
    press: dto.can_press ? STOP.press(on.length) : null,
    act: "pause",
    ownerOnly: dto.can_press ? null : STOP.ownerOnly,
  };
}
