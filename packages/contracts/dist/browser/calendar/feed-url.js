import { DAY_MS } from "../shared/time.js";
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;
const CARRIER_NAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
const PRIVATE_V6 = /^\[(::1?|f[cd][0-9a-f]{0,2}:.*|fe[89ab][0-9a-f]?:.*|::ffff:.*)\]$/i;
export function feedUrlOk(raw) {
  if (!raw) return null;
  const url = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u;
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
const FEED_REDIRECTS_MAX = 3;
export async function fetchPublic(fetchImpl, raw, init = {}) {
  let at = feedUrlOk(raw);
  for (let hop = 0; at && hop <= FEED_REDIRECTS_MAX; hop += 1) {
    const res = await fetchImpl(at, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel().catch(() => void 0);
      at = next ? feedUrlOk(URL.canParse(next, at) ? new URL(next, at).toString() : null) : null;
      continue;
    }
    return res;
  }
  return null;
}
export const FEED_GUIDES = [
  {
    name: "Google Calendar",
    steps: [
      "On a computer, open Google Calendar and go to Settings.",
      "Under \u201CSettings for my calendars\u201D, pick the calendar your bookings land in.",
      "Open \u201CIntegrate calendar\u201D and copy \u201CSecret address in iCal format\u201D."
    ]
  },
  {
    name: "Apple Calendar (iCloud)",
    steps: [
      "In the Calendar app, open Calendars and press \u24D8 beside the calendar your bookings land in.",
      "Turn on Public Calendar, then Share Link, and copy it."
    ]
  },
  {
    name: "Outlook",
    steps: [
      "In Outlook on the web, open Settings, then Calendar, then Shared calendars.",
      "Under \u201CPublish a calendar\u201D, pick your calendar and \u201CCan view when I'm busy\u201D, then Publish.",
      "Copy the ICS link."
    ]
  }
];
export const FEED_CHECK_WORDS = {
  guide: "Where do I find it?",
  reading: "Reading it\u2026",
  read: (events, next) => events === 0 ? "Read it: it's empty so far. Your receptionist will see new bookings as they land." : `Read it: ${events} ${events === 1 ? "event" : "events"}, ${next ? `the next ${next}` : "none in the next 30 days"}.`
};
export const FEED_MAX_BYTES = 2e6;
export function feedProblemWords(reason, status) {
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
      return "That address is not an iCal feed. In Google Calendar it is Settings \u203A your calendar \u203A Secret address in iCal format.";
    case "settings":
      return "Your workspace settings could not be read, so the calendar address could not be found. Save it again in Settings.";
    default:
      return null;
  }
}
export function feedBodyProblem(text) {
  if (text.length > FEED_MAX_BYTES) return "too_large";
  if (!/BEGIN:VCALENDAR/i.test(text)) return "not_ical";
  return null;
}
export function offeringHorizon(now, daysAhead) {
  return { from: now.getTime() - DAY_MS, to: now.getTime() + (daysAhead + 1) * DAY_MS };
}
export const SEASON_BACK_DAYS = 90;
export function seasonHorizon(now, daysAhead = 0) {
  return {
    from: now.getTime() - DAY_MS * SEASON_BACK_DAYS,
    to: now.getTime() + Math.max(daysAhead + 1, 90) * DAY_MS
  };
}
export function previewHorizon(now) {
  return { from: now.getTime() - DAY_MS, to: now.getTime() + 30 * DAY_MS };
}
