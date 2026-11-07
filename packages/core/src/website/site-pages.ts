/**
 * Which of a business's own pages to read for what Check asks (decision 0073, R10): its services and prices, and what it
 * says of itself and its rules. This file is the reading, and nothing else: given what a home page links to, or what the
 * reader's map knows of the site, it answers up to `max` addresses on the same site, the services' and prices' first,
 * those whose words say so ahead of those only their address says it of. It makes no request -- the edge reads the pages
 * (apps/edge/lib/imports/website-read.ts).
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
/** An address says what its page is only near the site's root: "/hair-services", never a post at "/blog/2024/our-menu". */
const PATH_SAYS_DEPTH = 2;

/** An address on the same site as `home` (its host, with or without www), in https or http, without its fragment. */
function sameSite(href: string, home: URL): string | null {
  let url: URL;
  try {
    url = new URL(decodeEntities(href), home);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");
  if (bare(url.hostname) !== bare(home.hostname)) return null;
  url.hash = "";
  return url.toString();
}

/** What an address says of its page, in words: its path's, near the root of the site; nothing deeper. */
function pathWordsOf(page: string): string {
  const parts = new URL(page).pathname.split("/").filter(Boolean);
  return parts.length > PATH_SAYS_DEPTH ? "" : parts.join(" ").replace(/[-_.]+/g, " ");
}

/** A page chosen by what is said of it: `words`, what the link or the page's head says, ahead of its address. */
function pagesPicker(pageUrl: string): {
  add: (href: string, words: string) => void;
  picked: (max: number) => string[];
} | null {
  let home: URL;
  try {
    home = new URL(pageUrl);
  } catch {
    return null;
  }
  const self = sameSite(pageUrl, home);
  const by: Record<"services" | "servicesAt" | "about" | "aboutAt", string[]> = {
    services: [],
    servicesAt: [],
    about: [],
    aboutAt: [],
  };
  return {
    add(href, words) {
      const page = sameSite(href, home);
      if (!page || page === self) return;
      if (SAYS_SERVICES.test(words)) by.services.push(page);
      else if (SAYS_ABOUT.test(words)) by.about.push(page);
      else {
        const at = pathWordsOf(page);
        if (SAYS_SERVICES.test(at)) by.servicesAt.push(page);
        else if (SAYS_ABOUT.test(at)) by.aboutAt.push(page);
      }
    },
    picked: (max) =>
      [...new Set([...by.services, ...by.servicesAt, ...by.about, ...by.aboutAt])].slice(0, Math.max(0, max)),
  };
}

/**
 * Up to `max` of the site's own pages the home page links to for the services and prices, then for what it says of
 * itself and its rules, each once, never the home page again. Read in one pass, each link within a bound.
 */
export function sitePagesLinkedFrom(html: string, pageUrl: string, max = 2): string[] {
  const picker = pagesPicker(pageUrl);
  if (!picker) return [];
  const start = /<a[\s>]/gi;
  for (let at = 0, count = 0; count < LINKS_MAX; count++) {
    start.lastIndex = at;
    const match = start.exec(html);
    if (!match) break;
    const close = html.indexOf(">", match.index);
    if (close === -1) break;
    at = close + 1;
    if (close - match.index > TAG_MAX) continue;
    const attrs = attrsOf(html.slice(match.index + 2, close));
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
    picker.add(attrs.href, words);
  }
  return picker.picked(max);
}

/** Up to `max` of the pages a site's map names, by the same reading: what each page's head calls it, then its address. */
export function sitePagesNamed(
  links: readonly { url: string; title: string | null }[],
  pageUrl: string,
  max = 2,
): string[] {
  const picker = pagesPicker(pageUrl);
  if (!picker) return [];
  for (const l of links) picker.add(l.url, l.title ?? "");
  return picker.picked(max);
}
