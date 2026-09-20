/**
 * A calendar of fictional appointments, served as an iCal feed, for a workspace that carries
 * tooling/scripts/filler.mjs's people. The day on Today is read from `tenant_config.calendar.ical_url`
 * (server/calendar.ts), and the filler cannot write to a real calendar, so this is the feed a filled
 * workspace points that address at. Every appointment is generated relative to NOW in the zone asked
 * for, so the calendar never ages the way the filler's rows do; every UID is fixed per day and slot,
 * so a re-read draws the same day.
 *
 * Public on purpose (proxy.ts PUBLIC_PATHS, and its own door in route-policy.test.mjs): the calendar
 * reader fetches it from the server with no session, the way it fetches any feed, so it does NOT go
 * through withRoute (there is no session to verify) and it holds no tenant's data. The names and numbers are the filler's own, from the NANP
 * block reserved for fiction (+1 917 555 01xx), so a match on the day links to a filler person's
 * thread and nobody real is ever named.
 */
import { dayPlusInZone } from "@chanlytics/contracts";

export const dynamic = "force-dynamic";

/** The filler's people, by the last two digits of their fictional number (filler.mjs). */
const PEOPLE: ReadonlyArray<readonly [string, string]> = [
  ["Daniela Reyes", "01"], ["Marcus Bell", "02"], ["Priya Nair", "03"], ["Sofia Alvarez", "04"],
  ["Carlos Mendez", "05"], ["Emily Chen", "06"], ["Jasmine Okafor", "07"], ["Laura Gómez", "08"],
  ["Nina Petrova", "09"], ["Olivia Brooks", "10"], ["Hannah Kim", "11"], ["Rosa Delgado", "12"],
  ["Ava Thompson", "13"], ["Zoe Martin", "14"], ["Grace Liu", "15"], ["Tom Baker", "16"],
];
const SERVICES: ReadonlyArray<readonly [string, number]> = [
  ["Cut", 45], ["Gloss", 60], ["Color", 90], ["Color treatment", 90], ["Gel manicure", 60],
  ["Consultation", 30], ["Cut and blow-dry", 60], ["Keratin", 120],
];
/** A working day's slots, minutes after midnight: 9:30 to 6, the hours the page shows. */
const SLOTS = [570, 630, 690, 750, 840, 900, 960, 1020];
const DAYS_AHEAD = 7;

const pad = (n: number) => String(n).padStart(2, "0");
const ical = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const zoneOk = (tz: string): boolean => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };

/** The feed's text for the week from `nowMs`, in `tz`. */
export function fillerCalendar(nowMs: number, tz: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Chanlytics//Filler calendar//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:Filler appointments`, `X-WR-TIMEZONE:${tz}`];
  for (let ahead = 0; ahead < DAYS_AHEAD; ahead++) {
    const d = dayPlusInZone(tz, nowMs, ahead);
    // dayPlusInZone spells the weekday one way for today (the formatter's "Sun") and another for the days after
    // (WEEKDAY_KEYS), so the day off is read by its first two letters.
    if (String(d.weekday).slice(0, 2).toLowerCase() === "su") continue;
    // Six a day, from a slot list that rotates with the day so no two days look alike.
    const start = (d.d + ahead) % SLOTS.length;
    for (let n = 0; n < 6; n++) {
      const slot = SLOTS[(start + n) % SLOTS.length];
      const [service, minutes] = SERVICES[(d.d + n) % SERVICES.length];
      const [name, last2] = PEOPLE[(d.d * 3 + n) % PEOPLE.length];
      const s = { hh: Math.floor(slot / 60), mm: slot % 60 };
      const end = slot + minutes;
      const e = { hh: Math.floor(end / 60), mm: end % 60 };
      const stamp = (t: { hh: number; mm: number }) => `${d.y}${pad(d.m)}${pad(d.d)}T${pad(t.hh)}${pad(t.mm)}00`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:filler-${d.key}-${n}@chanlytics`,
        `DTSTAMP:${d.y}${pad(d.m)}${pad(d.d)}T000000Z`,
        `DTSTART;TZID=${tz}:${stamp(s)}`,
        `DTEND;TZID=${tz}:${stamp(e)}`,
        `SUMMARY:${ical(`${service} · ${name}`)}`,
        `DESCRIPTION:${ical(`${name} · +1 917 555 01${last2}`)}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export async function GET(req: Request): Promise<Response> {
  const asked = new URL(req.url).searchParams.get("tz") ?? "";
  const tz = asked && zoneOk(asked) ? asked : "America/New_York";
  return new Response(fillerCalendar(Date.now(), tz), {
    status: 200,
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
