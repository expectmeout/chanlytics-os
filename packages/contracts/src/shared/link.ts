/**
 * THE web-address normalizer, beside email-address.ts and phone.ts. One
 * implementation, imported by the person's page (before a round trip) and the
 * details route (before the door); the door's own CHECK (00154) is what stops
 * a writer that did not come through here.
 *
 * Returns the address as it will be stored -- trimmed, with its scheme, at
 * most 500 characters (the booking link's own cap) -- or null when the input
 * cannot be one. A missing scheme is supplied: people paste
 * "docs.example.com/p/42" as readily as the full address, and the two are one
 * place. Nothing else is changed: a path is case-sensitive, and the owner
 * pasted what the proposal tool gave them. Anything that is not http or https
 * is refused: a mailto: or a javascript: address is not a page anyone opens,
 * and the page draws what is stored as a link.
 */

const MAX_LINK = 500;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function normalizeLink(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = SCHEME.test(text) ? text : `https://${text}`;
  if (withScheme.length > MAX_LINK) return null;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    // Not an address.
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOST.test(url.hostname)) return null;
  return withScheme;
}

/**
 * Which kind of not-an-address it was given, in the product's words; null for
 * an address. The door refuses the same things (00154), and says less.
 */
export function whyNotALink(raw: string | null | undefined): string | null {
  if (normalizeLink(raw)) return null;
  const s = String(raw ?? "").trim();
  if (!s) return "A web address is needed.";
  if (/\s/.test(s)) return "Only the address itself, with no spaces in it.";
  if (SCHEME.test(s) && !/^https?:/i.test(s)) return "That needs to be a web address, starting with https://.";
  if (s.length > MAX_LINK) return "That address is too long to store: paste the link itself, not a whole page.";
  return "That needs a full web address, like docs.example.com/proposal.";
}

/**
 * The host a stored address lives at, without its www., for a row that says
 * where the proposal is; the address itself when it cannot be read.
 */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Where a file in one of our public buckets is served: the project's own storage, on the Supabase origin the
 * dashboard's content policy already lets images in from (csp.ts reads the same variable). The caller has already held
 * the path to its bucket's own shape (a lead's mark, a workspace's logo); this answers null without an https origin to
 * serve it from (a laptop's own stack aside), so nothing is ever drawn from an address a browser would refuse.
 */
export function publicObjectSrc(supabaseUrl: string | null | undefined, bucket: string, path: string): string | null {
  if (!supabaseUrl) return null;
  let origin: string;
  try {
    origin = new URL(supabaseUrl).origin;
  } catch {
    // Not an address.
    return null;
  }
  if (!/^https:\/\//.test(origin) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return null;
  return `${origin}/storage/v1/object/public/${bucket}/${path}`;
}

const ADDRESS = /[^\s@<>]+@[^\s@<>]+/g;

const SCHEME_OR_WWW = /\bhttps?:\/\/[^\s<>]+|\bwww\.[^\s<>]+/gi;

// A bare name.tld as an address is written: "example.com", "harbor.example/book", and "RJCapital.io" with capitals
// before its dot, which a mail app links all the same (30 Oct 2026). "St.Louis", "Dr.Smith" and a rating's "4.9" are
// not: a capital after the last dot, or no letters.
const BARE_HOST = /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,24}\b(?:\/[^\s<>]*)?/g;

/**
 * The web addresses a reader sees in words: each with a scheme or a www., and each bare name.tld. An email address is
 * not one. A cold email's words ask it with their slots taken out (reach-out/words/limits.ts linksIn), and a signature
 * as it stands.
 */
export function webAddressesIn(text: string): string[] {
  const out: string[] = [];
  const rest = text.replace(ADDRESS, " ").replace(SCHEME_OR_WWW, (m) => {
    out.push(m);
    return " ";
  });
  for (const m of rest.matchAll(BARE_HOST)) out.push(m[0]);
  return out;
}
