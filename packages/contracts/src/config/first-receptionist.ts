/**
 * The receptionist a workspace starts with (the first run's Check, docs/superpowers/specs/2026-09-24-first-run-design.md):
 * built from what is known, so the owner checks it rather than types it. The dashboard's first-receptionist route writes
 * it where none is set up, and fills what Google says into one that states none of it; the owner changes any of it in
 * the Business tab's own rows.
 *
 * Its own module because it reads Google's facts (google.ts), whose imports reach back to the first run's view model
 * (first-run.ts, through the leads): kept here, nothing it imports imports it.
 */
import {
  BrainConfigSchema,
  BusinessProfileSchema,
  DAYS,
  newReceptionistDefaults,
  type BrainConfig,
  type BusinessProfile,
} from "./config";
import { resolveFacts } from "./facts";
import { hoursFromGoogle, type GoogleListingFacts } from "../google/google";

/** What is known when the first receptionist is set up. */
export interface FirstReceptionistKnown {
  /** The workspace's own name, typed at sign-up. */
  workspaceName: string | null;
  /** The linked Google listing: its name and address, and Google's facts as stored (listingFactsOf). Null when none is linked. */
  listing: { name: string | null; address: string | null; facts: GoogleListingFacts | null } | null;
}

/** The most a business name holds: the schema's own number. */
const NAME_MAX = BrainConfigSchema.shape.business_name.maxLength ?? Infinity;

/**
 * What the linked listing says the record should hold, and only what Google gives:
 * - the week (hoursFromGoogle), with every day Google lists no period for stored as closed, which is an answer
 *   (`{}`); the days the record cannot hold (past midnight, around the clock) are left out, so the receptionist never
 *   states them and Check asks about them. A week with no open day is no hours at all;
 * - the address, unless Google says the business goes to its customers: a service area's "address" is a region, and it
 *   is not frozen into the record as the place to find it (the resolver still falls back to the listing's, as it does
 *   for any record with no address);
 * - the website, where the record's own rule takes it.
 */
function googleProfileOf(listing: FirstReceptionistKnown["listing"]): BusinessProfile {
  const facts = listing?.facts ?? null;
  const profile: BusinessProfile = {};
  const week = hoursFromGoogle(facts?.hours ?? null);
  if (Object.keys(week.hours).length) {
    profile.hours = Object.fromEntries(
      DAYS.filter((d) => !week.unsure.includes(d)).map((d) => [d, week.hours[d] ?? {}]),
    ) as BusinessProfile["hours"];
  }
  const address = (listing?.address ?? "").trim();
  if (address && !facts?.service_area_only && BusinessProfileSchema.shape.address.safeParse(address).success) {
    profile.address = address;
  }
  if (facts?.website && BusinessProfileSchema.shape.website.safeParse(facts.website).success) {
    profile.website = facts.website;
  }
  return profile;
}

/**
 * The first receptionist, from what is known; null when there is no name to give it.
 *
 * - The name is the resolver's own answer (facts.ts resolveFacts): the listing's, which Google verified, else the
 *   workspace's, typed at sign-up as the business's name. One derivation, so the card, the prompt and this never
 *   disagree about which comes first.
 * - What the listing says, as googleProfileOf reads it: the week, the address and the website.
 * - The prompt and the three messages are the product's own (newReceptionistDefaults), under the name.
 *
 * No booking link and no number to give out: the link is read off the website later, and an absent number is the
 * line the receptionist answers (config.ts phone_display).
 */
export function firstReceptionistOf(known: FirstReceptionistKnown): BrainConfig | null {
  const resolved = resolveFacts(null, {
    workspace: { name: known.workspaceName },
    listing: known.listing ? { name: known.listing.name, address: known.listing.address } : null,
  }).business_name.value;
  const name = (resolved ?? "").slice(0, NAME_MAX).trim();
  if (!name) return null;
  const profile = googleProfileOf(known.listing);
  return {
    business_name: name,
    ...newReceptionistDefaults(name),
    ...(Object.keys(profile).length ? { profile } : {}),
  };
}

/**
 * A receptionist set up before its listing was linked (by hand, or with the name alone after "We're not on Google"),
 * with what the listing says where it states nothing yet: the week, the address and the website, never over what is
 * there. Null when Google adds nothing. So "Yes, this is us" brings Google's facts to Check whenever the record lacks
 * them, and never replaces a fact the owner gave.
 */
export function googleFillsOf(brain: BrainConfig, listing: FirstReceptionistKnown["listing"]): BrainConfig | null {
  const p: BusinessProfile = brain.profile ?? {};
  const google = googleProfileOf(listing);
  const states = (v: unknown): boolean =>
    typeof v === "string" ? v.trim() !== "" : !!v && typeof v === "object" && Object.keys(v as object).length > 0;
  const fills = (["hours", "address", "website"] as const).filter((k) => google[k] !== undefined && !states(p[k]));
  if (!fills.length) return null;
  return { ...brain, profile: { ...p, ...Object.fromEntries(fills.map((k) => [k, google[k]])) } };
}
