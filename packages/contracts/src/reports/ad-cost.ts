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
import { REPORT_MIN_N } from "./tiles";

/** How many days back a platform's day is still settling: its counts keep moving until it is older than this. */
export const AD_SETTLE_DAYS = 14;

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
