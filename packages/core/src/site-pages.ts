/**
 * Which of a business's own pages its home page points to for what Check asks (decision 0073, R10): its services and
 * prices, and what it says of itself and its rules. This file is the reading, and nothing else: given a page's text and
 * the address it came from, it answers up to `max` addresses on the same site, chosen by what their links say, the
 * services' and prices' first. It makes no request -- the edge reads the pages (apps/edge/lib/imports/website-read.ts).
 */
import { attrsOf, decodeEntities } from "./html";

/** What a link to the services or the prices says, in the two languages the product's businesses write in most. */
const SAYS_SERVICES =
  /\b(services?|prices?|pricing|menu|rates?|treatments?|packages?|servicios|precios|tarifas|men[uú])\b/i;
/** What a link to the rest says: about, the questions asked, the policies a booking keeps. */
const SAYS_ABOUT = /\b(about|faq|faqs|questions|policy|policies|info|nosotros|preguntas|pol[ií]ticas?)\b/i;

/** The most of a tag, or of a link's words, read for one link; the most links looked at on one page. */
const TAG_MAX = 2_000;
const WORDS_MAX = 300;
const LINKS_MAX = 400;

/** An address on the same site as `home` (its host, with or without www), in https or http, without its fragment. */
function sameSite(href: string, home: URL): string | null {
  let u: URL;
  try {
    u = new URL(decodeEntities(href), home);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");
  if (bare(u.hostname) !== bare(home.hostname)) return null;
  u.hash = "";
  return u.toString();
}

/**
 * Up to `max` of the site's own pages the home page links to for the services and prices, then for what it says of
 * itself and its rules, each once, never the home page again. Read in one pass, each link within a bound.
 */
export function sitePagesLinkedFrom(html: string, pageUrl: string, max = 2): string[] {
  let home: URL;
  try {
    home = new URL(pageUrl);
  } catch {
    return [];
  }
  const services: string[] = [];
  const about: string[] = [];
  const self = sameSite(pageUrl, home);
  const start = /<a[\s>]/gi;
  for (let at = 0, n = 0; n < LINKS_MAX; n++) {
    start.lastIndex = at;
    const m = start.exec(html);
    if (!m) break;
    const close = html.indexOf(">", m.index);
    if (close === -1) break;
    at = close + 1;
    if (close - m.index > TAG_MAX) continue;
    const attrs = attrsOf(html.slice(m.index + 2, close));
    if (!attrs.href) continue;
    const tail = html.slice(at, at + WORDS_MAX);
    const end = tail.search(/<\/a\s*>/i);
    const words = decodeEntities(
      [
        end === -1 ? "" : tail.slice(0, end).replace(/<[^>]*>/g, " "),
        attrs["aria-label"] ?? "",
        attrs.title ?? "",
      ].join(" "),
    );
    const page = sameSite(attrs.href, home);
    if (!page || page === self || services.includes(page) || about.includes(page)) continue;
    if (SAYS_SERVICES.test(words)) services.push(page);
    else if (SAYS_ABOUT.test(words)) about.push(page);
  }
  return [...services, ...about].slice(0, Math.max(0, max));
}
