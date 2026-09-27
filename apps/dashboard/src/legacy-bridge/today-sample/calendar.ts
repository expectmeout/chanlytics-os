/**
 * The calendar: six today (the day module's cap cuts one), three tomorrow, two open times today. Busy: twelve on the
 * calendar today, seven tomorrow, one open time left. Unreadable: connected and could not be read, with the sentence
 * the owner gets.
 */
import {
  toCalendarVM,
  feedProblemWords,
  zoneDayKey,
  type CalendarWeekDto,
  type CalendarVM,
  MIN_MS,
} from "@chanlytics/contracts";
import { ZONE, type SampleClock, type SampleDay } from "./clock";

const person = (id: string, name: string) => ({ id, name, via: "phone" as const });

export function sampleCalendar(clock: SampleClock, day: SampleDay): { vm: CalendarVM; fetchedAt: number } {
  const busy = day === "busy";
  const unreadable = day === "unreadable";
  const { nowMs, now, midnight, at } = clock;
  const item = (
    id: string,
    h: number,
    m: number,
    dur: number,
    title: string,
    who: { id: string; name: string; via: "phone" } | null = null,
    dayOffset = 0,
  ) => ({ id, start: at(h, m, dayOffset), end: at(h, m + dur, dayOffset), title, all_day: false, person: who });
  const dayKey = (offset: number) => zoneDayKey(midnight + offset * 24 * 60 * MIN_MS + 12 * 60 * MIN_MS, ZONE);
  const calendarDto: CalendarWeekDto = {
    timezone: ZONE,
    from: dayKey(0),
    to: dayKey(6),
    feed: {
      present: true,
      state: "ok",
      read_at: now.toISOString(),
      events: 9,
      recurring_expanded: 0,
      skipped_recurring: 0,
      source: "Google Calendar",
    },
    hours: null,
    closures: [],
    rules: null,
    services: [],
    booking_link: null,
    next_opening: { start: at(13, 0), end: at(13, 30) },
    days: [
      {
        key: dayKey(0),
        items: [
          item("a1", 9, 0, 60, "Gloss", person("k-bea", "Bea Lind")),
          item("a2", 10, 30, 90, "Color treatment", person("k-ana", "Ana Reyes")),
          item("a3", 12, 0, 45, "Cut"),
          item("a4", 14, 0, 60, "Gel manicure", person("k-renata", "Renata Solís")),
          item("a5", 15, 30, 30, "Consultation"),
          item("a6", 17, 0, 90, "Color", person("k-dulce", "Dulce Amaro")),
        ],
        windows: [
          { start: at(13, 0), end: at(13, 30) },
          { start: at(16, 0), end: at(17, 0) },
        ],
      },
      {
        key: dayKey(1),
        items: [
          item("b1", 9, 30, 60, "Cut", person("k-marco", "Marco Ibáñez"), 1),
          item("b2", 11, 0, 60, "Gloss", null, 1),
          item("b3", 15, 0, 60, "Gel manicure", person("k-priya", "Priya Nair"), 1),
        ],
        windows: [
          { start: at(12, 0, 1), end: at(15, 0, 1) },
          { start: at(16, 0, 1), end: at(18, 0, 1) },
        ],
      },
      ...[2, 3, 4, 5, 6].map((d) => ({ key: dayKey(d), items: [], windows: [] })),
    ],
  };
  // Busy: twelve on the calendar today, seven tomorrow, one open time left. The feed's count is the rows'.
  if (busy) {
    calendarDto.days[0].items.push(
      item("a7", 9, 30, 30, "Consultation", person("k-lucia", "Lucía Ferreira")),
      item("a8", 11, 0, 60, "Cut", person("k-noor", "Noor Haddad")),
      item("a9", 12, 0, 60, "Cut and gloss", person("k-omar", "Omar Haddad")),
      item("a10", 13, 30, 90, "Color", person("k-iris", "Iris Kowalski")),
      item("a11", 16, 0, 45, "Gel manicure", person("k-camila", "Camila Duarte")),
      item("a12", 18, 30, 60, "Gloss", person("k-zoe", "Zoe Martin")),
    );
    calendarDto.days[0].items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    calendarDto.days[0].windows = [{ start: at(13, 0), end: at(13, 30) }];
    calendarDto.days[1].items.push(
      item("b4", 10, 30, 90, "Color treatment", person("k-emily", "Emily Chen"), 1),
      item("b5", 13, 0, 60, "Cut", person("k-alejandra", "Alejandra Peña"), 1),
      item("b6", 14, 0, 45, "Consultation", null, 1),
      item("b7", 16, 30, 60, "Gloss", person("k-dulce", "Dulce Amaro"), 1),
    );
    calendarDto.days[1].items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
  calendarDto.feed.events = calendarDto.days.reduce((n, d) => n + d.items.length, 0);
  // A calendar that is connected and could not be read: no day, no next open time, and the sentence the owner
  // gets. "settings" is the one that was invisible — a config row the schema refused, which took the address
  // with it and used to come back as "no calendar connected".
  if (unreadable) {
    calendarDto.feed = {
      present: true,
      state: "unavailable",
      source: "Google Calendar",
      events: 0,
      recurring_expanded: 0,
      skipped_recurring: 0,
      reason: "settings",
      status: null,
      problem: feedProblemWords("settings"),
      read_at: null,
      checked_at: now.toISOString(),
      stale: false,
      dropped: 0,
    };
    calendarDto.next_opening = null;
    calendarDto.days.forEach((d) => {
      d.items = [];
      d.windows = [];
    });
  }
  return { vm: toCalendarVM(calendarDto, now), fetchedAt: nowMs };
}
