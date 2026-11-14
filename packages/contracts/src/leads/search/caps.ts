/**
 * The lead finder's numbers: the leads and the spend a workspace has in a month and a day, and the platform in a
 * day; the sizes of a probe, a judge's batch and a search; the judge's limits; the yield, the margin and the
 * factors a round is sized and priced with; when the question after the probe is asked and how long it waits;
 * and the month a lead counts in.
 */
import { dayInZone } from "../../shared/zone/math";

/* -------------------------------------------------- the caps (§13.3, §16) -- */

/** §16.7, 18: Qualified leads a month, by the workspace's calendar month. */
export const LEAD_MONTHLY_ALLOWANCE = 500;
/**
 * The leads a free trial includes (decision 0090, Ruben, 3 Nov 2026: lead generation is kept apart past what the trial
 * includes), counted as the month's are, while the workspace's billing says trialing. SQL's lead_cap('trial_leads').
 */
export const LEAD_TRIAL_ALLOWANCE = 50;

/** The leads a workspace may count this month: the trial's while it is on a trial, else the month's. */
export function leadAllowanceFor(billingStatus: string | null | undefined): number {
  return billingStatus === "trialing" ? LEAD_TRIAL_ALLOWANCE : LEAD_MONTHLY_ALLOWANCE;
}
/**
 * §16.32: what searching may cost a workspace a month: scraping, judging, checks, retries. Each cap is a count it must
 * carry at a dear niche's 8¢ a checked-email lead (decision 0133, 00626; Ruben's D1, 14 Nov 2026): the month's 500 leads
 * and a search of 300 in a day. The platform's day, every workspace's together, rises less (an outside review of the
 * plan, taken 14 Nov): $150 until real searches measure what a lead costs, with a page at 80% of it
 * (apps/edge/lib/leads/sources.ts recordPagePlatformDay).
 */
export const LEAD_MONTHLY_BUDGET_USD = 40;
export const LEAD_DAY_CAP_USD = 25;
export const LEAD_PLATFORM_DAY_CAP_USD = 150;
/** §16.5: under this share of Qualified among the first places, the round stops and asks. */
export const LEAD_QUESTION_THRESHOLD = 0.6;
/** Below this many judged places the question is not asked: too little to go on. */
export const LEAD_QUESTION_MIN_EVIDENCE = 10;
export const LEAD_PROBE_PLACES = 25;
export const LEAD_JUDGE_BATCH = 25;
export const LEAD_MAX_PLACES = 1000;
/**
 * What one term may be asked for in a city: the source splits a city into map pages by itself, where a ZIP's or a
 * circle's one map view stops near the card's 120 (decision 0133: "med spa" in Brooklyn read 243 places in one run of
 * 4 min 55 s, 14 Nov 2026). A term that comes back under its ask has read the whole city.
 */
export const LEAD_DEEP_PER_TERM = 600;

/* ---------------------------------------------------------- the reach -- */

/** A mile, in metres, as a search's reach is said (decision 0133). */
export const LEAD_REACH_MILE_M = 1_609;
/**
 * How far a search looks past its area when the owner has not said (decision 0133, Ruben's D2, 14 Nov 2026): 25 miles
 * from a city's centre, 15 from a ZIP's; a circle looks out to twice its radius.
 */
export const LEAD_REACH_DEFAULT_MILES = { city: 25, zip: 15 } as const;
/** The farthest an owner may ask a search to look: 50 miles. */
export const LEAD_REACH_MAX_M = 50 * LEAD_REACH_MILE_M;

/** Every fact a place gives the judge is cut to this many characters (§7.1). */
export const LEAD_FACT_MAX = 120;
/** What a place's own website says is cut to this, where a plan reads sites: its booking link, title, description and first words. */
export const LEAD_SITE_FACT_MAX = 2_000;
/**
 * What reading one business's home page costs: one credit with the page's reader, whatever it answers, at the dearest
 * we would pay on the plan we are on (Firecrawl's Hobby: 5,000 a month for $19, then $5 for 1,000 more). What a card
 * reserves for a search that reads sites, and what every read of a search is settled at (00541 lead_site_reads_spent).
 */
export const LEAD_SITE_READ_USD = 0.005;
/**
 * How long the business line the ideas are written from may be (00473): a few sentences, what the business sells and who
 * buys it. It was one sentence of 160, which said too little for the ideas to be written from (Ruben, 22 Oct 2026).
 */
export const BUSINESS_LINE_MAX = 400;
/** The judge's one reason, in words (§0.1). */
export const LEAD_REASON_MAX_WORDS = 12;
/** The yield assumed before a probe has measured one: half the places asked for qualify. The card's minutes and the route's estimate both read it. */
export const LEAD_ASSUMED_YIELD = 0.5;
/** A round's estimate is reserved with this much room (§13.3: the cap is the estimate with room). */
export const LEAD_ESTIMATE_MARGIN = 1.3;
/** The main round asks for the remainder over the probe's yield, clamped here (S6). */
export const LEAD_ASK_MIN_FACTOR = 1.2;
export const LEAD_ASK_MAX_FACTOR = 4;

/* ---------------------------------------------------------- the month -- */

/** 'YYYY-MM' in the workspace's zone: the month a lead counts in (§0.2, 15). lead_month() in 00140 says the same. */
export function leadMonth(zone: string, at: Date): string {
  const d = dayInZone(zone, at.getTime());
  return `${d.y}-${String(d.m).padStart(2, "0")}`;
}

/** What a US ZIP looks like, as a search around one is asked for. */
export const US_ZIP = /^\d{5}$/;
