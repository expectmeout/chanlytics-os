/**
 * The cost for each person who booked, as one rule (decision 0049, call 7): the spend of the ads whose people Chanlytics
 * can count, over the people who booked from them. Under REPORT_MIN_N booked it is not said: a page draws a dash that
 * says "only N", and an ad under it is never ranked against another. While a day that is still settling is in the figure
 * the cost is said "so far": Meta's counts keep moving for days, and Google files a call under the day of its click.
 *
 * Which ads' spend and people go in (a "Call you" ad's stay out, call 8) and whether they share a currency (call 9) are
 * the caller's: the rule divides what it is given, and never converts.
 *
 * It lives with Reports, whose minimum it keeps, and not with the other rules of an ad (contracts ads/): Reports leans
 * on Ads, never the other way (decision 0110).
 */
import { addDays } from "../ads/ads";
import type { AdWorthSum } from "../ads/live";
import { REPORT_MIN_N } from "./tiles";

/** How many days back a platform's day is still settling: its counts keep moving until it is older than this. */
export const AD_SETTLE_DAYS = 14;

/** The days the Ads page and Reports › Ads count, and the days Meta's chats are set beside Chanlytics' over. */
export const AD_PAGE_DAYS = 30;

/** Whether a platform's day is still settling at `today` (both ISO days): it is no more than AD_SETTLE_DAYS back. */
export const adDaySettling = (day: string, today: string): boolean => day >= addDays(today, -AD_SETTLE_DAYS);

/** What the rule says of a figure. */
export interface AdCost {
  /** The cost for each person who booked, in the currency's minor units, not rounded; null under REPORT_MIN_N booked. */
  eachMinor: number | null;
  /** Whether the cost is said "so far": it is said at all, and a day still settling is in it. */
  soFar: boolean;
}

/**
 * The cost for each person who booked of one figure: its spend, the people who booked from it, and the days it holds.
 * A figure with no cost is never "so far": a dash says only how few booked.
 */
export function adCostRule(figure: {
  spentMinor: number;
  booked: number;
  days: readonly string[];
  today: string;
}): AdCost {
  const eachMinor = figure.booked >= REPORT_MIN_N ? figure.spentMinor / figure.booked : null;
  return { eachMinor, soFar: eachMinor !== null && figure.days.some((day) => adDaySettling(day, figure.today)) };
}

/** What the rule says of the bookings a figure holds. */
export interface AdWorth {
  /** A sum a currency, by its code; none where no visit has an amount; null under REPORT_MIN_N booked: a dash. */
  sums: AdWorthSum[] | null;
  /** Whether it is said "so far": a sum is said, and a day still settling is in the figure. */
  soFar: boolean;
}

/**
 * What the bookings of one figure are worth, as one rule (the Ads tracking plan's T6 and its call 5), beside what the
 * figure cost: the worth of the visits its people booked, each its service's amount on the day it was booked (00683
 * appointments.worth_minor), under the cost's own floor and its own "so far". Money is never converted (decision 0049,
 * call 9): amounts add within one currency, and two currencies are two sums. Which visits go in, and how many were left
 * out for a service with no amount, are the read's (ads_page_counts): the rule adds what it is given.
 */
export function adWorthRule(figure: {
  booked: number;
  sums: readonly AdWorthSum[];
  days: readonly string[];
  today: string;
}): AdWorth {
  if (figure.booked < REPORT_MIN_N) return { sums: null, soFar: false };
  const byCurrency = new Map<string, number>();
  for (const sum of figure.sums) {
    const code = sum.currency.toUpperCase();
    byCurrency.set(code, (byCurrency.get(code) ?? 0) + sum.minor);
  }
  const sums = [...byCurrency]
    .map(([currency, minor]) => ({ currency, minor }))
    .sort((one, other) => one.currency.localeCompare(other.currency));
  return { sums, soFar: sums.length > 0 && figure.days.some((day) => adDaySettling(day, figure.today)) };
}

/** Meta's count is said beside Chanlytics' once Meta has counted this many chats (the tracking plan's call 1). */
const AD_CHATS_SAID_FROM = 10;
/** The two have parted when Chanlytics kept fewer than this share of Meta's (call 1). */
const AD_CHATS_KEPT_SHARE = 0.5;

/**
 * Meta's count of the chats an ad started beside the messages from it that reached Chanlytics, as one rule (the Ads
 * tracking plan's T2 and its call 1), over the days Meta has settled (the read's, 00678 ad_chats_kept): said once Meta
 * has counted AD_CHATS_SAID_FROM, and parted when Chanlytics kept fewer than half. Meta counts a chat written within
 * seven days of a tap and Chanlytics a message when it arrives with the ad on it, so the two are never equal: the rule
 * asks for half, not all. The drawer says it, and each read of an account at Meta tells Health of an ad that parted.
 */
export function adChatsKeptRule(figure: { meta: number; kept: number }): { said: boolean; parted: boolean } {
  const enough = figure.meta >= AD_CHATS_SAID_FROM;
  return { said: enough, parted: enough && figure.kept < figure.meta * AD_CHATS_KEPT_SHARE };
}
