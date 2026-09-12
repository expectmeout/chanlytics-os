/**
 * A calendar feed's address, and the ways a read of it fails.
 *
 * The address rule is one function because it guards three doors: the
 * preview before a save, the save itself (config.ts), and every fetch the
 * dashboard and the edge make of the saved address. Until 12 Sep 2026 only
 * the preview applied it, so a private address that reached the config was
 * fetched, hourly, from inside the platform's own network.
 *
 * The failure words are one function because the owner reads them in three
 * places: the preview's refusal, the Calendar page's card, and the Setup
 * row. Each way a feed fails has one sentence, and it names what to do.
 */

/** Hosts a feed is never fetched from: this machine, the private ranges, link-local, and local names. */
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

/** Only an address on the public internet, over https or http; webcal is https in a hat. Null when it is not one. */
export function feedUrlOk(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (PRIVATE_HOST.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return null;
  return u.toString();
}

/** The most a feed may weigh: two megabytes of text, a season of a busy salon several times over. */
export const FEED_MAX_BYTES = 2_000_000;

/** Why the last read of a feed failed. */
export type FeedFailure = "address" | "unreachable" | "http" | "too_large" | "not_ical";

/** One sentence per way a feed fails, naming what to do; null when nothing failed. */
export function feedProblemWords(reason: FeedFailure | null | undefined, status?: number | null): string | null {
  switch (reason) {
    case "address": return "The calendar feed needs to be a full https:// or webcal:// address on the internet.";
    case "unreachable": return "The calendar could not be reached. Check the address and try again.";
    case "http": return `The calendar answered ${status ?? "an error"}. It is usually the private iCal link, not the calendar's web page.`;
    case "too_large": return "That feed is too large to read (over 2 MB).";
    case "not_ical": return "That address is not an iCal feed. In Google Calendar it is Settings › your calendar › Secret address in iCal format.";
    default: return null;
  }
}
