/**
 * How many things in Ads need their owner, as the Ads page last read them: each ad whose own need is set (Meta refused it,
 * could not charge for it or found a problem, AI can't answer it, or Meta paused it while it is on here), or the account
 * Meta signed out, which is one problem however many ads it touches, counted once. Content's tab on Campaigns' strip and
 * Ads among Made's views say it amber without reading Ads themselves (Campaigns in three tabs, 23 Nov 2026). None before
 * the Ads page has been read on this visit; an ad paused on purpose has no need, and is never counted. It is this
 * workspace's: another is opened by loading its page (bridge/surface-data.ts switchWorkspace), which starts this again, so
 * the strip's chrome may read it without the bridge (no import circle through the routes).
 */
import { useSyncExternalStore } from "react";
import type { AdsLiveDto } from "@chanlytics/contracts";

/** The count as the Ads page last read it on this page; null before it has. */
let noted: number | null = null;
/** Who hears the count change: the strip, and Made's views. */
const hearers = new Set<() => void>();

/** What needs the owner in an Ads read: the account Meta signed out, once, else each ad with a need of its own. */
export const adsNeedingOf = (dto: AdsLiveDto): number =>
  dto.account.status === "revoked" ? 1 : dto.ads.filter((ad) => ad.needs !== null).length;

/** How many things in Ads needed the owner as the Ads page last read them; 0 before it has. */
export const adsNeedingNow = (): number => noted ?? 0;

/** Kept as the Ads page reads its ads, for the strip and Made's views to say; each that hears it is told of a change. */
export function noteAdsNeeding(count: number): void {
  if (noted === count) return;
  noted = count;
  for (const tell of [...hearers]) tell();
}

/** Hear the count change (the strip draws Content's tab again by it); answers the stop. */
export function hearAdsNeeding(tell: () => void): () => void {
  hearers.add(tell);
  return () => void hearers.delete(tell);
}

/** The count, for a component: it draws again as the Ads page notes a new one. */
export const useAdsNeeding = (): number => useSyncExternalStore(hearAdsNeeding, adsNeedingNow, () => 0);
