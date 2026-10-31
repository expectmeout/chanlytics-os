/**
 * A lead's own receptionist is set up from what the finder kept of its listing (decision 0079): the lead read as the
 * Google listing the first run sets a receptionist up from (config/first-receptionist.ts firstReceptionistOf), so a
 * preview's receptionist is the one its business would get at sign-up with that listing linked.
 *
 *   leadAsListing   the lead as a listing: the name it is called by, its address, and Google's facts as far as the lead
 *                   holds them (its week only where every day reads, its number, its website, its kind, its zone)
 *   previewZoneOf   the zone a preview's workspace keeps: the lead's state's, else New York, as a new workspace's is
 *
 * Nothing here guesses: a week that does not read whole is no week, a lead with no site has no website.
 */
import type { FirstReceptionistKnown } from "../config/first-receptionist";
import type { GoogleListingFacts } from "../google/google";
import { leadCalledByOf } from "../leads/search/called-by";
import { listingPeriodsOf } from "../reach-out/lead-hours";
import { zoneOfRegion } from "../reach-out/us-zones";
import { formatPhoneDisplay } from "../shared/phone";

/** What a lead holds that its listing said, as the finder kept it (00140, 00144). */
export interface LeadListingInput {
  business_name: string | null;
  category: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  phone_e164: string | null;
  website_host: string | null;
  /** The finder's week, `[{day, hours}]` in Maps' own words. */
  hours: unknown;
}

/** The zone every new workspace starts in where nothing says another (create_workspace_for's). */
const DEFAULT_ZONE = "America/New_York";

/** A preview's zone: its lead's state's, else the default. */
export function previewZoneOf(l: Pick<LeadListingInput, "region">): string {
  return zoneOfRegion(l.region) ?? DEFAULT_ZONE;
}

/** "12 Main St, Austin, TX 78701": the parts the lead holds, in the order an address is written; null for none. */
function listingAddressOf(l: LeadListingInput): string | null {
  const place = [l.region, l.postal_code]
    .map((x) => x?.trim())
    .filter(Boolean)
    .join(" ");
  const line = [l.street, l.city, place]
    .map((x) => x?.trim())
    .filter(Boolean)
    .join(", ");
  return line || null;
}

/** The lead as the listing the first run sets a receptionist up from. */
export function leadAsListing(l: LeadListingInput): NonNullable<FirstReceptionistKnown["listing"]> {
  const host = l.website_host?.trim().toLowerCase() || null;
  const facts: GoogleListingFacts = {
    hours: listingPeriodsOf(l.hours),
    phone_e164: l.phone_e164,
    phone_display: formatPhoneDisplay(l.phone_e164),
    website: host ? `https://${host}` : null,
    primary_type: null,
    primary_type_label: l.category?.trim() || null,
    // A lead with no street is a business the finder found by its area: the record keeps no address for it.
    service_area_only: !l.street?.trim(),
    time_zone: previewZoneOf(l),
    booking_page: null,
  };
  return {
    name: leadCalledByOf({ business_name: l.business_name, city: l.city }),
    address: listingAddressOf(l),
    facts,
  };
}
