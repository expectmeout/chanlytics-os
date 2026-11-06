/**
 * What the columns a member turns on say of one lead (decision 0103): every one from the row the page already holds, so
 * showing a column never waits on the network. It stands in the sheet's folder as lead-row-status.ts does: the leads folder
 * is at its limit.
 *
 *   LEAD_COLUMN_GROUPS  the Columns menu's headings, in its order
 *   leadOutcomeWord     a lead's last outcome in words
 *   leadColumnsOf       what each column says of a lead
 */
import { clockDateYear, clockTime } from "../../shared/clock";
import { normalizeLink } from "../../shared/link";
import { agoShort } from "../../shared/time";
import type { LeadRowDto } from "../lead-dtos";
import { leadAddresseeOf, leadSizeOf } from "../lead-kind";
import { LEAD_CALL_OUTCOME_WORDS, type LeadCallOutcome } from "../lead-words";

/** The Columns menu's headings, in its order. */
export const LEAD_COLUMN_GROUPS = {
  stands: "Where it stands",
  who: "Who they are",
  where: "Where",
  reach: "How to reach",
  good: "How good",
  from: "Where from",
} as const;

/** What the Rated column's heading says of its order. */
export const LEAD_RATED_HINT = "Sorted by rating, weighed by how many reviewed";

/** One link a lead's source gave, on the words a member reads it by. */
export interface LeadSocialLink {
  key: "linkedin" | "facebook" | "instagram" | "tiktok";
  word: string;
  href: string;
}

/** What the columns a member may turn on say of one lead. Nothing held says nothing. */
export interface LeadColumnsVM {
  sequence: string | null;
  /** How long since the last contact, and the whole date for the tip. */
  contacted: { label: string; at: string } | null;
  outcome: { word: string; note: string | null } | null;
  /** Who a company's email goes to. A place has none. */
  contact: { name: string; title: string | null } | null;
  size: string | null;
  city: string | null;
  region: string | null;
  social: readonly LeadSocialLink[];
  reviews: string | null;
  claimed: "Yes" | "No" | null;
}

/** A lead's last outcome in words: a call's, or an email marked as sent. None for one this does not know. */
export function leadOutcomeWord(outcome: string | null | undefined): string | null {
  if (!outcome) return null;
  if (outcome === "emailed") return "Emailed";
  return LEAD_CALL_OUTCOME_WORDS[outcome as LeadCallOutcome] ?? null;
}

/** Whether the listing is claimed, in words. A source that says nothing says nothing. */
export const leadClaimedWord = (claimed: boolean | null | undefined): "Yes" | "No" | null =>
  claimed === true ? "Yes" : claimed === false ? "No" : null;

/** The links a source gave, each read as a web address: a table draws them as links, and a file may hold anything. */
const socialOf = (r: LeadRowDto): readonly LeadSocialLink[] => {
  const all: readonly [LeadSocialLink["key"], string, string | null | undefined][] = [
    ["linkedin", "LinkedIn", r.linkedin_url],
    ["facebook", "Facebook", r.facebook_url],
    ["instagram", "Instagram", r.instagram],
    ["tiktok", "TikTok", r.tiktok_url],
  ];
  return all.flatMap(([key, word, held]) => {
    const href = normalizeLink(held);
    return href ? [{ key, word, href }] : [];
  });
};

/** What each column says of this lead, in the business's own clock. */
export function leadColumnsOf(r: LeadRowDto, tz: string, now: Date): LeadColumnsVM {
  const contactedMs = r.contacted_at ? Date.parse(r.contacted_at) : Number.NaN;
  const word = leadOutcomeWord(r.last_outcome);
  const contact = leadAddresseeOf(r);
  return {
    sequence: r.place?.name ?? null,
    contacted: Number.isFinite(contactedMs)
      ? {
          label: agoShort(contactedMs, now.getTime()),
          at: `${clockDateYear(contactedMs, tz)} · ${clockTime(contactedMs, tz)}`,
        }
      : null,
    outcome: word ? { word, note: r.last_note || null } : null,
    contact: contact ? { name: contact.name, title: contact.title } : null,
    size: leadSizeOf(r),
    city: r.city || null,
    region: r.state || null,
    social: socialOf(r),
    reviews: r.reviews === null || r.reviews === undefined ? null : r.reviews.toLocaleString("en-US"),
    claimed: leadClaimedWord(r.claimed),
  };
}
