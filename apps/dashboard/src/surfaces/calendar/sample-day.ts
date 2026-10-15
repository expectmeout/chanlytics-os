/**
 * The demo Calendar's day (moved from legacy-bridge/today-sample/calendar.ts when Today's own sample went): four
 * yesterday, two of them still to mark; six today (the day module's cap cuts one), three tomorrow, two open times today.
 * Between them every way a visit stands that its sheet draws: kept, missed, not marked yet, booked, a request a booking
 * tool sent, a lunch that is nobody's, someone the calendar names that People does not hold, and the people's own facts
 * (their standing, business, deal, step and last word). Busy: twelve on the calendar today, seven tomorrow, one open time
 * left. Unreadable: connected and could not be read, with the sentence the owner gets.
 */
import {
  feedProblemWords,
  zoneDayKey,
  type CalendarDayDto,
  type CalendarItemDto,
  type CalendarPersonFactsDto,
  type CalendarWeekDto,
  MIN_MS,
} from "@chanlytics/contracts";
import { ZONE, type SampleClock, type SampleDay } from "./sample-clock";

type SamplePerson = NonNullable<CalendarItemDto["person"]>;

const person = (id: string, name: string, more: Partial<SamplePerson> = {}): SamplePerson => ({
  id,
  name,
  via: "phone" as const,
  thread: `t-${id}`,
  reply_wire: "sms",
  ...more,
});

/** A person's facts as the board's read carries them: active, nothing else said, unless `more` says it. */
const sampleFacts = (more: Partial<CalendarPersonFactsDto>): CalendarPersonFactsDto => ({
  state: "active",
  business: null,
  deal: null,
  step: null,
  last: { at: null, by: "No contact recorded" },
  phone: null,
  email: null,
  ...more,
});

/**
 * An item: its id, its slot (hour, minute, minutes long and the days after today, before it where negative), its title,
 * and what else the read carries of it (who it is with, its row in the record, a booking tool's facts, the event's own).
 */
type SampleItem = (
  id: string,
  slot: readonly [number, number, number, number?],
  title: string,
  more?: Partial<CalendarItemDto>,
) => CalendarItemDto;

const itemsOf = (clock: SampleClock): SampleItem => {
  const { at } = clock;
  return (id, [h, m, dur, dayOffset = 0], title, more = {}) => ({
    id,
    start: at(h, m, dayOffset),
    end: at(h, m + dur, dayOffset),
    title,
    all_day: false,
    person: null,
    visit: { id: `v-${id}`, status: "booked" },
    ...more,
  });
};

/** Yesterday: one kept, one missed, and two nobody has said anything of yet (the board's "2 to mark"). */
function yesterdayItems(item: SampleItem): CalendarItemDto[] {
  return [
    item("y1", [10, 0, 60, -1], "Cut", {
      person: person("k-marta", "Marta Ruiz"),
      visit: { id: "v-y1", status: "kept" },
    }),
    item("y2", [13, 0, 45, -1], "Gloss", {
      person: person("k-lena", "Lena Park"),
      visit: { id: "v-y2", status: "missed" },
    }),
    item("y3", [15, 0, 90, -1], "Color", {
      person: person("k-nora", "Nora Quint", { facts: sampleFacts({ state: "quiet" }) }),
    }),
    item("y4", [17, 30, 45, -1], "Cut", { person: person("k-joel", "Joel Price") }),
  ];
}

/** Today: six, a lunch that is nobody's and a name People does not hold among them, and two people with their facts. */
function todayItems(item: SampleItem, clock: SampleClock): CalendarItemDto[] {
  const { ago } = clock;
  const renata = sampleFacts({
    business: "Solís Studio",
    last: { at: ago(2 * 24 * 60), by: "They wrote" },
    phone: "+15555550134",
  });
  const dulce = sampleFacts({
    deal: { deal_stage: "proposed", deal_service: "Package", deal_proposed_at: ago(6 * 24 * 60) },
    last: { at: ago(26 * 60), by: "Your team replied" },
    phone: "+15555550152",
  });
  return [
    item("a1", [9, 0, 60], "Gloss", { person: person("k-bea", "Bea Lind") }),
    item("a2", [10, 30, 90], "Color treatment", { person: person("k-ana", "Ana Reyes") }),
    // A lunch: nobody's, so nothing is asked of it and it offers no act.
    item("a3", [12, 0, 45], "Lunch", { visit: null }),
    item("a4", [14, 0, 60], "Gel manicure", { person: person("k-renata", "Renata Solís", { facts: renata }) }),
    // Someone the event names whom People does not hold: their number, and Add to People.
    item("a5", [15, 30, 30], "Consultation · Sofía Marín", {
      guess: "Sofía Marín",
      contacts: { phones: ["+15555550177"], emails: [] },
      consultation: true,
    }),
    item("a6", [17, 0, 90], "Color", { person: person("k-dulce", "Dulce Amaro", { facts: dulce }) }),
  ];
}

/** Tomorrow: a step due, a request a booking tool sent (requested, not booked), and someone who asked to stop. */
function tomorrowItems(item: SampleItem, tomorrow: string): CalendarItemDto[] {
  const marco = sampleFacts({
    step: { step_id: "s-marco", step_body: "Send aftercare tips", step_due_on: tomorrow },
    phone: "+15555550118",
  });
  return [
    item("b1", [9, 30, 60, 1], "Cut", { person: person("k-marco", "Marco Ibáñez", { facts: marco }) }),
    item("b2", [11, 0, 60, 1], "Gloss", {
      source: "notice",
      tool: "Booksy",
      service: "Gloss",
      staff: "Ana",
      price: "$45",
      guess: "Tom Ellis",
      contacts: { phones: ["+15555550190"], emails: [] },
      visit: { id: "v-b2", status: "proposed" },
    }),
    item("b3", [15, 0, 60, 1], "Gel manicure", { person: person("k-priya", "Priya Nair", { opted_out: true }) }),
  ];
}

/** Busy: twelve on the calendar today, seven tomorrow, one open time left. */
function makeBusy(today: CalendarDayDto, tomorrow: CalendarDayDto, item: SampleItem, clock: SampleClock): void {
  today.items.push(
    item("a7", [9, 30, 30], "Consultation", { person: person("k-lucia", "Lucía Ferreira") }),
    item("a8", [11, 0, 60], "Cut", { person: person("k-noor", "Noor Haddad") }),
    item("a9", [12, 0, 60], "Cut and gloss", { person: person("k-omar", "Omar Haddad") }),
    item("a10", [13, 30, 90], "Color", { person: person("k-iris", "Iris Kowalski") }),
    item("a11", [16, 0, 45], "Gel manicure", { person: person("k-camila", "Camila Duarte") }),
    item("a12", [18, 30, 60], "Gloss", { person: person("k-zoe", "Zoe Martin") }),
  );
  today.items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  today.windows = [{ start: clock.at(13, 0), end: clock.at(13, 30) }];
  tomorrow.items.push(
    item("b4", [10, 30, 90, 1], "Color treatment", { person: person("k-emily", "Emily Chen") }),
    item("b5", [13, 0, 60, 1], "Cut", { person: person("k-alejandra", "Alejandra Peña") }),
    item("b6", [14, 0, 45, 1], "Consultation"),
    item("b7", [16, 30, 60, 1], "Gloss", { person: person("k-dulce", "Dulce Amaro") }),
  );
  tomorrow.items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/**
 * A calendar that is connected and could not be read: no day, no next open time, and the sentence the owner gets.
 * "settings" is the one that was invisible — a config row the schema refused, which took the address with it and used
 * to come back as "no calendar connected".
 */
function makeUnreadable(dto: CalendarWeekDto, now: Date): void {
  dto.feed = {
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
  dto.next_opening = null;
  for (const d of dto.days) {
    d.items = [];
    d.windows = [];
  }
}

/** The days as the route sends them: the calendar's own sample (surfaces/calendar/sample.ts pads it to a window). */
export function sampleCalendarDto(clock: SampleClock, day: SampleDay): CalendarWeekDto {
  const { now, midnight, at } = clock;
  const item = itemsOf(clock);
  const dayKey = (offset: number) => zoneDayKey(midnight + offset * 24 * 60 * MIN_MS + 12 * 60 * MIN_MS, ZONE);
  const yesterday: CalendarDayDto = { key: dayKey(-1), items: yesterdayItems(item), windows: [] };
  const today: CalendarDayDto = {
    key: dayKey(0),
    items: todayItems(item, clock),
    windows: [
      { start: at(13, 0), end: at(13, 30) },
      { start: at(16, 0), end: at(17, 0) },
    ],
  };
  const tomorrow: CalendarDayDto = {
    key: dayKey(1),
    items: tomorrowItems(item, dayKey(1)),
    windows: [
      { start: at(12, 0, 1), end: at(15, 0, 1) },
      { start: at(16, 0, 1), end: at(18, 0, 1) },
    ],
  };
  const calendarDto: CalendarWeekDto = {
    timezone: ZONE,
    from: dayKey(-1),
    to: dayKey(6),
    feed: {
      present: true,
      state: "ok",
      read_at: now.toISOString(),
      events: 0,
      recurring_expanded: 0,
      skipped_recurring: 0,
      source: "Google Calendar",
    },
    hours: null,
    closures: [],
    rules: null,
    services: [],
    booking_link: "https://book.example.com/sample",
    next_opening: { start: at(13, 0), end: at(13, 30) },
    days: [yesterday, today, tomorrow, ...[2, 3, 4, 5, 6].map((d) => ({ key: dayKey(d), items: [], windows: [] }))],
  };
  if (day === "busy") makeBusy(today, tomorrow, item, clock);
  // The feed's count is the rows'.
  calendarDto.feed.events = calendarDto.days.reduce((n, d) => n + d.items.length, 0);
  if (day === "unreadable") makeUnreadable(calendarDto, now);
  return calendarDto;
}
