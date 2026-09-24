/**
 * The receptionist a workspace starts with (the first run's Check, docs/superpowers/specs/2026-09-24-first-run-design.md):
 * built from what is known, so the owner checks it rather than types it. The dashboard's first-receptionist route writes
 * it, only where none is set up; the owner changes any of it in the Business tab's own rows.
 *
 * Its own module because it reads Google's facts (google.ts), whose imports reach back to the first run's view model
 * (first-run.ts, through the leads): kept here, nothing it imports imports it.
 */
import { BusinessProfileSchema, DAYS, newReceptionistDefaults, type BrainConfig, type BusinessProfile } from "./config";
import { resolveFacts } from "./facts";
import { hoursFromGoogle, type GoogleListingFacts } from "./google";

/** What is known when the first receptionist is set up. */
export interface FirstReceptionistKnown {
  /** The workspace's own name, typed at sign-up. */
  workspaceName: string | null;
  /** The linked Google listing: its name and address, and Google's facts as stored (listingFactsOf). Null when none is linked. */
  listing: { name: string | null; address: string | null; facts: GoogleListingFacts | null } | null;
}

/** The most a business name holds (BrainConfigSchema's business_name). */
const NAME_MAX = 120;

/**
 * The first receptionist, from what is known; null when there is no name to give it.
 *
 * - The name is the resolver's own answer (facts.ts resolveFacts): the listing's, which Google verified, else the
 *   workspace's, typed at sign-up as the business's name. One derivation, so the card, the prompt and this never
 *   disagree about which comes first.
 * - The hours are Google's (hoursFromGoogle), with every day Google lists no period for stored as closed, which is an
 *   answer (`{}`); the days the record cannot hold (past midnight, around the clock) are left out, so the receptionist
 *   never states them and Check asks about them. A week with no open day is no hours at all.
 * - The address is the listing's, unless Google says the business goes to its customers: a service area's address is
 *   a region, and a receptionist that gave it would send someone to a city.
 * - The website is Google's, where the record's own rule takes it.
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
  const facts = known.listing?.facts ?? null;
  const profile: BusinessProfile = {};
  const week = hoursFromGoogle(facts?.hours ?? null);
  if (Object.keys(week.hours).length) {
    profile.hours = Object.fromEntries(
      DAYS.filter((d) => !week.unsure.includes(d)).map((d) => [d, week.hours[d] ?? {}]),
    ) as BusinessProfile["hours"];
  }
  const address = (known.listing?.address ?? "").trim();
  if (address && !facts?.service_area_only && BusinessProfileSchema.shape.address.safeParse(address).success) {
    profile.address = address;
  }
  if (facts?.website && BusinessProfileSchema.shape.website.safeParse(facts.website).success) {
    profile.website = facts.website;
  }
  return {
    business_name: name,
    ...newReceptionistDefaults(name),
    ...(Object.keys(profile).length ? { profile } : {}),
  };
}
