/**
 * The Ads page with nothing connected, v0 (page-only): how new people first reached the business, from People's own read of
 * the window, and which ads the ones an ad brought came through. The same counts, in the same words, as Reports › People
 * says them, so the page and the report cannot differ. Apart from page-parts.ts only for the file limit. Pure, like the
 * rest of the models.
 */
import { addDays, joinWords } from "@chanlytics/contracts";
// How new people first came is the people report's, read through its page entry as the Reports pages read it.
import { firstCameEntries, firstCameRecorded } from "@chanlytics/contracts/report-lens";
import type { AdPlatform, AdsRead, PeopleSeriesDto } from "@chanlytics/contracts";

import { PLATFORMS, sum } from "./vm-base";
import type { DoorVM } from "./vm-base";
import { ADS_DOORS, PLATFORM_OWNER, PLATFORM_WORD } from "./words";
import { STANDING, V0 } from "./words-page";

export interface V0VM {
  /** The lead line (bold part, rest); null where there is nothing to say yet. */
  lead: { strong: string; rest: string } | null;
  muted: string | null;
  /** The empty workspace's two lines, instead of the lead. */
  empty: { lead: string; line: string } | null;
  /** Which ads the people of the lead came through, in one sentence under it; null where nothing says. */
  ads: string | null;
  /** BarList rows; `own` is the one in ink, the rest in one quiet hue. */
  rows: NonNullable<AdsRead["firstTouch"]>["rows"];
  /** Said in their place where the counts were read and there is nobody; null while they are not read. */
  nobodyNew: string | null;
  notes: string[];
  door: DoorVM;
  platforms: { id: AdPlatform; name: string; line: string; word: string }[];
  next: string;
}

/**
 * How new people first reached the business, from People's own read of the window: the same counts, in the same words, as Reports ›
 * People says them, so the page and the report cannot differ. The way in that is an ad is `ad` there too, and the
 * report says how many of those each ad brought (`by_ad`, 00646), which add up to it.
 */
export function firstTouchOf(
  series: Pick<PeopleSeriesDto, "first_came" | "today" | "end" | "days">,
): AdsRead["firstTouch"] {
  return {
    since: addDays(series.end ?? series.today, 1 - series.days),
    rows: firstCameEntries(series.first_came.by_via).map(([id, label, n]) => ({
      label,
      n,
      own: id === "ad",
      recorded: firstCameRecorded(id),
    })),
    ads: firstAdsOf(series.first_came.by_ad),
  };
}

/** The report's people by ad, as the page takes them: a platform it knows or none, a name or none, the most first. */
function firstAdsOf(byAd: PeopleSeriesDto["first_came"]["by_ad"]): NonNullable<AdsRead["firstTouch"]>["ads"] {
  return (byAd ?? [])
    .filter((row) => Number.isFinite(row.n) && row.n > 0)
    .map((row) => ({
      platform: PLATFORMS.find((p) => p === row.platform) ?? null,
      name: row.name?.trim() || null,
      n: row.n,
    }))
    .sort((one, other) => other.n - one.n);
}

/** How many ads the sentence names before it says the rest together. */
const ADS_NAMED_MAX = 3;

/**
 * Which ads the people of the lead came through, each by its name or, where Chanlytics cannot name it, by whose account
 * it runs in. Said only where the report's rows add up to the lead's own count: a page never names a number it cannot
 * account for.
 */
function adsSaid(ads: NonNullable<AdsRead["firstTouch"]>["ads"], own: number): string | null {
  if (ads.length === 0 || sum(ads.map((ad) => ad.n)) !== own) return null;
  const named = ads
    .slice(0, ADS_NAMED_MAX)
    .map((ad) => V0.fromAd(ad.n, ad.name ?? V0.unnamedAd(ad.platform ? PLATFORM_OWNER[ad.platform] : null)));
  const rest = ads.slice(ADS_NAMED_MAX);
  const parts = rest.length > 0 ? [...named, V0.otherAds(sum(rest.map((ad) => ad.n)), rest.length)] : named;
  return V0.byAd(joinWords(parts));
}

export function v0Of(read: AdsRead): V0VM {
  const rows = read.firstTouch ? read.firstTouch.rows : [];
  const unrecorded = sum(rows.filter((r) => !r.recorded).map((r) => r.n));
  const recorded = sum(rows.filter((r) => r.recorded).map((r) => r.n));
  const own = sum(rows.filter((r) => r.own).map((r) => r.n));
  const nobody = own === 0;
  return {
    lead: nobody ? null : V0.lead(own, recorded),
    ads: nobody || !read.firstTouch ? null : adsSaid(read.firstTouch.ads, own),
    muted: unrecorded > 0 && !nobody ? V0.more(unrecorded) : null,
    empty: nobody ? { lead: V0.emptyLead, line: V0.emptyLine } : null,
    // How they came is worth saying whether or not an ad brought any of them.
    rows,
    nobodyNew: read.firstTouch !== null && rows.length === 0 ? V0.nobodyNew : null,
    notes: nobody ? V0.emptyNotes : V0.notes,
    door: { words: rows.length > 0 ? V0.door : V0.doorNobody, to: ADS_DOORS.people },
    platforms: PLATFORMS.map((id) => ({
      id,
      name: PLATFORM_WORD[id],
      line: V0.platforms[id],
      word: STANDING.off,
    })),
    next: V0.next,
  };
}
