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
  const s = String(raw).trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = SCHEME.test(s) ? s : `https://${s}`;
  if (withScheme.length > MAX_LINK) return null;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!HOST.test(u.hostname)) return null;
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
