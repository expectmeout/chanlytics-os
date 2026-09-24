/**
 * The booking page a listing's website says customers book at (the first run's Check, 3c-4), read with the listing's
 * first read (checkListing): the website itself when it is a page on a booking platform, or else the booking page its
 * home page links to. Only an address on the public internet is read (feedUrlOk), once, and for no longer than the
 * link can wait: the admin door holds two Places reads and this one inside its minute (vercel.json).
 */
import { bookingPageOf, feedUrlOk } from "../packages/contracts.js";
import { bookingPageOn } from "../packages/core.js";
import { pageText } from "../leads/lead-marks.js";

/** How long the home page may take to answer. */
const SITE_TIMEOUT_MS = 4_000;

/** The booking page, or null: a website that is none and links to none, a private address, or a read that failed. */
export async function siteBookingPage(fetchImpl: typeof fetch, website: string | null): Promise<string | null> {
  const own = bookingPageOf(website);
  if (own) return own;
  const url = feedUrlOk(website);
  if (!url) return null;
  const html = await pageText(fetchImpl, url, SITE_TIMEOUT_MS);
  return html ? bookingPageOn(html, url) : null;
}
