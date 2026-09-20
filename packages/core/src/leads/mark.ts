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

/** Past this the head is not a head, and a page that never closes one is a page we stop reading. */
const HEAD_MAX = 64_000;
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

/** An address as the browser would read it from this page: absolute, http(s), and short enough to keep. */
function absolute(href: string, origin: string): string | null {
  const raw = href.trim();
  if (!raw || raw.length > HREF_MAX) return null;
  if (/^data:|^javascript:/i.test(raw)) return null;
  let url = raw;
  if (raw.startsWith("//")) url = `https:${raw}`;
  else if (raw.startsWith("/")) url = `${origin}${raw}`;
  else if (!/^https?:\/\//i.test(raw)) url = `${origin}/${raw.replace(/^\.\//, "")}`;
  if (!/^https?:\/\//i.test(url) || url.length > HREF_MAX) return null;
  // A mark served over plain http cannot draw on a page served over https -- the browser blocks it -- so an address
  // we could never show is no better than none. Every site that answers on http answers on https today; ask for the
  // one that can be seen, and the photo takes over if it turns out it cannot.
  return url.replace(/^http:\/\//i, "https://");
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
