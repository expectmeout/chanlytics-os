/**
 * The business's own mark, for the places a page is about to commit. What a home page declares is read by mark.ts
 * and the bytes worth keeping are told by mark-image.ts, one folder up; the collect (collect.ts) and the re-judging
 * (rejudge.ts) call it.
 */

import { leadMarksFrom } from "../mark";
import { markImageFrom, MARK_MAX_BYTES } from "../mark-image";
import type { CollectPlace, LeadPorts } from "../ports";
import { JUDGE_MARGIN_MS } from "./rules";

/**
 * The business's own mark (D6), for the places this page is about to commit: one small GET of each new lead's home
 * page, read for the logos it declares (mark.ts), then the first of those whose bytes are a mark worth keeping
 * (mark-image.ts), stored as our own copy (00161) -- the site's address never draws past the dashboard's content
 * policy, and our copy does. It is the last thing the collect does and the first thing it gives up: a page that does
 * not answer inside the allowance, or a collect already short of time, simply commits leads with no mark, and the
 * next round's copy of that place fills it where it was empty.
 *
 * A left-out place is never marked, as it stores none of the rest (§0.4), and a place with no site has nothing to read.
 * Answers how many places were given a kept copy.
 */
export const MARK_ALLOWANCE_MS = 8_000;
export const MARK_AT_ONCE = 6;
/**
 * A page's candidates tried for bytes worth keeping: its said logo, then its best icon. Past two, it is a favicon.
 * An SVG is never kept (mark-image.ts), so an address that says it is one is not asked for and spends no try.
 */
export const MARK_TRIES = 2;
const SAYS_SVG = /\.svg(?:[?#]|$)/i;
export async function markPlaces(p: LeadPorts, places: CollectPlace[]): Promise<number> {
  const { fetchText, fetchBytes, storeMark } = p;
  if (!fetchText) return 0;
  const want = places.filter((x) => x.member.class !== "excluded" && !!x.place.website_host);
  const until = Math.min(p.deadline - JUDGE_MARGIN_MS, p.now().getTime() + MARK_ALLOWANCE_MS);
  const left = () => until - p.now().getTime();
  let kept = 0;

  const markOne = async (x: CollectPlace): Promise<void> => {
    const origin = `https://${x.place.website_host}`;
    const html = await fetchText(origin, left()).catch(() => null);
    if (!html) return;
    const marks = leadMarksFrom(html, origin);
    if (marks.length === 0) return;
    x.place.logo_url = marks[0];
    if (!fetchBytes || !storeMark) return;
    for (const url of marks.filter((u) => !SAYS_SVG.test(u)).slice(0, MARK_TRIES)) {
      if (left() <= 250) return;
      const bytes = await fetchBytes(url, left(), MARK_MAX_BYTES).catch(() => null);
      const image = bytes ? markImageFrom(bytes) : null;
      if (!bytes || !image) continue;
      const path = await storeMark(bytes, image).catch(() => null);
      if (!path) return;
      x.place.logo_url = url;
      x.place.mark_path = path;
      kept += 1;
      return;
    }
  };

  // Six at a time, each taking the next place as it finishes: one slow site holds up only its own lead.
  let next = 0;
  const worker = async () => {
    while (next < want.length && left() > 250) await markOne(want[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(MARK_AT_ONCE, want.length) }, worker));
  return kept;
}
