/**
 * The lead finder's numbers: the leads and the spend a workspace has in a month and a day, and the platform in a
 * day; the sizes of a probe, a judge's batch and a search; the judge's limits; the yield, the margin and the
 * factors a round is sized and priced with; when the question after the probe is asked and how long it waits;
 * and the month a lead counts in.
 */
import { dayInZone } from "../../calendar/availability";
import { HOUR_MS } from "../../shared/time";

/* -------------------------------------------------- the caps (§13.3, §16) -- */

/** §16.7, 18: Qualified leads a month, by the workspace's calendar month. */
export const LEAD_MONTHLY_ALLOWANCE = 500;
/** §16.32: what searching may cost a workspace a month: scraping, judging, checks, retries. */
export const LEAD_MONTHLY_BUDGET_USD = 25;
export const LEAD_DAY_CAP_USD = 10;
export const LEAD_PLATFORM_DAY_CAP_USD = 50;
/** §16.5: under this share of Qualified among the first places, the round stops and asks. */
export const LEAD_QUESTION_THRESHOLD = 0.6;
/** Below this many judged places the question is not asked: too little to go on. */
export const LEAD_QUESTION_MIN_EVIDENCE = 10;
export const LEAD_PROBE_PLACES = 25;
export const LEAD_JUDGE_BATCH = 25;
export const LEAD_MAX_PLACES = 1000;
/** Every fact a place gives the judge is cut to this many characters (§7.1). */
export const LEAD_FACT_MAX = 120;
/** The judge's one reason, in words (§0.1). */
export const LEAD_REASON_MAX_WORDS = 12;
/** The yield assumed before a probe has measured one: half the places asked for qualify. The card's minutes and the route's estimate both read it. */
export const LEAD_ASSUMED_YIELD = 0.5;
/** A round's estimate is reserved with this much room (§13.3: the cap is the estimate with room). */
export const LEAD_ESTIMATE_MARGIN = 1.3;
/** The main round asks for the remainder over the probe's yield, clamped here (S6). */
export const LEAD_ASK_MIN_FACTOR = 1.2;
export const LEAD_ASK_MAX_FACTOR = 4;
/** An unanswered question ends the round after this long (§0.5). */
export const LEAD_QUESTION_WAIT_MS = 24 * HOUR_MS;

/* ---------------------------------------------------------- the month -- */

/** 'YYYY-MM' in the workspace's zone: the month a lead counts in (§0.2, 15). lead_month() in 00140 says the same. */
export function leadMonth(zone: string, at: Date): string {
  const d = dayInZone(zone, at.getTime());
  return `${d.y}-${String(d.m).padStart(2, "0")}`;
}
