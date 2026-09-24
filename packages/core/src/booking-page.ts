/**
 * The booking page a business's website links to (the first run's Check, 3c-4). This file is the reading, and nothing
 * else: given the text of a page and the address it came from, it answers the booking page the page links to, or
 * none. It makes no request -- the edge reads the page, with the listing's first read (apps/edge/lib/google).
 */
import { bookingPageOf } from "@chanlytics/contracts";
import { attrsOf, decodeEntities } from "./html";

/** Words on a link that say it is the way to book, in the two languages the product's businesses write most. */
const SAYS_BOOK = /\b(book|schedul|appointment|reserv|cita|agend)/i;

/**
 * The booking page a page links to: every `<a href>` on it, as a browser resolves it against the page, through
 * contracts' bookingPageOf. A link whose words say booking ("Book now", "Schedule", "Reservar") is taken over an
 * earlier one that does not, which is a gift card or a shop on the same platform as often as not; with none that says
 * so, the first. Null when the page links to none.
 */
export function bookingPageOn(html: string, pageUrl: string): string | null {
  let first: string | null = null;
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const attrs = attrsOf(m[1]);
    if (!attrs.href) continue;
    let resolved: string;
    try {
      resolved = new URL(decodeEntities(attrs.href), pageUrl).toString();
    } catch {
      continue;
    }
    const page = bookingPageOf(resolved);
    if (!page) continue;
    const words = decodeEntities(`${m[2].replace(/<[^>]*>/g, " ")} ${attrs["aria-label"] ?? ""} ${attrs.title ?? ""}`);
    if (SAYS_BOOK.test(words)) return page;
    first ??= page;
  }
  return first;
}
