/**
 * The photographs a page shows (decision 0099), read from its markup for the Inbox of Files: the picture it declares for
 * sharing, then what it paints behind a section, then each image it draws, at the widest size it offers. This reads addresses
 * only: what comes back is judged by its own bytes where it is kept (the edge's keepFoundFile), so a marketing page's icons
 * fall away by their size there, and the words here only spare those reads.
 */
import { attrsOf, decodeEntities } from "../website/html";

/** The most one page offers. A gallery is more, and the owner has the upload for the rest. */
export const SITE_PHOTOS_MAX = 12;

/** An address that says it is not a photograph, by what it is (a vector, an animation, a favicon) or what it is called. */
const NOT_A_PHOTO =
  /\.(svg|gif|ico)(\?|#|$)|(^|[/_.-])(icon|icons|sprite|favicon|logo|badge|pixel|spacer|placeholder|avatar)([/_.-]|$)/i;

/** An image's declared width below this is not a photograph worth the read. */
const WIDTH_LEAST = 300;

/** A section's painted picture, in its own style attribute: a site builder's hero is usually this, and the best photo there. */
const PAINTED = /background(?:-image)?\s*:[^;]*?url\(\s*(['"]?)([^'")]+)\1\s*\)/i;

/** The widest candidate of a srcset ("a.jpg 480w, b.jpg 1080w"), or null for none that says its width. */
function widestOf(srcset: string | undefined): string | null {
  if (!srcset) return null;
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(/,\s+/)) {
    const [url, size] = part.trim().split(/\s+/);
    const w = Number.parseInt(size ?? "", 10);
    if (url && Number.isFinite(w) && (!best || w > best.w)) best = { url, w };
  }
  return best?.url ?? null;
}

/** An address on the public web, made whole from the page's, or null. A browser decodes an address's entities first, so we do. */
function wholeUrl(raw: string | null | undefined, pageUrl: string): string | null {
  const text = raw ? decodeEntities(raw).trim() : "";
  if (!text || text.startsWith("data:")) return null;
  try {
    const u = new URL(text, pageUrl);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    // Not an address.
    return null;
  }
}

export function sitePhotosFrom(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  const offer = (raw: string | null | undefined) => {
    const url = wholeUrl(raw, pageUrl);
    if (url && !NOT_A_PHOTO.test(url) && !found.includes(url)) found.push(url);
  };
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(tag);
    if ((a.property ?? a.name)?.toLowerCase() === "og:image") offer(a.content);
  }
  // Before the images, so the cap below does not drop the hero. Builders write its quotes as &quot;, so it is decoded first.
  for (const [tag] of html.matchAll(/<[a-z][a-z0-9-]*\b[^>]*\bstyle\s*=\s*(?:"[^"]*"|'[^']*')[^>]*>/gi)) {
    const style = attrsOf(tag).style;
    if (style) offer(PAINTED.exec(decodeEntities(style))?.[2]);
  }
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrsOf(tag);
    // Pixels alone: a width of 100% is a hero, and says nothing about how small it is.
    const sentence = a.width ?? "";
    if (/^\d+$/.test(sentence) && Number(sentence) < WIDTH_LEAST) continue;
    // A page that loads its pictures late keeps the address beside the placeholder.
    offer(widestOf(a.srcset ?? a["data-srcset"]) ?? a["data-src"] ?? a.src);
  }
  return found.slice(0, SITE_PHOTOS_MAX);
}
