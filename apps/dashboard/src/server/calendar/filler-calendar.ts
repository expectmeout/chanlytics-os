import "server-only";
import { dayPlusInZone } from "@chanlytics/contracts";

/**
 * A calendar of fictional appointments for a workspace that carries tooling/scripts/filler.mjs's people.
 *
 * The day on Today is read from `tenant_config.calendar.ical_url` (server/calendar/calendar.ts), and the filler
 * cannot write to a real calendar, so a filled workspace points that address at this feed.
 *
 * It is generated, never fetched. The route below serves it so the address is a real one a person can
 * paste and preview, but `loadFeed` recognises the address and calls `fillerFeedFor` instead of making
 * an HTTP request: a serverless function fetching its own public domain is a round trip that can time
 * out, loop, or be refused by the platform, and when it failed the day card went silent (it draws a
 * failed-read notice only when the whole surface is missing, not when the feed is unreadable).
 *
 * Every appointment is relative to NOW in the zone asked for, so unlike the filler's rows it never ages;
 * every UID is fixed per day and slot, so a re-read draws the same day. The names and numbers are the
 * filler's own, from the NANP block reserved for fiction (+1 917 555 01xx), so a match on the day links
 * to a filler person's thread and nobody real is ever named.
 */

/** The address a filled workspace stores. The zone rides in `?tz=`, so the text can be made without a database read. */
export const FILLER_FEED_PATH = "/api/v1/calendar/filler.ics";

/** The filler's people, by the last two digits of their fictional number (filler.mjs). */
const PEOPLE: ReadonlyArray<readonly [string, string]> = [
  ["Daniela Reyes", "01"],
  ["Marcus Bell", "02"],
  ["Priya Nair", "03"],
  ["Sofia Alvarez", "04"],
  ["Carlos Mendez", "05"],
  ["Emily Chen", "06"],
  ["Jasmine Okafor", "07"],
  ["Laura Gómez", "08"],
  ["Nina Petrova", "09"],
  ["Olivia Brooks", "10"],
  ["Hannah Kim", "11"],
  ["Rosa Delgado", "12"],
  ["Ava Thompson", "13"],
  ["Zoe Martin", "14"],
  ["Grace Liu", "15"],
  ["Tom Baker", "16"],
];
const SERVICES: ReadonlyArray<readonly [string, number]> = [
  ["Cut", 45],
  ["Gloss", 60],
  ["Color", 90],
  ["Color treatment", 90],
  ["Gel manicure", 60],
  ["Consultation", 30],
  ["Cut and blow-dry", 60],
  ["Treatment", 120],
];
/** A working day's slots, minutes after midnight: 9:30 to 6, the hours the page shows. */
const SLOTS = [570, 630, 690, 750, 840, 900, 960, 1020];
const DAYS_AHEAD = 7;

const pad = (n: number) => String(n).padStart(2, "0");
const ical = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** A zone this deployment's Intl can read; anything else is not one. */
export function zoneOk(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The feed's text for the week from `nowMs`, in `tz`. */
export function fillerCalendar(nowMs: number, tz: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chanlytics//Filler calendar//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Filler appointments",
    `X-WR-TIMEZONE:${tz}`,
  ];
  for (let ahead = 0; ahead < DAYS_AHEAD; ahead++) {
    const d = dayPlusInZone(tz, nowMs, ahead);
    // dayPlusInZone spells the weekday one way for today (the formatter's "Sun") and another for the days
    // after (WEEKDAY_KEYS), so the day off is read by its first two letters.
    if (String(d.weekday).slice(0, 2).toLowerCase() === "su") continue;
    // Six a day, from a slot list that rotates with the day so no two days look alike.
    const start = (d.d + ahead) % SLOTS.length;
    for (let n = 0; n < 6; n++) {
      const slot = SLOTS[(start + n) % SLOTS.length];
      const [service, minutes] = SERVICES[(d.d + n) % SERVICES.length];
      const [name, last2] = PEOPLE[(d.d * 3 + n) % PEOPLE.length];
      const end = slot + minutes;
      const stamp = (mins: number) => `${d.y}${pad(d.m)}${pad(d.d)}T${pad(Math.floor(mins / 60))}${pad(mins % 60)}00`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:filler-${d.key}-${n}@chanlytics`,
        `DTSTAMP:${d.y}${pad(d.m)}${pad(d.d)}T000000Z`,
        `DTSTART;TZID=${tz}:${stamp(slot)}`,
        `DTEND;TZID=${tz}:${stamp(end)}`,
        `SUMMARY:${ical(`${service} · ${name}`)}`,
        `DESCRIPTION:${ical(`${name} · +1 917 555 01${last2}`)}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/**
 * The text for a stored address when that address is this feed, so the read needs no request; null for
 * every other address, which is fetched as it always was. The zone comes from `?tz=`, and one this
 * deployment cannot read falls back to the business's own.
 */
export function fillerFeedFor(url: string, nowMs = Date.now()): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.pathname !== FILLER_FEED_PATH) return null;
  const asked = u.searchParams.get("tz") ?? "";
  return fillerCalendar(nowMs, asked && zoneOk(asked) ? asked : "America/New_York");
}
