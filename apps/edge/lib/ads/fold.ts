/**
 * An ad made here, folded back into one (the Ads plan's 6.1; decision 0050, call 5). Turn on makes three ads at Meta,
 * one for each version of the words, under one ad set and one total, and the owner sees one ad. So before a read keeps
 * what Meta listed, each version is folded into the ad its launch made first: its days are added to that ad's, and the
 * ad's word is the best any version has (one running is running; one Meta is checking, with none running, is in review;
 * turned down only where every version is). A part a launch made that is not yet the ad's, because the launch is still
 * on its way or stopped part way, is the launch's: it is never adopted as an ad the owner made in Meta.
 *
 * Pure: Meta's answers and what the workspace holds of its ads made here are handed in.
 */
import type { MetaAd, MetaAdDay } from "@chanlytics/channels/ads";
import type { AdMadeHereRow } from "@chanlytics/db/ads";
import { launchTagOf, tagIn } from "./tag.js";

/** Meta's words for an ad, best first: what a folded ad says is the best word any of its versions has. */
const WORD_RANK: Readonly<Record<string, number>> = {
  ACTIVE: 0,
  PENDING_REVIEW: 1,
  IN_PROCESS: 1,
  PREAPPROVED: 1,
  PENDING_BILLING_INFO: 2,
  WITH_ISSUES: 3,
  PAUSED: 4,
  ADSET_PAUSED: 4,
  CAMPAIGN_PAUSED: 4,
  DISAPPROVED: 5,
  ARCHIVED: 6,
  DELETED: 6,
};
const rankOf = (word: string): number => WORD_RANK[word] ?? 7;

/** Where each of Meta's ads goes: kept as its own (undefined), folded into an ad made here (its id), or left out (null). */
type Fold = (ad: Pick<MetaAd, "id" | "name">) => string | null | undefined;

/** Where each ad of Meta's goes, from what the workspace holds of its ads made here. */
export function foldOf(madeHere: readonly AdMadeHereRow[]): Fold {
  const byVersion = new Map<string, AdMadeHereRow>();
  const byTag = new Map<string, AdMadeHereRow>();
  for (const row of madeHere) {
    byTag.set(launchTagOf(row.id), row);
    for (const id of row.versions) byVersion.set(id, row);
  }
  return (ad) => {
    const tag = tagIn(ad.name);
    const row = byVersion.get(ad.id) ?? (tag === null ? undefined : byTag.get(tag));
    if (row === undefined) return undefined;
    return row.status === "made" && row.platform_ad_id !== null ? row.platform_ad_id : null;
  };
}

/** One ad made here, from the versions Meta listed of it: the first one's facts, the best word, and Meta's reason. */
function foldedAd(main: string, versions: readonly MetaAd[]): MetaAd {
  const [first] = versions;
  const base = versions.find((ad) => ad.id === main) ?? first;
  if (!base) throw new Error("a folded ad has a version");
  const best = [...versions].sort((one, other) => rankOf(one.state) - rankOf(other.state))[0] ?? base;
  const refused = versions.find((ad) => ad.state === "DISAPPROVED" && ad.issue !== null);
  return {
    ...base,
    id: main,
    state: best.state,
    configured: versions.some((ad) => ad.configured === "ACTIVE") ? "ACTIVE" : base.configured,
    issue: best.state === "DISAPPROVED" ? (refused?.issue ?? base.issue) : base.issue,
  };
}

/** Meta's ads, each made here folded into the one ad the owner made, and a launch's own left out. */
export function foldAds(ads: readonly MetaAd[], fold: Fold): MetaAd[] {
  const kept: MetaAd[] = [];
  const groups = new Map<string, MetaAd[]>();
  for (const ad of ads) {
    const into = fold(ad);
    if (into === undefined) kept.push(ad);
    else if (into !== null) groups.set(into, [...(groups.get(into) ?? []), ad]);
  }
  return [...kept, ...[...groups].map(([main, versions]) => foldedAd(main, versions))];
}

/**
 * Meta's days, each of an ad made here added into its ad's, and a launch's own left out. Every other day is handed on
 * as Meta gave it. A version's day is counted once, the last Meta gave of it, before the versions are added together.
 */
export function foldDays(days: readonly MetaAdDay[], ads: readonly MetaAd[], fold: Fold): MetaAdDay[] {
  const names = new Map(ads.map((ad) => [ad.id, ad.name]));
  const kept: MetaAdDay[] = [];
  const versions = new Map<string, MetaAdDay>();
  for (const day of days) {
    const into = fold({ id: day.adId, name: names.get(day.adId) ?? "" });
    if (into === undefined) kept.push(day);
    else if (into !== null) versions.set(`${day.adId}|${day.day}`, { ...day, adId: into });
  }
  const plus = (one: number | null, other: number | null): number | null =>
    one === null && other === null ? null : (one ?? 0) + (other ?? 0);
  const summed = new Map<string, MetaAdDay>();
  for (const day of versions.values()) {
    const key = `${day.adId}|${day.day}`;
    const was = summed.get(key);
    summed.set(
      key,
      was
        ? {
            ...was,
            spendMinor: was.spendMinor + day.spendMinor,
            impressions: was.impressions + day.impressions,
            clicks: was.clicks + day.clicks,
            conversations: plus(was.conversations, day.conversations),
            leads: plus(was.leads, day.leads),
          }
        : day,
    );
  }
  return [...kept, ...summed.values()];
}
