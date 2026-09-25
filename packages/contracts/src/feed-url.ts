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
/** The shared space carriers put between a network and the internet (100.64.0.0/10): no more public than the rest. */
const CARRIER_NAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
/**
 * The same for IPv6, as an address names it (bracketed, and normalised): the unspecified address and this machine,
 * the unique local (fc00::/7) and link-local (fe80::/10) ranges, and an IPv4 address carried in one (::ffff:...),
 * which reaches whatever that IPv4 address reaches.
 */
const PRIVATE_V6 = /^\[(::1?|f[cd][0-9a-f]{0,2}:.*|fe[89ab][0-9a-f]?:.*|::ffff:.*)\]$/i;

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
  const h = u.hostname;
  if (PRIVATE_HOST.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || CARRIER_NAT.test(h) || PRIVATE_V6.test(h))
    return null;
  return u.toString();
}

/** A redirect is followed this many times at most: an http to https hop and a host move are what a calendar does. */
const FEED_REDIRECTS_MAX = 3;

/**
 * A feed fetched as the address rule allows at EVERY hop, not only the first. fetch() follows redirects by itself, so a
 * public address that answers "see http://10.0.0.5/" was read from inside the platform's own network by every reader
 * that checked only what it was given (the preview, the receptionist's availability, Ask's openings). The redirects are
 * followed here instead, each address judged by feedUrlOk, a few and no more.
 *
 * Answers the last response (which may not be ok: the caller says why), or null when an address on the way is one the
 * rule refuses, or the chain is longer than a calendar's.
 */
export async function fetchPublic(
  fetchImpl: typeof fetch,
  raw: string | null | undefined,
  init: RequestInit = {},
): Promise<Response | null> {
  let at = feedUrlOk(raw);
  for (let hop = 0; at && hop <= FEED_REDIRECTS_MAX; hop += 1) {
    const res = await fetchImpl(at, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      at = next ? feedUrlOk(new URL(next, at).toString()) : null;
      continue;
    }
    return res;
  }
  return null;
}

/**
 * Where each calendar keeps the address to paste (the Business tab's calendar fold, "Where do I find it?"). The steps
 * are each calendar's own screens, named as they name them, so an owner never has to know what "iCal" is.
 */
export const FEED_GUIDES: readonly { name: string; steps: readonly string[] }[] = [
  {
    name: "Google Calendar",
    steps: [
      "On a computer, open Google Calendar and go to Settings.",
      "Under “Settings for my calendars”, pick the calendar your appointments land in.",
      "Open “Integrate calendar” and copy “Secret address in iCal format”.",
    ],
  },
  {
    name: "Apple Calendar (iCloud)",
    steps: [
      "In the Calendar app, open Calendars and press ⓘ beside the calendar your appointments land in.",
      "Turn on Public Calendar, then Share Link, and copy it.",
    ],
  },
  {
    name: "Outlook",
    steps: [
      "In Outlook on the web, open Settings, then Calendar, then Shared calendars.",
      "Under “Publish a calendar”, pick your calendar and “Can view when I'm busy”, then Publish.",
      "Copy the ICS link.",
    ],
  },
];

/** What the calendar fold says while it checks a pasted address (the preview), and what it found. */
export const FEED_CHECK_WORDS = {
  guide: "Where do I find it?",
  reading: "Reading it…",
  read: (events: number, next: string | null) =>
    events === 0
      ? "Read it: it's empty so far. Your receptionist will see new appointments as they land."
      : `Read it: ${events} ${events === 1 ? "appointment" : "appointments"}${next ? `, the next ${next}` : ""}.`,
} as const;

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
