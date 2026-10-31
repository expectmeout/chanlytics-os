/**
 * The booking page a listing's website says customers book at (the first run's Check, 3c-4), read when the listing is
 * linked (checkListing's `site: "read"`): the website itself when it is a page on a booking platform, or else the
 * booking page its home page names. The home page is read once, by the platform's one page reader (lib/public-page.ts
 * sitePage), for no longer than the link can wait inside its own request.
 */
import { bookingPageOf } from "../packages/contracts.js";
import { bookingPageLinkedFrom } from "../packages/core.js";
import { sitePage } from "../public-page.js";

/** How long the home page may take, and how much of it is read: a site's own links sit near its top. */
const SITE_READ = { timeoutMs: 4_000, maxChars: 256_000 };

/** The booking page, or null: a website that is none and names none, a private address, or a read that failed. */
export async function siteBookingPage(website: string | null): Promise<string | null> {
  const own = bookingPageOf(website);
  if (own) return own;
  const page = await sitePage(website, SITE_READ);
  return page === null || website === null ? null : bookingPageLinkedFrom(page.html, website);
}
