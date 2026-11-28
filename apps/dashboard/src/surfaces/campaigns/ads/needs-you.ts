/**
 * How many things in Ads need their owner, as the Ads page last read them: each ad whose own need is set (Meta refused it,
 * could not charge for it or found a problem, AI can't answer it, or Meta paused it while it is on here), or the account
 * Meta signed out, which is one problem however many ads it touches, counted once. Content's tab on Campaigns' strip and
 * the Ads tab beside Made and the Library say it amber without reading Ads themselves, and the Ads tab says how many ads
 * its list holds (Campaigns in three tabs, 23 Nov 2026; Ads a list of its own, 25 Nov 2026). Until the Ads page has noted
 * its own, they are said from the reads Ads opens on, where a load of Content read them beside its own
 * (bridge/surfaces/ads-first-reads.ts): so the Ads tab says its figure with Made's and the Library's at the first draw, where
 * it came 2.7 s after them (Ruben, 26 Nov 2026). None before either; an ad paused on purpose has no need, and is never
 * counted. It is this workspace's: another is opened by loading its page (bridge/surface-data.ts switchWorkspace), which
 * starts this again, so the strip's chrome may read it without the bridge (no import circle through the routes: the first
 * reads are a leaf).
 */
import { useSyncExternalStore } from "react";
import type { AdsLiveDto } from "@chanlytics/contracts";
import { adsFirstPage, adsFirstReadIn } from "@/bridge/surfaces/ads-first-reads";
import { adsListedOf } from "./live/listed";

/** The count as the Ads page last read it on this page; null before it has. */
let noted: number | null = null;
/** How many ads its list holds, as the Ads page last read them, for the Ads tab's figure; null before it has. */
let adsListed: number | null = null;
/** Whether the reads made ahead of the Ads tab's press came back with no figure to say (warm.ts noteAdsUnlisted). */
let adsUnlisted = false;
/** Who hears the counts change: the strip, and the Ads tab. */
const hearers = new Set<() => void>();

/** What needs the owner in an Ads read: the account Meta signed out, once, else each ad with a need of its own. */
export const adsNeedingOf = (dto: AdsLiveDto): number =>
  dto.account.status === "revoked" ? 1 : dto.ads.filter((ad) => ad.needs !== null).length;

/** How many things in Ads needed the owner as the Ads page last read them, else as Ads' first reads hold them; 0 before. */
export const adsNeedingNow = (): number => {
  if (noted !== null) return noted;
  const first = adsFirstPage();
  return first ? adsNeedingOf(first) : 0;
};

/**
 * How many ads the Ads tab says: as the Ads page last read them, else as Ads' first reads hold them. Before either, `null`:
 * the figure is on its way, and the tab keeps its room (the kit's SubTab `count: null`), so the strip does not move as it
 * lands a moment after a press from another of Campaigns' views (Ruben, 28 Nov 2026). And none at all (`undefined`) where the
 * reads answered with no page, no account ever connected, or could not be made: the tab then keeps no room for one.
 */
const adsListedNow = (): number | null | undefined => {
  if (adsListed !== null) return adsListed;
  const first = adsFirstPage();
  if (first) return adsListedOf(first);
  return adsUnlisted || adsFirstReadIn() ? undefined : null;
};

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

/** Kept as the Ads page reads its ads: how many its list holds, which the Ads tab says beside its name on every list. */
export function noteAdsListed(count: number): void {
  if (adsListed === count) return;
  adsListed = count;
  for (const tell of [...hearers]) tell();
}

/** Told as the reads made ahead of the Ads tab's press say no figure (warm.ts): the tab stops keeping room for one. */
export function noteAdsUnlisted(): void {
  if (adsUnlisted) return;
  adsUnlisted = true;
  for (const tell of [...hearers]) tell();
}

/** How many ads the Ads tab says, for a component: `null` while its read is on its way, and none where there is none to say. */
export const useAdsListed = (): number | null | undefined =>
  useSyncExternalStore(hearAdsNeeding, adsListedNow, () => null);
