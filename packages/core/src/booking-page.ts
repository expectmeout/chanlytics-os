/**
 * The booking page a business's website names (the first run's Check, 3c-4). This file is the reading, and nothing
 * else: given the text of a page and the address it came from, it answers the booking page the page links to as the
 * way to book, or none. It makes no request -- the edge reads the page when a listing is linked (apps/edge/lib/google).
 */
import { bookingPageOf } from "@chanlytics/contracts";
import { attrsOf, decodeEntities } from "./html";

/**
 * Words that say a link is the way to book, in the two languages the product's businesses write their sites in most.
 * Whole words: a platform named on its own badge ("Powered by Booksy") says nothing about booking.
 */
const SAYS_BOOK =
  /\b(book|booking|bookings|schedule|scheduling|appointments?|reserve|reservations?|reservar|reserva|citas?|agendar)\b/i;

/** The most of a tag, or of a link's words, read for one link: a page is read once, start to end, whatever it holds. */
const TAG_MAX = 2_000;
const WORDS_MAX = 600;

/**
 * The booking page a page links to as the way to book: the first `<a href>` whose words -- its text, its images'
 * `alt`, its `aria-label` or `title` -- say booking, and whose address, as a browser resolves it against the page, is
 * a business's own page on a booking platform (contracts' bookingPageOf). A platform link that does not say booking is
 * a badge, a gift card or a shop, and is not taken. Null when the page names none.
 *
 * Read in one pass: each link's tag and words are read within a bound, and the next link is looked for after the
 * tag, so a page written to be slow to read is read no slower than any other.
 */
export function bookingPageLinkedFrom(html: string, pageUrl: string): string | null {
  const start = /<a[\s>]/gi;
  for (let at = 0; ;) {
    start.lastIndex = at;
    const m = start.exec(html);
    if (!m) return null;
    const close = html.indexOf(">", m.index);
    if (close === -1) return null;
    at = close + 1;
    if (close - m.index > TAG_MAX) continue;
    const attrs = attrsOf(html.slice(m.index + 2, close));
    if (!attrs.href) continue;
    const tail = html.slice(at, at + WORDS_MAX);
    const end = tail.search(/<\/a\s*>/i);
    const inner = end === -1 ? "" : tail.slice(0, end);
    const alts = inner.match(/\balt\s*=\s*("[^"]*"|'[^']*')/gi) ?? [];
    const words = decodeEntities(
      [inner.replace(/<[^>]*>/g, " "), ...alts, attrs["aria-label"] ?? "", attrs.title ?? ""].join(" "),
    );
    if (!SAYS_BOOK.test(words)) continue;
    let resolved: string;
    try {
      resolved = new URL(decodeEntities(attrs.href), pageUrl).toString();
    } catch {
      continue;
    }
    const page = bookingPageOf(resolved);
    if (page) return page;
  }
}
