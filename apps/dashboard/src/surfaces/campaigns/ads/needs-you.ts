/**
 * How many things in Ads need their owner, as the Ads page last read them: each ad whose own need is set (Meta refused it,
 * could not charge for it or found a problem, AI can't answer it, or Meta paused it while it is on here), or the account
 * Meta signed out, which is one problem however many ads it touches, counted once. Content's tab on Campaigns' strip and
 * the Ads tab beside Made and the Library say it amber without reading Ads themselves, and the Ads tab says how many ads
 * its list holds (Campaigns in three tabs, 23 Nov 2026; Ads a list of its own, 25 Nov 2026). Until the Ads page has noted
 * its own, they are said from the reads Ads opens on, where a load of Content read them beside its own
 * (bridge/surfaces/ads-first-reads.ts): so the Ads tab says its figure with Made's and the Library's at the first draw, where
 * it came 2.7 s after them (Ruben, 26 Nov 2026). None before either; an ad paused on purpose has no need, and is never
 * counted.
 *
 * Whose they are (the review of 28 Nov 2026, R2.10): one workspace's, kept with the workspace the address named as they were
 * noted, and said only while the address still names it. A switch of workspace loads the page again today
 * (bridge/surface-data.ts switchWorkspace), which starts this again; were one ever not to, another workspace's counts are
 * not this one's, and nothing is said until its own are read. The strip's chrome may read this without the bridge (no
 * import circle through the routes: the first reads are a leaf), so the workspace is read off the address here.
 */
import { useSyncExternalStore } from "react";
import type { AdsLiveDto } from "@chanlytics/contracts";
import { adsFirstAnswer } from "@/bridge/surfaces/ads-first-reads";
import { adsListedOf } from "./live/listed";

/**
 * The workspace the address names (`/w/<slug>`), as the bridge reads it (bridge/workspace.ts pathWorkspace, which this tree's
 * chrome can't import: the routes it reads import this): whose counts, filter and find line these are. Null off a workspace
 * page, or outside a browser.
 */
export function adsWorkspaceNow(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  const named = /^\/w\/([^/?#]+)/.exec(window.location.pathname ?? "")?.[1];
  if (!named) return null;
  try {
    return decodeURIComponent(named) || null;
  } catch {
    return null;
  }
}

/** One workspace's counts, as the Ads page last read them on this page: each null before it has. */
interface AdsNoted {
  workspace: string | null;
  /** How many things in Ads needed the owner. */
  needing: number | null;
  /** How many ads its list holds, for the Ads tab's figure. */
  listed: number | null;
}

let noted: AdsNoted = { workspace: null, needing: null, listed: null };
/** Who hears the counts change: the strip, and the Ads tab. */
const hearers = new Set<() => void>();

/** The counts noted for the workspace on screen; none of another's. */
function notedHere(): AdsNoted {
  const workspace = adsWorkspaceNow();
  return noted.workspace === workspace ? noted : { workspace, needing: null, listed: null };
}

/** One count noted for the workspace on screen, and each that hears them told of a change. */
function keepCount(part: "needing" | "listed", count: number): void {
  const mine = notedHere();
  if (mine[part] === count) return;
  noted = { ...mine, [part]: count };
  for (const tell of [...hearers]) tell();
}

/** The ads the first reads hold for the workspace on screen, before its page has noted its own; none of another's. */
const firstPageHere = (): AdsLiveDto | null => adsFirstAnswer(adsWorkspaceNow())?.page ?? null;

/** What needs the owner in an Ads read: the account Meta signed out, once, else each ad with a need of its own. */
export const adsNeedingOf = (dto: AdsLiveDto): number =>
  dto.account.status === "revoked" ? 1 : dto.ads.filter((ad) => ad.needs !== null).length;

/** How many things in Ads needed the owner as the Ads page last read them, else as Ads' first reads hold them; 0 before. */
export const adsNeedingNow = (): number => {
  const mine = notedHere().needing;
  if (mine !== null) return mine;
  const first = firstPageHere();
  return first ? adsNeedingOf(first) : 0;
};

/** How many ads the Ads tab says: as the Ads page last read them, else as Ads' first reads hold them; none before. */
const adsListedNow = (): number | null => {
  const mine = notedHere().listed;
  if (mine !== null) return mine;
  const first = firstPageHere();
  return first ? adsListedOf(first) : null;
};

/** Kept as the Ads page reads its ads, for the strip and Made's views to say; each that hears it is told of a change. */
export function noteAdsNeeding(count: number): void {
  keepCount("needing", count);
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
  keepCount("listed", count);
}

/** How many ads the Ads tab says, for a component: none before Ads has been read on this visit. */
export const useAdsListed = (): number | null => useSyncExternalStore(hearAdsNeeding, adsListedNow, () => null);
