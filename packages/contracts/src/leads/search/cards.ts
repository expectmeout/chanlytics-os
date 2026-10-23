/**
 * The card Claude reads (§0.3), and what a round on it asks for, costs and takes: the places per term (S6), the
 * estimate with room (§13.3), and the counts, the ceiling and the minutes the plan card's picker shows. The
 * numbers a round is sized with are caps.ts's.
 */
import type { LeadRoundPurpose } from "./sets";
import {
  LEAD_ASK_MAX_FACTOR,
  LEAD_ASK_MIN_FACTOR,
  LEAD_ASSUMED_YIELD,
  LEAD_ESTIMATE_MARGIN,
  LEAD_MAX_PLACES,
  LEAD_PROBE_PLACES,
} from "./caps";
import type { LeadSearchPlan } from "./plan";

/* ---------------------------------------------------------- the cards -- */

/** The half of a card Claude reads (§0.3, 23). The half code holds is A2's `CARDS`. */
export interface LeadCardBrief {
  id: "local_businesses" | "people_at_companies";
  /** What a lead of the card is (00430): a place a listing names, or a company with the people named on it. */
  finds: "places" | "people";
  goodFor: string[];
  notFor: string[];
  settings: string[];
  /** Bronze prices, 18 Sep 2026 (§10.1); a person found, for the people card (14 Oct 2026). */
  costPerPlaceUsd: number;
  contactsPerPlaceUsd: number;
  judgePerPlaceUsd: number;
  checkPerEmailUsd: number;
  startUsd: number;
  /** One search on the source tops out near this many places (§7 step 3). */
  maxPerTerm: number;
  /** How many places this card gets through in a minute, discovery, contacts, judging and checks together: the card's "About 8 minutes". */
  placesPerMinute: number;
  examples: string[];
  /**
   * Where its data comes from and what we may do with it, in a line the plan card shows: the source-rights note each
   * card is approved with (docs/plans/2026-09-18-lead-finder-source-rights.md holds the record, not a gate).
   */
  rights: string;
  approved: true;
  /**
   * The paid run that proved the provider reads the card's filters and its mapper the provider's fields, at the build the
   * card pins: what lets lead_platform.cards_on name it (00430 lead_card_live). Null until it has run; absent for the Maps
   * card, which was proved before this was asked.
   */
  calibrated?: { build: string; on: string; items: number; mapped: number } | null;
}

export const LEAD_CARDS: readonly LeadCardBrief[] = [
  {
    id: "local_businesses",
    finds: "places",
    goodFor: [
      "local businesses of a kind, in a city, a ZIP or around a point: the businesses that buy from you, or that your clients need next",
      "their listing facts: name, category, address, phone, website, rating and review count, open or closed",
      "emails and social profiles from the business's own website",
      "a mailbox check on the email found",
    ],
    notFor: [
      "people at home, or anyone who is not a business",
      "online sellers and shops with no local listing",
      "what a business stocks or sells inside (a listing does not show inventory: a seen standard on it cannot be met)",
      "businesses outside the US",
    ],
    settings: [
      "terms (up to five search phrases, widest first)",
      "area (a city, a ZIP, or a center and radius)",
      "count (1 to 1000)",
      "contact standard (phone, or email checked)",
    ],
    costPerPlaceUsd: 0.003,
    contactsPerPlaceUsd: 0.002,
    judgePerPlaceUsd: 0.0023,
    checkPerEmailUsd: 0.00089,
    startUsd: 0.00005,
    maxPerTerm: 120,
    // Measured over five real searches on 20 September 2026: 10 to 25 minutes for 50 with checks, five in flight.
    placesPerMinute: 8,
    examples: [
      "200 personal trainers in Austin, TX with a website, email checked, leaving out chain gyms",
      "50 independent pharmacies in ZIP 78704 that could stock an OTC product, a phone is enough",
      "100 family law firms within 15 km of downtown Denver, email checked, leaving out referral networks",
    ],
    rights: "Public Google Maps listings, and contacts from each business's own site; no reviewer's data, no photos.",
    approved: true,
  },
  {
    // The people card (the workbench's call 8, 00430), approved by Ruben on 13 Oct 2026 with its source-rights note.
    // lead_platform.cards_on (00430 lead_card_live) is switched on by hand once its calibration run has proved the
    // provider reads its filters and the mapper its fields (calibrated, below).
    id: "people_at_companies",
    finds: "people",
    goodFor: [
      "named people at companies, by what they are called (a title), their seniority, their company's industry and size, and the US state they work in",
      "a company's name, domain, industry, size and LinkedIn page, and each person's name, title and work email",
      "reaching the person who decides, by name, where a business's own inbox would not",
    ],
    notFor: [
      "local businesses by place, with their listing's rating, hours and reviews: the Maps card",
      "people at home, or anyone outside their work",
      "personal email addresses or phone numbers: work addresses only, each checked",
      "anyone outside the US",
    ],
    settings: [
      "titles (one to five, what the people are called)",
      "seniority (owners, founders, the C-suite, partners, VPs, heads, directors, managers, senior staff, entry level)",
      "industries (up to five, in the directory's own names: Marketing & Advertising, Accounting, Construction, Real Estate…)",
      "company sizes (employee ranges)",
      "states (up to ten; none is the whole US)",
      "count (1 to 500)",
    ],
    costPerPlaceUsd: 0.002,
    contactsPerPlaceUsd: 0,
    // Each company read against what was asked, as a place is (company-judge.ts; 22 Oct 2026): the places judge's price,
    // reserved for every person asked, since a company is at most one of them.
    judgePerPlaceUsd: 0.0023,
    checkPerEmailUsd: 0.00089,
    startUsd: 0.01,
    maxPerTerm: 500,
    // The provider's own measure: about a thousand people in ten minutes.
    placesPerMinute: 100,
    examples: [
      "100 marketing managers at marketing agencies of 11 to 50 people in Texas",
      "50 owners of accounting firms in Ohio and Michigan",
      "200 office managers at dental practices in California",
    ],
    rights:
      "From a B2B contact database built from public professional profiles and company sites; we never sign in anywhere to read them, keep a person's name, title, work address and profile link only, check each address before anything is sent, and never write again to anyone who says no.",
    approved: true,
    // Run once on 14 Oct 2026 (marketing managers at Marketing & Advertising companies of 11 - 50 in Texas, $0.17): 82
    // items, the first the provider's note to read its log; the mapper read 80 (the other a company in India, which the
    // card does not search), every filter held, and companiesOf made them 67 companies, each with someone to write to.
    calibrated: { build: "0.0.259", on: "2026-10-14", items: 82, mapped: 80 },
  },
];

const cardOf = (plan: LeadSearchPlan): LeadCardBrief => {
  const c = LEAD_CARDS.find((x) => x.id === plan.card);
  if (!c) throw new Error(`no card ${plan.card}`);
  return c;
};

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * What a round is likely to cost, from the card's prices, with room (§13.3):
 * discovery and contacts per place asked, the judge per place, the mailbox
 * check per place under an email standard, and one start per term. The route
 * computes it, the door stores it, the counters reserve it.
 */
export function estimateRoundUsd(plan: LeadSearchPlan, purpose: LeadRoundPurpose, placesToAsk: number): number {
  const c = cardOf(plan);
  const places = Math.max(0, Math.floor(placesToAsk));
  const perPlace =
    c.costPerPlaceUsd +
    c.contactsPerPlaceUsd +
    c.judgePerPlaceUsd +
    (plan.contact === "email" ? c.checkPerEmailUsd : 0);
  const starts = plan.terms.length * (purpose === "probe" ? 1 : 1);
  return round4((places * perPlace + starts * c.startUsd) * LEAD_ESTIMATE_MARGIN);
}

/** `total` spread over `n` terms, the remainder on the first ones. */
function spread(total: number, n: number, cap: number): number[] {
  const each = Math.min(cap, Math.floor(total / n));
  const rest = Math.min(total - each * n, n);
  return Array.from({ length: n }, (_, i) => Math.min(cap, each + (i < rest ? 1 : 0)));
}

/**
 * How many places to ask the source for (S6). The probe asks for 25 spread
 * across every term (E10). A later round asks for the remainder over the
 * yield so far (new Qualified places per place asked), clamped between 1.2x
 * and 4x the remainder, never past LEAD_MAX_PLACES or what one term can
 * return. `yieldSoFar` null means the probe. `remaining` at or under zero asks
 * for nothing at all; when the total is smaller than the number of terms, a
 * term asked for 0 got nothing to ask for, and a caller skips it.
 */
export function placesToAsk(
  plan: LeadSearchPlan,
  remaining: number,
  yieldSoFar: number | null,
): { total: number; perTerm: number[] } {
  const n = Math.max(1, plan.terms.length);
  const cap = cardOf(plan).maxPerTerm;
  if (remaining <= 0) return { total: 0, perTerm: Array(n).fill(0) };
  if (yieldSoFar === null) {
    const perTerm = spread(LEAD_PROBE_PLACES, n, cap);
    return { total: perTerm.reduce((a, b) => a + b, 0), perTerm };
  }
  const left = Math.max(1, Math.ceil(remaining));
  const wanted = yieldSoFar > 0 ? left / yieldSoFar : Number.POSITIVE_INFINITY;
  const clamped = Math.min(Math.max(wanted, left * LEAD_ASK_MIN_FACTOR), left * LEAD_ASK_MAX_FACTOR);
  const total = Math.min(LEAD_MAX_PLACES, cap * n, Math.ceil(clamped));
  const perTerm = spread(total, n, cap);
  return { total: perTerm.reduce((a, b) => a + b, 0), perTerm };
}

/** The counts the card's picker offers, unless the owner asked for a number of their own (§8.3). */
export const LEAD_COUNT_CHOICES = [50, 100, 200, 500] as const;

/**
 * About how long a round takes, in minutes, for the card's "About 8 minutes --
 * leave the page if you like" and for the minutes beside each count in the
 * picker. From the places the round would ask for at the yield assumed before
 * a probe has measured one, the probe's own 25, and the card's rate. Never
 * under two minutes: a search that answers faster still reads as a moment.
 */
/** The most one area's terms can yield at the assumed rate: terms × the card's per-term cap × the yield. Above it the picker says so. */
export function planCeiling(plan: LeadSearchPlan): number {
  return Math.floor(plan.terms.length * cardOf(plan).maxPerTerm * LEAD_ASSUMED_YIELD);
}

export function planMinutes(plan: LeadSearchPlan): number {
  const places = LEAD_PROBE_PLACES + placesToAsk(plan, plan.count, LEAD_ASSUMED_YIELD).total;
  return Math.max(2, Math.round(places / cardOf(plan).placesPerMinute));
}
