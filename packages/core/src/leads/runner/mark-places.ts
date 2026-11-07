/**
 * The business's own mark, for the places a page is about to commit. What a home page declares is read by mark.ts
 * and the bytes worth keeping are told by mark-image.ts, one folder up; the collect (collect.ts) and the re-judging
 * (rejudge.ts) call it, and the leads sweep calls it again for the leads a collect had no time to mark (the edge's
 * leads/marks.ts).
 */

import { leadMarksFrom } from "../mark";
import { markImageFrom, MARK_MAX_BYTES } from "../mark-image";
import { runEachAtOnce } from "../../shared/each-at-once";
import type { LeadColumns, LeadPorts } from "../ports";
import { SITES_AT_ONCE, type SiteReads } from "./site-reads";

/**
 * The business's own mark (D6), for the places given (a left-out place stores none of the rest, §0.4, and is its caller's
 * to leave out; a place with no site has nothing to read): its home page, the page already read where the judge asked for
 * it (site-reads.ts), read for the logos it declares (mark.ts), then the first of those whose bytes are a mark worth
 * keeping (mark-image.ts), stored as our own copy (00161) -- the site's address never draws past the dashboard's content
 * policy, and our copy does. It is the last thing the collect does and the first thing it gives up: a page that does
 * not answer by `until` simply commits leads with no mark, and the leads sweep's try a few minutes on, or the next
 * round's copy of that place, fills it where it was empty.
 *
 * Answers how many places were given a kept copy.
 */
/**
 * A page's candidates tried for bytes worth keeping: its said logo, then its best icon. Past two, it is a favicon.
 * An SVG is never kept (mark-image.ts), so an address that says it is one is not asked for and spends no try.
 */
export const MARK_TRIES = 2;
const SAYS_SVG = /\.svg(?:[?#]|$)/i;
/** No read or image is begun with less than this left: the page's reader refuses a read of under a second. */
const MARK_LEAST_MS = 1_000;

/** What the step reads of a place and writes on it: its site, and the mark it is given. */
export type MarkPlace = Pick<LeadColumns, "website_host" | "logo_url" | "mark_path">;

export async function markPlaces(
  leadPorts: Pick<LeadPorts, "fetchBytes" | "storeMark" | "now">,
  sites: SiteReads,
  places: readonly MarkPlace[],
  until: number,
): Promise<number> {
  const { fetchBytes, storeMark } = leadPorts;
  const left = () => until - leadPorts.now().getTime();
  let kept = 0;

  const markOne = async (place: MarkPlace): Promise<void> => {
    if (!place.website_host) return;
    const page = await sites.read(place.website_host, left());
    if (!page) return;
    const marks = leadMarksFrom(page.html, new URL(page.url).origin);
    if (marks.length === 0) return;
    place.logo_url = marks[0] ?? null;
    if (!fetchBytes || !storeMark) return;
    for (const url of marks.filter((u) => !SAYS_SVG.test(u)).slice(0, MARK_TRIES)) {
      if (left() < MARK_LEAST_MS) return;
      const bytes = await fetchBytes(url, left(), MARK_MAX_BYTES).catch(() => null);
      const image = bytes ? markImageFrom(bytes) : null;
      if (!bytes || !image) continue;
      const path = await storeMark(bytes, image).catch(() => null);
      if (!path) return;
      place.logo_url = url;
      place.mark_path = path;
      kept += 1;
      return;
    }
  };

  await runEachAtOnce(places, SITES_AT_ONCE, () => left() >= MARK_LEAST_MS, markOne);
  return kept;
}
