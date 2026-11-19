/**
 * What a read of an owner's ad account keeps, worked out from what Meta said (decision 0049, call 10 and the plan's G3
 * and C1): each ad as its row, with what a tap on it opens and the budget it sits under; each of Meta's days as its
 * row; and the read's own pace: how deep it looks, which days it asks for, and when the account is read next.
 *
 * Pure: Meta's answers and the clock are handed in, and nothing here asks anyone anything. The wire's own shapes are
 * channels' (meta-read.ts); the rows are the door's (db reads.ts).
 */
import { DAY_MS, HOUR_MS, MIN_MS, wallClockAt, zoneDayKey } from "@chanlytics/contracts";
import type { MetaAd, MetaAdDay } from "@chanlytics/channels/ads";
import type { AdDayReadRow, AdReadRow } from "@chanlytics/db/ads";

/** The read's pace (the plan's 6.6): every number of it, in one place. */
export const ADS_PACE = {
  /** While an ad is being checked by Meta or is in its first two days. */
  quickMs: 15 * MIN_MS,
  /** Every connected account. */
  hourlyMs: HOUR_MS,
  /** How long an ad is new: its numbers move fastest, and its owner looks most. */
  newAdMs: 2 * DAY_MS,
  /** The days an hourly read asks for: today and the two before it, which Meta is still counting. */
  recentDays: 3,
  /** The days the daily look back asks for; a day before them has stopped moving. */
  settleDays: 14,
  /** The days an account's first read asks for: an ad that ran in them is adopted (the plan's G3). */
  firstDays: 30,
  /** The hour, in the account's own zone, the daily look back falls due. */
  settleHour: 4,
  /** The most ads of one account that are read: five pages of Meta's list. */
  maxAds: 500,
  /** The most pages of days one read asks for: three thousand ad-days. */
  maxDayPages: 6,
} as const;

/** How deep a read looks: an account's first, the daily look back, or the days Meta is still counting. */
export type ReadDepth = "first" | "settle" | "recent";

/** An account's first read has never set its look back; after that the look back is due once a day. */
export function depthOf(account: { settle_at: string | null }, nowMs: number): ReadDepth {
  if (account.settle_at === null) return "first";
  return Date.parse(account.settle_at) <= nowMs ? "settle" : "recent";
}

/** The day `days` before the one `nowMs` falls on in a zone, as YYYY-MM-DD. Counted from noon, so no clock change moves it. */
function dayBefore(nowMs: number, timezone: string, days: number): string {
  const noon = wallClockAt(timezone, zoneDayKey(nowMs, timezone), 12, 0);
  return zoneDayKey(noon - days * DAY_MS, timezone);
}

/** The days a read asks Meta for, both in the account's own zone: from `since` to today. */
export function rangeOf(depth: ReadDepth, timezone: string, nowMs: number): { since: string; until: string } {
  const days = depth === "first" ? ADS_PACE.firstDays : depth === "settle" ? ADS_PACE.settleDays : ADS_PACE.recentDays;
  return { since: dayBefore(nowMs, timezone, days - 1), until: zoneDayKey(nowMs, timezone) };
}

/** The day before which an account's days are settled, once the look back has read the ones after it. */
export const settledBeforeOf = (timezone: string, nowMs: number): string =>
  dayBefore(nowMs, timezone, ADS_PACE.settleDays - 1);

/** The next time the daily look back falls due: four in the morning in the account's zone, after now. */
export function nextSettleOf(timezone: string, nowMs: number): string {
  const today = wallClockAt(timezone, zoneDayKey(nowMs, timezone), ADS_PACE.settleHour, 0);
  const next =
    today > nowMs ? today : wallClockAt(timezone, zoneDayKey(nowMs + DAY_MS, timezone), ADS_PACE.settleHour, 0);
  return new Date(next).toISOString();
}

/** Meta's words for an ad it is still deciding about: its owner is waiting to hear. */
const DECIDING: readonly string[] = ["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"];

/** When an account is read next: on the quick pace while one of its ads is being checked or is new, else in an hour. */
export function nextReadOf(ads: readonly Pick<MetaAd, "state" | "createdAt">[], nowMs: number): string {
  const quick = ads.some(
    (ad) =>
      DECIDING.includes(ad.state) ||
      (ad.state === "ACTIVE" && ad.createdAt !== null && nowMs - Date.parse(ad.createdAt) < ADS_PACE.newAdMs),
  );
  return new Date(nowMs + (quick ? ADS_PACE.quickMs : ADS_PACE.hourlyMs)).toISOString();
}

/**
 * What a tap on an ad opens, from what its ad set says (`destination_type`). Where it can open one of several chats,
 * the one Chanlytics counts people for comes first: WhatsApp, then Instagram. A word not known here is `other`.
 */
export function doorOf(destination: string | null): AdReadRow["door"] {
  const word = (destination ?? "").toUpperCase();
  if (word.includes("WHATSAPP")) return "whatsapp";
  if (word.includes("INSTAGRAM")) return "instagram";
  if (word.includes("MESSENGER") || word === "MESSAGING") return "messenger";
  if (word === "PHONE_CALL") return "call";
  if (word === "ON_AD" || word.includes("LEAD")) return "form";
  if (word === "WEBSITE") return "website";
  return "other";
}

/** What the owner has the ad set to at Meta, in Chanlytics' three words. A word not known is read as paused, never on. */
export function intentOf(configured: MetaAd["configured"]): AdReadRow["intent"] {
  if (configured === "ACTIVE") return "on";
  return configured === "ARCHIVED" || configured === "DELETED" ? "ended" : "paused";
}

const GONE: readonly string[] = ["ARCHIVED", "DELETED"];

/**
 * Each ad as the door keeps it. A budget is shared where another ad that is not gone sits under the same ad set or
 * campaign that holds it: what is left of it is then not this ad's alone (the plan's C1).
 */
export function adRowsOf(ads: readonly MetaAd[]): AdReadRow[] {
  const under = new Map<string, number>();
  for (const ad of ads)
    if (ad.budget && !GONE.includes(ad.state)) under.set(ad.budget.holderId, (under.get(ad.budget.holderId) ?? 0) + 1);
  return ads.map((ad) => ({
    platform_ad_id: ad.id,
    name: ad.name,
    door: doorOf(ad.destination),
    platform_set_id: ad.setId,
    platform_campaign_id: ad.campaignId,
    budget_kind: ad.budget?.kind ?? null,
    budget_minor: ad.budget?.minor ?? null,
    budget_left_minor: ad.budget?.leftMinor ?? null,
    budget_at: ad.budget?.at ?? null,
    budget_shared: ad.budget ? (under.get(ad.budget.holderId) ?? 0) > 1 : null,
    starts_at: ad.startsAt,
    ends_at: ad.endsAt,
    platform_state: ad.state,
    platform_issue: ad.issue,
    intent: intentOf(ad.configured),
    said: Object.keys(ad.said).length > 0 ? { ...ad.said } : null,
  }));
}

/**
 * Each of Meta's days as the door keeps it. Meta's own count of what an ad asks for is the chats it started for an ad
 * that opens a chat, the forms sent for one that opens a form, and nothing for any other: theirs, labelled as theirs.
 */
export function dayRowsOf(days: readonly MetaAdDay[], doors: ReadonlyMap<string, AdReadRow["door"]>): AdDayReadRow[] {
  return days.map((day) => {
    const door = doors.get(day.adId);
    const chats = door === "whatsapp" || door === "instagram" || door === "messenger";
    return {
      platform_ad_id: day.adId,
      day: day.day,
      spend_minor: day.spendMinor,
      impressions: day.impressions,
      clicks: day.clicks,
      platform_results: chats ? day.conversations : door === "form" ? day.leads : null,
    };
  });
}
