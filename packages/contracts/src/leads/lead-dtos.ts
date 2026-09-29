/**
 * What the Leads routes answer: the check, the row, a search and its rounds, the counts and the month. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import type { LeadArea, LeadSearchPlan } from "./search/plan";
import type { LeadEmailState, LeadRoundEnding } from "./search/sets";
import type { LeadClass, LeadStage } from "./lead-words";

/* ------------------------------------------------- what the doors answer -- */

export interface LeadCheck {
  /**
   * A seen check's key (LEAD_CHECK_KEYS), or the key the judge answered a read one under: the engine's `kind`, or the
   * search plan's own criterion or exclusion key ("open_weekends"). The judge keys its answers by the plan's names, so
   * a read check carries whatever key the plan gave it (Reach out Part 4, PR 9); `leadCheckWord` says it in words.
   */
  key: LeadCheckKey | (string & {});
  how: "seen" | "read";
  answer: "yes" | "no" | "unknown";
  source: string;
  reason: string | null;
}

/** The seven checks §0.1 and the interface name, four seen and three read; §9.2's "six" is the PRD's count of one screen. */
export const LEAD_CHECK_KEYS = [
  "on_maps",
  "in_area",
  "phone_two_sources",
  "mailbox",
  "independent",
  "right_kind",
  "own_address",
] as const;

export type LeadCheckKey = (typeof LEAD_CHECK_KEYS)[number];

export interface LeadRowDto {
  id: string;
  search_id: string;
  place_id: string;
  business_name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  street: string | null;
  /** `leads_page` answers it beside the city; the area cell reads "78704 · Austin, TX" from the pair. */
  postal_code?: string | null;
  /** Not the door's: `leads_page` returns the search's id, and 4.4 fills the name from the same read that loads the searches. */
  search_name?: string | null;
  phone: string | null;
  phone_agrees: boolean;
  phone_wrong: boolean;
  email: string | null;
  email_state: LeadEmailState;
  email_checked_at: string | null;
  website: string | null;
  instagram: string | null;
  rating: number | null;
  reviews: number | null;
  /** What the listing shows about the business (D2, 00144). Optional: a fixture from before carries none, and the view models read them as absent. */
  about?: string | null;
  hours?: { day: string; hours: string }[];
  image_url?: string | null;
  price?: string | null;
  reviews_dist?: { one: number; two: number; three: number; four: number; five: number } | null;
  facebook_url?: string | null;
  linkedin_url?: string | null;
  tiktok_url?: string | null;
  claimed?: boolean | null;
  maps_url?: string | null;
  rank?: number | null;
  /** D5 (00146): the neighbourhood the listing names, and the coordinates leads_page returns, for the row's line about where and the map. */
  neighborhood?: string | null;
  lat?: number | null;
  lng?: number | null;
  /**
   * D6 (00161): the business's own mark, as the copy we keep -- `leadMarkSrc` over the lead's `mark_path`. Never the
   * address on its own site, which the dashboard's content policy blocks.
   */
  mark_url?: string | null;
  stage: LeadStage;
  closed_reason: string | null;
  contact_id: string | null;
  /** How the lead has been worked, from `leads_page` (4.2): a fixture copies the real shape even where B draws none of it. */
  last_outcome: string | null;
  last_note: string | null;
  contacted_at: string | null;
  converted_at: string | null;
  places: number;
  found_at: string;
  exported_at: string | null;
  version: number;
  member: {
    class: LeadClass;
    fit: "strong" | "look" | "long" | null;
    reason: string;
    excluded_by: string | null;
    distance_m: number | null;
    counted: boolean;
    checks: LeadCheck[];
    other_emails: { email: string; why: string }[];
    /** The class rule's reason tokens (D3): what Needs review is grouped by. Optional: a fixture from before carries none. */
    reasons?: string[];
  };
}

export interface LeadSearchRoundDto {
  id: string;
  seq: number;
  purpose: string;
  state: string;
  ending: LeadRoundEnding | null;
  question: { sentence: string; criterion_key: string } | null;
  target: number;
  counted: number;
  qualified: number;
  review: number;
  excluded: number;
  /** Counted leads whose address was found and checked: "88 you can email", and "41 emails checked" while it runs. */
  emails_checked: number;
  /** Counted leads reachable by phone: "72 by phone" (§8.6's sentence needs both, W2 put both on the view). */
  with_phone: number;
  /** The round is stopping and still checking what it found (S12): the only way to tell Stopping from Checking. */
  ending_pending: boolean;
  waiting_since: string | null;
  cost_usd: number;
  ended_at: string | null;
  undo_op_id: string | null;
  undo_version: number | null;
  /** Where to look next when the round ran dry (D3, 00145): the nearest ZIP centres past its area, nearest first; [] otherwise. */
  nearby: LeadArea[];
  /** The qualified members by fit band (D5, 00146), for the band bar. Optional: a fixture from before carries none. */
  fits?: { strong: number; look: number; long: number };
}

export interface LeadSearchDto {
  id: string;
  name: string;
  asked: string;
  asked_on: string;
  plan: LeadSearchPlan;
  plan_version: number;
  /**
   * The Ask thread the search was planned in (00172), or null: a search made on the page, one from before, or a
   * thread since gone. The answer to its question is sent there, and lands there when the thread is the reader's own.
   */
  thread_id: string | null;
  round: LeadSearchRoundDto | null;
}

export interface LeadCounts {
  all: number;
  ready: number;
  nurture: number;
  converted: number;
  said_no: number;
  not_a_fit: number;
}

/**
 * The month, as a surface says it (D5): how many of its leads are spoken for, how many are left, and the day it
 * renews. The workbench reads it to say what a press costs -- "5 of your 238 left" -- so a Keep is never a number
 * nobody can see. The whole is contracts' LEAD_MONTHLY_ALLOWANCE, never a number a page invents.
 */
export interface LeadMonthDto {
  used: number;
  left: number;
  renewsOn: string;
}

export interface LeadSuggestionsDto {
  business_line: string;
  by_owner: boolean;
  made_at: string;
  items: { words: string; who_for: string; category_key: string; reach: string | null }[];
  note?: string;
}

/** What the card knows beyond the plan: the reads release A's doors answer, folded into one unit (§0.2). `planFacts` in `server/leads.ts` (4.4) builds exactly this. */
export interface LeadPlanFacts {
  /** Places already in People or Leads this plan would skip: "Skips the 14 already yours". */
  dupes: number;
  /** Leads this month still covers, every limit folded in. */
  leadsLeft: number;
  /** Which limit made that number, when one of them binds before the plan's own count. A's counter kinds, never a word of its own. */
  bound: "allowance" | "budget" | null;
  /** The platform-wide prior for this kind of business (lead_niche_prior), or null when it was never searched. */
  prior: { places: number; matched: number; with_email: number } | null;
  /** The kind of business the prior is for, in the owner's words: "trainers". */
  priorOf: string | null;
  /** A must-be-seen criterion the chosen card cannot see (§0.1), with the likely version offered. */
  cannotSee: { key: string; text: string; likely: string } | null;
  /** The day the month's leads renew, in the workspace's zone: "Oct 1". */
  renewsOn: string;
  /** Claude's nearby areas, for the card's area picker and for a round further out. */
  nearby: LeadArea[];
}
