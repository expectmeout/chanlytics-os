/**
 * The booking page a listing's website says customers book at (the first run's Check, 3c-4), found by the website's
 * read (imports/website-read.ts) off the home page it already holds: the website itself when it is a page on a booking
 * platform, or else the booking page its home page names. Kept on the linked listing's facts, where Check offers it,
 * while the listing's website is the one that was read (contracts bookingPageKept keeps it from there).
 */
import { bookingPageOf, feedUrlOk, listingFactsOf } from "../packages/contracts.js";
import type { SitePage } from "../packages/channels.js";
import { bookingPageLinkedFrom } from "../packages/core.js";
import { listingFactsStored } from "../packages/db.js";
import { keepListing, type Db } from "./google-rows.js";

/** The booking page a website names: its own address on a booking platform, else the one its home page links to. */
export function bookingPageFound(website: string, home: SitePage): string | null {
  return bookingPageOf(website) ?? bookingPageLinkedFrom(home.html, home.url);
}

/**
 * The booking page a read of `website` found, kept on the workspace's listing: only where a listing is linked, its
 * website is the one read, and it holds another page or none. Answers whether it was kept. A read that found none
 * clears nothing: what an earlier read found stays until the website changes.
 */
export async function keepBookingPageFound(db: Db, tenantId: string, website: string, page: string): Promise<boolean> {
  const stored = await listingFactsStored(db, tenantId);
  const facts = listingFactsOf(stored);
  if (!stored || typeof stored !== "object" || Array.isArray(stored) || !facts) return false;
  if (feedUrlOk(facts.website) !== website || facts.booking_page === page) return false;
  await keepListing(db, tenantId, { facts: { ...stored, booking_page: page } });
  return true;
}
