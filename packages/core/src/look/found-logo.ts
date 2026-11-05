/**
 * The first mark a page declares that is a picture worth keeping (00407's lookup, shared with the website read since
 * decision 0075): the mark the page's reader saw as the business's own, where it saw one, then the candidates
 * leadMarksFrom finds, best first; a builder's stock mark, a vector or a favicon file passed over by its name; the first
 * whose bytes are an image of a kind we keep, with sides the circle can be made from. The image read is the caller's
 * (channels imageBytes behind a fetcher): this decides, and asks for at most LOGO_TRIES.
 */
import { LOGO_FOUND_SIDE_MAX, LOGO_FOUND_SIDE_MIN } from "@chanlytics/contracts";
import { isPlatformDefault, leadMarksFrom } from "../leads/mark";
import { imageHeaderOf, type MarkImage } from "../leads/mark-image";

/** The candidates tried, best first: the declared logo, then the icons. Past three, what is left is a favicon. */
export const LOGO_TRIES = 3;

/** A candidate worth asking for: the web's own port, and not a vector or a favicon file by its name. */
export function askableMark(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.port && u.port !== "443" && u.port !== "80") return false;
    return !/\.(svg|ico)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Sides the circle can be made from, and a kind the browser and the server both keep. */
export function markFits(head: MarkImage): boolean {
  if (head.kind === "ico") return false;
  const short = Math.min(head.width, head.height);
  const long = Math.max(head.width, head.height);
  return short >= LOGO_FOUND_SIDE_MIN && long <= LOGO_FOUND_SIDE_MAX;
}

export interface FoundLogo {
  url: string;
  bytes: Uint8Array;
  head: MarkImage;
}

/** The first mark the page declares that fits, its bytes read through `image`; null when none of the first LOGO_TRIES does. */
export async function siteLogoFrom(
  image: (url: string) => Promise<Uint8Array | null>,
  html: string,
  origin: string,
  /** The address the page's reader took for the business's own mark; null where it saw none, or was not asked. */
  seen: string | null = null,
): Promise<FoundLogo | null> {
  const candidates = [...(seen && !isPlatformDefault(seen) ? [seen] : []), ...leadMarksFrom(html, origin)];
  for (const url of [...new Set(candidates)].filter(askableMark).slice(0, LOGO_TRIES)) {
    const bytes = await image(url);
    const head = bytes ? imageHeaderOf(bytes) : null;
    if (bytes && head && markFits(head)) return { url, bytes, head };
  }
  return null;
}
