/**
 * The business's own mark (D6).
 *
 * A storefront photo says which shop this is; a logo says who the company is,
 * and it is the question that survives when leads stop coming from a map. A
 * listing gives us a photo, so the logo has to come from the only place that
 * always has one: the business's own site.
 *
 * This file is the reading, and nothing else: given the text of a home page
 * and the origin it came from, it answers the one address most likely to be
 * that company's mark, or nothing. It makes no request, keeps no state and
 * knows no lead -- the runner does the fetching, inside its own time.
 *
 * What it prefers, and why:
 *   1. A logo the site DECLARES as its logo (schema.org's `logo`). Nobody puts
 *      a photograph there; it is the mark, said so.
 *   2. An apple-touch-icon. Made for a home screen, so it is square, it is
 *      180px or better, and it is almost always the mark rather than a glyph.
 *   3. An SVG icon. Small in bytes and sharp at any size.
 *   4. Any other declared icon, biggest first, with a .ico last: those are
 *      sixteen pixels of mush beside a 48px tile.
 *
 * What it will not answer: a data: URI (bytes we would be storing, not an
 * address), anything that is not http or https, and og:image -- that is a
 * hero photograph as often as not, and a photograph is what we already have.
 */

/**
 * Past this the head is not a head, and a page that never closes one is a page we stop reading.
 *
 * It must not sit below what the caller fetches (`PAGE_MAX_BYTES` on the edge, 96KB), or the reader stops short of
 * text it was handed and calls a mark absent that is there. A Portland comic shop inlines 70KB of stylesheet before
 * it says what its icon is -- its head closes at 78KB, and at the old 64KB this read none of the three it declares.
 * Real pages put the head's last words a long way down; only a page with no `</head>` at all is cut here.
 */
const HEAD_MAX = 96_000;
/** The column keeps an address, not a document. */
const HREF_MAX = 500;

/** The head of the document, or as much of the start as is worth reading. */
function headOf(html: string): string {
  const start = html.slice(0, HEAD_MAX);
  const end = start.search(/<\/head\s*>/i);
  return end === -1 ? start : start.slice(0, end);
}

/** One tag's attributes, lower-cased by name, however they were quoted. */
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/g;
  for (let m = re.exec(tag); m; m = re.exec(tag)) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? "").trim();
  return out;
}

/** "180x180" or "any" -> the side in pixels; 0 when the tag did not say. `any` is an SVG saying it scales. */
function sideOf(sizes: string | undefined): number {
  if (!sizes) return 0;
  if (/\bany\b/i.test(sizes)) return 512;
  let best = 0;
  const re = /(\d+)\s*[x×]\s*(\d+)/gi;
  for (let m = re.exec(sizes); m; m = re.exec(sizes)) best = Math.max(best, Math.min(Number(m[1]), Number(m[2])));
  return best;
}

/**
 * The marks a WEBSITE BUILDER serves, the same address for every shop on it. Reading 315 real lead sites found seven
 * Squarespace shops all answering with Squarespace's own favicon and seven Wix shops with Wix's -- storing that
 * draws one stranger's logo across seven unrelated leads, which is worse than the initials it would replace.
 *
 * These are exact addresses, never hosts: the same CDNs serve what each shop uploaded itself, and that IS its mark.
 * The list grows only from a default seen in the wild, because refusing a guess costs a company its real logo.
 */
const PLATFORM_DEFAULTS = new Set([
  "assets.squarespace.com/universal/default-favicon.ico",
  "static.parastorage.com/client/pfavico.ico",
]);

/** True when the address is the platform's stock mark rather than this company's. */
function isPlatformDefault(url: string): boolean {
  const bare = url.slice(url.indexOf("//") + 2).split(/[?#]/)[0].toLowerCase();
  return PLATFORM_DEFAULTS.has(bare) || /(^|\/)default-favicon\.[a-z0-9]+$/.test(bare);
}

/** No real address holds these, and each is a character that could close the HTML attribute or SQL literal it sits in. */
const UNSAFE_IN_AN_ADDRESS = ` "'<>{}|^` + String.fromCharCode(92, 96, 9, 10, 13);

/** True when the address holds something no address holds: a space, a quote, a bracket, or any control character. */
function holdsUnsafe(url: string): boolean {
  for (const ch of url) if (UNSAFE_IN_AN_ADDRESS.includes(ch) || ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f) return true;
  return false;
}

/**
 * An href is HTML before it is an address: a browser decodes its entities before it fetches, and so must we. A real
 * falconry school wrote its mark as `...jpeg?w=180&#038;h=180`, which stored raw asks a server for a parameter
 * literally named `#038;h`. Decoding happens before every refusal below, so nothing spells a scheme past them.
 */
function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  const chr = (n: number, had: string) => (n > 0 && n < 0x110000 ? String.fromCodePoint(n) : had);
  return s
    .replace(/&#x([0-9a-f]+);/gi, (had, h) => chr(parseInt(h, 16), had))
    .replace(/&#(\d+);/g, (had, d) => chr(Number(d), had))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

/** An address as the browser would read it from this page: absolute, http(s), and short enough to keep. */
function absolute(href: string, origin: string): string | null {
  const raw = decodeEntities(href.trim());
  if (!raw || raw.length > HREF_MAX) return null;
  if (/^data:|^javascript:/i.test(raw)) return null;
  // A lone fragment is a reference into the page's own JSON-LD graph, not an address: one dental practice wrote
  // its logo as "#logo". The server never sees what follows a hash, so this asks for the page itself.
  if (raw.startsWith("#")) return null;
  let url = raw;
  if (raw.startsWith("//")) url = `https:${raw}`;
  else if (raw.startsWith("/")) url = `${origin}${raw}`;
  else if (!/^https?:\/\//i.test(raw)) url = `${origin}/${raw.replace(/^\.\//, "")}`;
  if (!/^https?:\/\//i.test(url) || url.length > HREF_MAX) return null;
  // A mark served over plain http cannot draw on a page served over https -- the browser blocks it -- so an address
  // we could never show is no better than none. Every site that answers on http answers on https today; ask for the
  // one that can be seen, and the photo takes over if it turns out it cannot.
  const secure = url.replace(/^http:\/\//i, "https://");
  // A builder's own default is refused here, so BOTH readings below fall through to whatever else the page declares.
  if (holdsUnsafe(secure)) return null;
  // `https://host` and `https://host/` are the site's own front door: its home page is HTML, never an image.
  const slash = secure.indexOf("/", "https://".length);
  if (slash === -1 || slash === secure.length - 1) return null;
  return isPlatformDefault(secure) ? null : secure;
}

/** Higher is better; 0 is "not a mark". The tier decides first, the size only breaks a tie inside it. */
function scoreOf(rel: string, type: string, href: string, side: number): number {
  const rels = rel.toLowerCase().split(/\s+/);
  const ext = (href.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  if (rels.includes("mask-icon")) return 0; // a monochrome silhouette, never the mark
  const svg = type.toLowerCase().includes("svg") || ext === "svg";
  let tier = 0;
  if (rels.some((r) => r === "apple-touch-icon" || r === "apple-touch-icon-precomposed")) tier = 3;
  else if (rels.includes("icon") || rels.includes("shortcut")) tier = svg ? 3 : ext === "ico" ? 1 : 2;
  if (!tier) return 0;
  return tier * 1000 + Math.min(side || (svg ? 512 : 32), 999);
}

/**
 * The best mark this page declares, as an absolute address, or null. `origin` is the site the text came from
 * ("https://example.com"), used to resolve what the page wrote relatively.
 */
export function leadMarkFrom(html: string, origin: string): string | null {
  if (!html || !/^https?:\/\/[^/]+$/i.test(origin)) return null;
  const head = headOf(html);
  // A logo the site says is its logo wins outright: schema.org "logo", as a string or as an image object.
  const said = head.match(/"logo"\s*:\s*"([^"]+)"/i) ?? head.match(/"logo"\s*:\s*\{[^{}]*"url"\s*:\s*"([^"]+)"/i);
  if (said) {
    const url = absolute(said[1].replace(/\\\//g, "/"), origin);
    if (url) return url;
  }
  let best: { url: string; score: number } | null = null;
  const tags = head.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const a = attrsOf(tag);
    if (!a.rel || !a.href) continue;
    const score = scoreOf(a.rel, a.type ?? "", a.href, sideOf(a.sizes));
    if (!score) continue;
    const url = absolute(a.href, origin);
    if (url && (!best || score > best.score)) best = { url, score };
  }
  return best?.url ?? null;
}
