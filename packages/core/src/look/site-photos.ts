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

/** The most videos one page offers: a site's reels, its hero clip. */
export const SITE_VIDEOS_MAX = 6;

/** A video file the video platform can fetch by its address, by what the address ends in. A player's page is not one. */
const A_VIDEO_FILE = /\.(mp4|m4v|mov|webm)(\?|#|$)/i;

/** A player on another platform the page embeds: counted, never fetched (Stream cannot take a YouTube or Vimeo page). */
const EMBEDDED_PLAYER = /(?:youtube(?:-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/)[\w-]+/gi;

/** Each `<video>` a page plays and each `<source>` it names, with the poster the `<video>` shows before it plays. */
function videoTagsOf(html: string): { src: string | null; poster: string | null }[] {
  const tags: { src: string | null; poster: string | null }[] = [];
  for (const [tag] of html.matchAll(/<(?:video|source)\b[^>]*>/gi)) {
    const a = attrsOf(tag);
    tags.push({ src: a.src ?? a["data-src"] ?? null, poster: a.poster ?? a["data-poster"] ?? null });
  }
  return tags;
}

/**
 * The videos a page plays (decision 0099 and the empty state of 14 Nov 2026): each `<video>` and `<source>` whose address is
 * a file, made whole, each once; and how many players of other platforms it embeds, which nothing here can fetch.
 */
export function siteVideosFrom(html: string, pageUrl: string): { videos: string[]; embedded: number } {
  const videos: string[] = [];
  for (const { src } of videoTagsOf(html)) {
    const url = wholeUrl(src, pageUrl);
    if (url && A_VIDEO_FILE.test(url) && !videos.includes(url)) videos.push(url);
  }
  const embedded = new Set([...html.matchAll(EMBEDDED_PLAYER)].map((m) => m[0].toLowerCase())).size;
  return { videos: videos.slice(0, SITE_VIDEOS_MAX), embedded };
}

export function sitePhotosFrom(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  // A video's poster is a frame of the video, which comes in as the video: not a photo of its own.
  const posters = new Set(videoTagsOf(html).flatMap(({ poster }) => wholeUrl(poster, pageUrl) ?? []));
  const offer = (raw: string | null | undefined) => {
    const url = wholeUrl(raw, pageUrl);
    if (url && !NOT_A_PHOTO.test(url) && !posters.has(url) && !found.includes(url)) found.push(url);
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
