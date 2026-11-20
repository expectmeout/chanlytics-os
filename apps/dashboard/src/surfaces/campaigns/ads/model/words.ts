/**
 * The words the Ads view's parts share: days, people, the platforms as their owners are called, where the page's doors
 * go, and what a role's refusal says a press would have done. The page's own, like the models that read them, after the
 * glossary rows 'Ad', 'Ad account' and 'Runs on'. Words only, no data: the models make the values these take. The
 * page's own sentences are words-page.ts, the live page's live/words.ts, New ad's new/words.ts.
 */
import { plural } from "@chanlytics/contracts";
import type { AdPlatform } from "@chanlytics/contracts";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayParts = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return { dow: DOW[d.getUTCDay()] ?? "", mon: MON[d.getUTCMonth()] ?? "", date: d.getUTCDate() };
};

/** `Sat 31 Oct`. */
export function dayWord(iso: string): string {
  const p = dayParts(iso);
  return `${p.dow} ${p.date} ${p.mon}`;
}

/** `31 Oct`. */
export function dayShort(iso: string): string {
  const p = dayParts(iso);
  return `${p.date} ${p.mon}`;
}

/** `1 person`, `26 people`. */
export const peopleWord = (count: number): string => plural(count, "person", "people");

/** Where the page's doors go: Reports › People. */
export const ADS_DOORS = { people: "reports/people" } as const;

/** The company that checks, charges and reads: where billing, an account or a review is meant. */
export const PLATFORM_OWNER: Record<AdPlatform, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };

/** What a role's refusal says the press would have done ("Your role can't turn on an ad"): the money presses are the owner's. */
export const GATE = {
  turnOn: "turn on an ad",
  change: "change an ad",
};
