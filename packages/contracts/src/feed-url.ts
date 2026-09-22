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
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (PRIVATE_HOST.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return null;
  return u.toString();
}

/** The most a feed may weigh: two megabytes of text, a season of a busy salon several times over. */
export const FEED_MAX_BYTES = 2_000_000;

/**
 * Why the last read of a feed failed.
 *
 * "settings" is the one that is not about the address but about where the address is kept: a config row that
 * will not parse loses the calendar with it. It is here rather than off on its own because the owner is in the
 * same position either way -- their calendar could not be read -- and every reader of this union already knows
 * how to say that.
 */
export type FeedFailure = "address" | "unreachable" | "http" | "too_large" | "not_ical" | "settings";

/** One sentence per way a feed fails, naming what to do; null when nothing failed. */
export function feedProblemWords(reason: FeedFailure | null | undefined, status?: number | null): string | null {
  switch (reason) {
    case "address":
      return "The calendar feed needs to be a full https:// or webcal:// address on the internet.";
    case "unreachable":
      return "The calendar could not be reached. Check the address and try again.";
    case "http":
      return `The calendar answered ${status ?? "an error"}. It is usually the private iCal address, not the calendar's web page.`;
    case "too_large":
      return "That feed is too large to read (over 2 MB).";
    case "not_ical":
      return "That address is not an iCal feed. In Google Calendar it is Settings › your calendar › Secret address in iCal format.";
    case "settings":
      return "Your workspace settings could not be read, so the calendar address could not be found. Save it again in Settings.";
    default:
      return null;
  }
}

/**
 * The two things that make a body we did fetch unusable.
 *
 * One judgement, because there were two: the dashboard refused a feed over
 * FEED_MAX_BYTES while the edge inlined `2 * 1024 * 1024`, so a feed between
 * 2,000,000 and 2,097,152 bytes was read by one reader and refused by the
 * other — and the receptionist and the board would then disagree about a
 * business's own week with nothing on any page to say why.
 */
export function feedBodyProblem(text: string): FeedFailure | null {
  if (text.length > FEED_MAX_BYTES) return "too_large";
  if (!/BEGIN:VCALENDAR/i.test(text)) return "not_ical";
  return null;
}

/* ------------------------------------------------ how much of it to read */

/** A window of time a read of the feed has to cover. */
export interface FeedHorizon {
  from: number;
  to: number;
}

const DAY_MS = 86_400_000;

/**
 * THREE WINDOWS, NAMED.
 *
 * Five call sites parsed the same feed with four hand-written expressions
 * between them, and two of those were byte-identical: the edge's own
 * `horizonFor` and the prompt preview's inline copy. Nothing said which
 * differences were deliberate, so the only way to know whether the board and
 * the receptionist were meant to see the same season was to read four files
 * and compare arithmetic.
 *
 * They are three rules, and they differ for reasons worth writing down.
 * Behaviour is unchanged at every site: the board's old ±90 days is exactly
 * `seasonHorizon(now)`, and the preview's is exactly `seasonHorizon(now,
 * daysAhead)`.
 */

/**
 * Only what the receptionist may offer: yesterday, for a visit already under
 * way, through the last day it is allowed to book into.
 */
export function offeringHorizon(now: Date, daysAhead: number): FeedHorizon {
  return { from: now.getTime() - DAY_MS, to: now.getTime() + (daysAhead + 1) * DAY_MS };
}

/**
 * A season either side: ninety days back for "when were they last in", and
 * ninety forward — or the offering window when a workspace books further out
 * than that, so the two never disagree about a day the receptionist can offer.
 */
export function seasonHorizon(now: Date, daysAhead = 0): FeedHorizon {
  return { from: now.getTime() - DAY_MS * 90, to: now.getTime() + Math.max(daysAhead + 1, 90) * DAY_MS };
}

/**
 * A month, to prove an address works. The preview exists to answer "is this
 * the right link", and a season of a busy salon is slower to fetch and no
 * more convincing than four weeks of it.
 */
export function previewHorizon(now: Date): FeedHorizon {
  return { from: now.getTime() - DAY_MS, to: now.getTime() + 30 * DAY_MS };
}
