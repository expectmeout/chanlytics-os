/**
 * What a launch holds itself to (decision 0050, calls 3, 4 and 6; the Ads plan's 4.7): what the owner approved, read
 * from the ad's row; the moment an approved last day ends in the account's own zone; and what Meta holds, read back
 * whole, set against what was approved before anything is switched on. A difference stops the launch.
 *
 * Pure: the row, Meta's read back and the zone are handed in.
 */
import { adMostOf, localToUtcMs, recordOrEmpty } from "@chanlytics/contracts";
import { metaAreaSent, type MetaCampaignHeld, type MetaPlaceKind } from "@chanlytics/channels/ads";

/** What the owner approved at Turn on, as ads.approved keeps it (the edge's turn-on door wrote it). */
export interface LaunchApproved {
  name: string;
  service: string;
  picture: string;
  pictureKind: "photo" | "video";
  miles: number;
  /** A place wider than the circle, by Meta's key: shown across it in the circle's stead. Null for the circle. */
  area: { kind: MetaPlaceKind; key: string } | null;
  totalMinor: number;
  mostMinor: number;
  endDay: string;
  endsAt: string;
  versions: { text: string; headline: string }[];
  /** The circle's centre; empty where a wider place is approved. */
  address: string;
  whatsapp: string;
  pageId: string;
  currency: string;
}

const textAt = (row: Record<string, unknown>, key: string): string => {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
};
const countAt = (row: Record<string, unknown>, key: string): number => {
  const value = row[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
};

const PLACE_KINDS: readonly MetaPlaceKind[] = ["city", "region", "country"];

/** The wider place approved, by its kind and Meta's key; null for the circle, or anything else. */
function areaAt(row: Record<string, unknown>): LaunchApproved["area"] {
  const area = recordOrEmpty(row.area);
  const kind = PLACE_KINDS.find((one) => one === area.kind);
  const key = textAt(area, "key");
  return kind && key ? { kind, key } : null;
}

/** What was approved, read; null where the row holds anything less than a whole approval, which is never sent. */
export function approvedOf(json: unknown): LaunchApproved | null {
  const row = recordOrEmpty(json);
  const versions = (Array.isArray(row.versions) ? row.versions : []).map((one) => {
    const version = recordOrEmpty(one);
    return { text: textAt(version, "text"), headline: textAt(version, "headline") };
  });
  const approved: LaunchApproved = {
    name: textAt(row, "name"),
    service: textAt(row, "service"),
    picture: textAt(row, "picture"),
    pictureKind: row.picture_kind === "video" ? "video" : "photo",
    miles: countAt(row, "miles"),
    area: areaAt(row),
    totalMinor: countAt(row, "total_minor"),
    mostMinor: countAt(row, "most_minor"),
    endDay: textAt(row, "end_day"),
    endsAt: textAt(row, "ends_at"),
    versions,
    address: textAt(row, "address"),
    whatsapp: textAt(row, "whatsapp"),
    pageId: textAt(row, "page_id"),
    currency: textAt(row, "currency"),
  };
  const whole =
    approved.name !== "" &&
    approved.picture !== "" &&
    approved.miles > 0 &&
    approved.totalMinor > 0 &&
    // The most the press named is the total Meta will hold: one place works it out (contracts adMostOf).
    approved.mostMinor === adMostOf({ total_minor: approved.totalMinor }) &&
    approved.endsAt !== "" &&
    versions.length >= 1 &&
    versions.length <= 3 &&
    versions.every((version) => version.text !== "" && version.headline !== "") &&
    // A circle needs its centre; a wider place is named by itself.
    (approved.area !== null || approved.address !== "") &&
    approved.whatsapp !== "" &&
    approved.pageId !== "" &&
    approved.currency !== "";
  return whole ? approved : null;
}

/** The moment a day ends in the account's own zone: a minute before its midnight, which Meta takes as the end. */
export function endOfDayIn(timezone: string, day: string): string {
  const [year = 0, month = 0, date = 0] = day.split("-").map(Number);
  return new Date(localToUtcMs(timezone, year, month, date, 23, 59)).toISOString();
}

/** Where an ad made here shows, as its ad set names it: Facebook's feed, stories and Reels (meta-make.ts). */
export const LAUNCH_PLACES = ["facebook:facebook_reels", "facebook:feed", "facebook:story"];

/** How a launch's read back is judged: before its switches, every part paused; after, every part on. */
export type LaunchMoment = "made" | "switched";

/**
 * What Meta holds that is not what was approved, each by a short name; empty where they agree (decision 0050, call 4:
 * the total and its end, the paused state, the declaration; and the rest of what was sent). The ads are matched to the
 * versions of the words by the order they were made.
 */
export function launchDiffers(
  approved: LaunchApproved,
  held: MetaCampaignHeld,
  at: { moment: LaunchMoment; adIds: readonly string[] },
): string[] {
  const out: string[] = [];
  const differ = (name: string, same: boolean) => {
    if (!same) out.push(name);
  };
  const paused = at.moment === "made";
  differ("campaign_switch", held.paused === paused);
  differ("declared", held.declared.length === 0);
  differ("objective", held.objective === "OUTCOME_ENGAGEMENT");
  const [set] = held.sets;
  differ("one_ad_set", held.sets.length === 1);
  differ("set_switch", set?.paused === paused);
  differ("opens", set?.opens === "WHATSAPP");
  differ("total", set?.totalMinor === approved.mostMinor && set.dailyMinor === null);
  differ("end", set?.endsAt === approved.endsAt);
  differ("number", set?.whatsappNumber === approved.whatsapp.replace(/\D/g, ""));
  differ("adults", set?.youngest === 18);
  // Where it shows, as one word for what was sent and what Meta holds: the wider place, or the circle's miles.
  const area = metaAreaSent({ wide: approved.area, miles: approved.miles });
  differ("area", area !== null && set?.area === area);
  differ("places", JSON.stringify(set?.places ?? []) === JSON.stringify(LAUNCH_PLACES));
  differ("ads", held.ads.length === approved.versions.length);
  approved.versions.forEach((version, nth) => {
    const ad = held.ads.find((one) => one.id === at.adIds[nth]);
    const n = nth + 1;
    differ(`ad_${n}`, ad !== undefined);
    differ(`ad_${n}_switch`, ad?.paused === paused);
    differ(`ad_${n}_button`, ad?.whatsapp === true);
    differ(`ad_${n}_own_changes`, ad !== undefined && ad.ownChanges.length === 0);
    differ(`ad_${n}_beside_others`, ad?.besideOthers === false);
    differ(`ad_${n}_words`, ad?.text === version.text && ad.headline === version.headline);
  });
  return out;
}
