/**
 * How many things in Ads need their owner, as the Ads page last read them: each ad whose own need is set (Meta refused it,
 * could not charge for it or found a problem, AI can't answer it, or Meta paused it while it is on here), or the account
 * Meta signed out, which is one problem however many ads it touches, counted once. Content's tab on Campaigns' strip and
 * Ads among Made's views say it amber without reading Ads themselves (Campaigns in three tabs, 23 Nov 2026). None before
 * the Ads page has been read on this visit, and none of another workspace's; an ad paused on purpose has no need, and is
 * never counted.
 */
import { useSyncExternalStore } from "react";
import type { AdsLiveDto } from "@chanlytics/contracts";
import { getActiveWorkspace } from "@/bridge/workspace";

/** The count as the Ads page last read it, and the workspace it was read in. */
let noted: { workspace: string | null; count: number } | null = null;
const heard = new Set<() => void>();

/** What needs the owner in an Ads read: the account Meta signed out, once, else each ad with a need of its own. */
export const adsNeedingOf = (dto: AdsLiveDto): number =>
  dto.account.status === "revoked" ? 1 : dto.ads.filter((ad) => ad.needs !== null).length;

/** How many things in Ads needed the owner as the Ads page last read them here; 0 before it has, or in another workspace. */
export const adsNeedingNow = (): number =>
  noted !== null && noted.workspace === getActiveWorkspace() ? noted.count : 0;

/** Kept as the Ads page reads its ads, for the strip and Made's views to say; each that hears it is told of a change. */
export function noteAdsNeeding(count: number): void {
  const workspace = getActiveWorkspace();
  if (noted !== null && noted.workspace === workspace && noted.count === count) return;
  noted = { workspace, count };
  for (const tell of [...heard]) tell();
}

/** Hear the count change (the strip draws Content's tab again by it); answers the stop. */
export function hearAdsNeeding(tell: () => void): () => void {
  heard.add(tell);
  return () => void heard.delete(tell);
}

/** The count, for a component: it draws again as the Ads page notes a new one. */
export const useAdsNeeding = (): number => useSyncExternalStore(hearAdsNeeding, adsNeedingNow, () => 0);
