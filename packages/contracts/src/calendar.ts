import { agoWords } from "./time";
/**
 * Calendar — the owner's calendar as the receptionist reads it.
 *
 * A viewer, never a scheduler: what the feed says is taken, the hours and
 * closures the business keeps, and the windows the receptionist would offer
 * a caller — the same windows the phone tool and the assistant compute
 * (availability.ts), so the page shows what callers are told. Nothing is
 * booked here; the booking link does that, whichever tool stands behind it.
 *
 * The DTO is what the route returns for one span of days; the view model is
 * what the page draws — a week or a day on the mockup's own geometry (hours
 * down, days across), a month of counts, or an agenda — with bands where
 * the business is closed, blocks where the calendar is taken, dashed
 * windows where it is open, and the words Settings gave it: the hours, the
 * closures ahead, the booking rules, the services and how long they take.
 * Pure; tests feed fixtures.
 */
import { DAYS, hoursRuns, type Closure, type Hours } from "./config";
import { BOOKING_DEFAULTS, clockInZone, closedOn, dayInZone, dayIntervals, type BookingRulesLike } from "./availability";
import type { FeedFailure } from "./feed-url";
import { formatPhoneDisplay } from "./phone";

export interface CalendarItemDto {
  id: string;
  /** ISO instants. */
  start: string;
  end: string;
  title: string;
  all_day: boolean;
  /** The person in People this appointment is for — by a phone in the event, else a whole name in its words. */
  person: { id: string; name: string; via?: "phone" | "name" } | null;
  /** The event's own words, plain text. */
  description?: string | null;
  location?: string | null;
  /** Phones (E.164) and emails found in the event, for the panel. */
  contacts?: { phones: string[]; emails: string[] };
  /** The client's name as the event gives it, for "Add … to People"; null when the title says nothing name-like. */
  guess?: string | null;
}

export interface CalendarDayDto {
  /** "YYYY-MM-DD" in the business's zone. */
  key: string;
  items: CalendarItemDto[];
  /** The windows the receptionist would offer that day, ISO instants. */
  windows: Array<{ start: string; end: string }>;
}

export interface CalendarFeedDto {
  present: boolean;
  /** "Google Calendar", "Apple Calendar", "Outlook" or "your calendar" — from the address, which stays on the server. */
  source?: string;
  state: "ok" | "unavailable" | "none";
  read_at: string | null;
  events: number;
  recurring_expanded: number;
  skipped_recurring: number;
  /** Why the last read failed, when it did; with "ok" and a reason the read shown is the last good one (stale). */
  reason?: FeedFailure | null;
  /** The HTTP status when the calendar answered with one. */
  status?: number | null;
  /** The reason as a sentence the owner can act on (feedProblemWords). */
  problem?: string | null;
  /** The last fetch failed and what is shown is the previous read. */
  stale?: boolean;
  /** Items left out of the span because a day held more than the board draws. */
  dropped?: number;
}

export interface CalendarServiceDto {
  name: string;
  duration_min: number | null;
  /** Needs a consultation first: the receptionist books the consult, never the service. */
  consult_first: boolean;
}

/** What `GET /api/v1/calendar?from=&days=` returns. */
export interface CalendarWeekDto {
  timezone: string;
  from: string;
  to: string;
  feed: CalendarFeedDto;
  hours: Record<string, Hours | undefined> | null;
  closures: Closure[];
  rules: BookingRulesLike | null;
  services: CalendarServiceDto[];
  booking_link: string | null;
  days: CalendarDayDto[];
  error?: string;
}

/* ------------------------------------------------------------ day keys */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_SHORT: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function keyParts(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m ?? 1, d: d ?? 1 };
}

/** The key `n` days after `key`. */
export function shiftKey(key: string, n: number): string {
  const { y, m, d } = keyParts(key);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}

/** The Monday of the week `key` is in. */
export function mondayOf(key: string): string {
  const { y, m, d } = keyParts(key);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shiftKey(key, -((dow + 6) % 7));
}

export function isDayKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** The span a month view shows: six weeks from the Monday on or before the first. */
export function monthSpan(key: string): { from: string; days: number } {
  return { from: mondayOf(`${key.slice(0, 7)}-01`), days: 42 };
}

/** The first of the month `n` months away from `key`'s month. */
export function shiftMonth(key: string, n: number): string {
  const { y, m } = keyParts(key);
  const at = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** "September 2026" */
export function monthLabelOf(key: string): string {
  const { y, m } = keyParts(key);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 1, 12)));
}

/* ----------------------------------------------------------- the words */

/** "9 AM", "2:30 PM". */
export function clockLabel(t: number): string {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  const ap = h >= 12 && h < 24 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""} ${ap}`;
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function shortDate(key: string): string {
  const { y, m, d } = keyParts(key);
  return SHORT.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function longDate(key: string): string {
  const { y, m, d } = keyParts(key);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function readAgoLabel(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  return agoWords(Date.parse(iso), now.getTime(), { dateAfterMs: Number.POSITIVE_INFINITY });
}

/** "Offers times at least 2h ahead · 15 min between appointments · up to 14 days out · 30-min slots". */
export function rulesLine(rules: BookingRulesLike | null | undefined): string {
  const r = { ...BOOKING_DEFAULTS, ...(rules ?? {}) };
  const parts = [`at least ${r.lead_hours}h ahead`];
  if (r.buffer_min > 0) parts.push(`${r.buffer_min} min between appointments`);
  parts.push(`up to ${r.max_days_ahead} days out`, `${r.slot_min}-min slots`);
  return `Offers times ${parts.join(" · ")}`;
}

/** "Mon–Fri 10:00–19:00", "Sat 10:00–16:00", "Sun closed" — one line per run of days with the same hours. */
export function hoursLines(hours: Record<string, Hours | undefined> | null | undefined): string[] {
  if (!hours) return [];
  const clean: Record<string, Hours> = {};
  for (const d of DAYS) if (hours[d]) clean[d] = hours[d] as Hours;
  return hoursRuns(clean).map((r) => `${DAY_SHORT[r.from] ?? r.from}${r.to !== r.from ? `–${DAY_SHORT[r.to] ?? r.to}` : ""} ${r.text.toLowerCase() === "closed" ? "closed" : r.text}`);
}

/* ------------------------------------------------------------ the view */

export interface CalendarBlockVM {
  id: string;
  /** Hours from midnight in the business's zone, fractional. */
  t: number;
  /** Minutes. */
  dur: number;
  title: string;
  /** "2 – 3:30 PM" */
  time: string;
  person: { id: string; name: string; via: "phone" | "name" | null } | null;
  description: string | null;
  location: string | null;
  /** Display-formatted phones (and the same in E.164, for the add), and the emails the event carried. */
  contacts: { phones: string[]; e164: string[]; emails: string[] };
  /** The client's name as the event gives it, or null. */
  guess: string | null;
  start: string;
  end: string;
}

export interface CalendarBandVM {
  from: number;
  to: number;
  label: string | null;
}

export interface CalendarWindowVM {
  t: number;
  dur: number;
  /** "2:30 – 4 PM" */
  label: string;
}

export interface CalendarDayVM {
  key: string;
  dow: string;
  date: string;
  long: string;
  /** "8" — the day of the month, for the month grid. */
  dayNum: string;
  today: boolean;
  past: boolean;
  closed: { yes: boolean; note: string | null };
  bands: CalendarBandVM[];
  blocks: CalendarBlockVM[];
  allDay: CalendarBlockVM[];
  windows: CalendarWindowVM[];
}

export interface CalendarServiceVM {
  name: string;
  duration: number | null;
  consultFirst: boolean;
  /** "Balayage · 90 min" */
  label: string;
}

export interface CalendarClosureVM {
  key: string;
  /** "Sep 12" or "Sep 12 – 14" */
  label: string;
  note: string | null;
}

export interface CalendarVM {
  timezone: string;
  from: string;
  to: string;
  /** "Sep 7 – 13" */
  rangeLabel: string;
  /** "September 2026" — the month a six-week span shows, else the month of `from`. */
  monthLabel: string;
  /** The hours the grid draws, whole hours. */
  hours: { start: number; end: number };
  days: CalendarDayVM[];
  today: string;
  /** Where the now line sits, hours from midnight, when today is in the span. */
  now: number | null;
  feed: { present: boolean; state: "ok" | "unavailable" | "none"; line: string; events: number; source: string; problem: string | null; stale: boolean };
  stats: { events: number; windows: number; next: string };
  rules: string;
  hoursLines: string[];
  closuresAhead: CalendarClosureVM[];
  services: CalendarServiceVM[];
  bookingLink: string | null;
}

function hoursOf(tz: string, ms: number): number {
  const c = clockInZone(tz, ms);
  return c.hh + c.mm / 60;
}

function spanLabel(t1: number, t2: number): string {
  const a = clockLabel(t1);
  const b = clockLabel(t2);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a} – ${b}`;
}

function toBlock(item: CalendarItemDto, tz: string, dayStartMs: number, dayEndMs: number): CalendarBlockVM {
  const s = Math.max(Date.parse(item.start), dayStartMs);
  const e = Math.min(Date.parse(item.end), dayEndMs);
  const t = s === dayStartMs ? 0 : hoursOf(tz, s);
  const tEnd = e === dayEndMs ? 24 : hoursOf(tz, e);
  return {
    id: item.id,
    t,
    dur: Math.max(15, Math.round((tEnd - t) * 60)),
    title: item.title || "Busy",
    time: spanLabel(t, tEnd),
    person: item.person ? { id: item.person.id, name: item.person.name, via: item.person.via ?? null } : null,
    description: item.description ?? null,
    location: item.location ?? null,
    contacts: { phones: (item.contacts?.phones ?? []).map((p) => formatPhoneDisplay(p) ?? p), e164: item.contacts?.phones ?? [], emails: item.contacts?.emails ?? [] },
    guess: item.guess ?? null,
    start: item.start,
    end: item.end,
  };
}

/**
 * The span as the page draws it. `now` decides today, the now line, which
 * days are past, the next opening and the closures ahead.
 */
export function toCalendarVM(dto: CalendarWeekDto, now = new Date()): CalendarVM {
  const tz = dto.timezone;
  const todayKey = dayInZone(tz, now.getTime()).key;
  const nowMs = now.getTime();

  // The grid's hours: the business's own, an hour of air on each side.
  let start = 24;
  let end = 0;
  for (const h of Object.values(dto.hours ?? {})) {
    for (const [o, c] of dayIntervals(h)) {
      const oh = Number(o.split(":")[0]);
      const ch = Number(c.split(":")[0]) + (Number(c.split(":")[1]) > 0 ? 1 : 0);
      if (Number.isFinite(oh)) start = Math.min(start, oh);
      if (Number.isFinite(ch)) end = Math.max(end, ch);
    }
  }
  if (start >= end) { start = 8; end = 20; }
  start = Math.max(0, start - 1);
  end = Math.min(24, end + 1);

  const days: CalendarDayVM[] = dto.days.map((d) => {
    const { y, m, d: dd } = keyParts(d.key);
    const weekday = DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()].toLowerCase();
    const closure = dto.closures.find((c) => c.date <= d.key && d.key <= (c.until && c.until >= c.date ? c.until : c.date)) ?? null;
    const intervals = dayIntervals(dto.hours?.[weekday]);
    const closedDay = closedOn(dto.closures, d.key) || intervals.length === 0;
    const bands: CalendarBandVM[] = [];
    if (closedDay) {
      bands.push({ from: start, to: end, label: closure?.note ? `Closed · ${closure.note}` : "Closed" });
    } else {
      let cursor = start;
      for (const [o, c] of intervals) {
        const oh = Number(o.split(":")[0]) + Number(o.split(":")[1]) / 60;
        const ch = Number(c.split(":")[0]) + Number(c.split(":")[1]) / 60;
        if (oh > cursor) bands.push({ from: cursor, to: oh, label: null });
        cursor = Math.max(cursor, ch);
      }
      if (cursor < end) bands.push({ from: cursor, to: end, label: null });
    }
    const zoneDayStart = zoneMidnight(tz, d.key);
    const zoneDayEnd = zoneMidnight(tz, shiftKey(d.key, 1));
    const timed: CalendarBlockVM[] = [];
    const allDay: CalendarBlockVM[] = [];
    for (const item of d.items) {
      const s = Date.parse(item.start);
      const e = Date.parse(item.end);
      if (!(e > zoneDayStart && s < zoneDayEnd)) continue;
      const block = toBlock(item, tz, zoneDayStart, zoneDayEnd);
      if (item.all_day || (s <= zoneDayStart && e >= zoneDayEnd)) allDay.push({ ...block, t: 0, dur: 24 * 60, time: "All day" });
      else timed.push(block);
    }
    timed.sort((a, b) => a.t - b.t);
    const windows: CalendarWindowVM[] = d.windows.map((w) => {
      const t = hoursOf(tz, Date.parse(w.start));
      const tEnd = hoursOf(tz, Date.parse(w.end));
      return { t, dur: Math.round((tEnd - t) * 60), label: spanLabel(t, tEnd) };
    });
    return {
      key: d.key,
      dow: DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()],
      date: shortDate(d.key),
      long: longDate(d.key),
      dayNum: String(dd),
      today: d.key === todayKey,
      past: d.key < todayKey,
      closed: { yes: closedDay, note: closure?.note ?? null },
      bands,
      blocks: timed,
      allDay,
      windows,
    };
  });

  const events = days.reduce((a, d) => a + d.blocks.length + d.allDay.length, 0);
  const windowCount = days.reduce((a, d) => a + d.windows.length, 0);
  let next = "—";
  outer: for (const d of days) {
    for (const w of d.windows) {
      const at = zoneMidnight(tz, d.key) + w.t * 3_600_000;
      if (at >= nowMs) { next = `${d.today ? "today" : d.dow} ${clockLabel(w.t)}`; break outer; }
    }
  }
  const ago = readAgoLabel(dto.feed.read_at, now);
  const stale = dto.feed.state === "ok" && !!dto.feed.stale;
  const feedLine = dto.feed.state === "ok"
    ? `From ${dto.feed.source ?? "your calendar"} · read ${ago ?? "just now"}${stale ? " · could not be refreshed" : ""} · ${dto.feed.events} event${dto.feed.events === 1 ? "" : "s"}${dto.feed.skipped_recurring ? ` · ${dto.feed.skipped_recurring} repeating rule${dto.feed.skipped_recurring === 1 ? "" : "s"} read once` : ""}${dto.feed.dropped ? ` · ${dto.feed.dropped} more not shown` : ""}`
    : dto.feed.state === "unavailable"
      ? `Your calendar could not be read${ago ? ` · last read ${ago}` : ""}`
      : "No calendar connected";

  const nowIn = days.some((d) => d.today) ? hoursOf(tz, nowMs) : null;
  const last = dto.days[dto.days.length - 1]?.key ?? dto.from;
  const sameMonth = dto.from.slice(0, 7) === last.slice(0, 7);
  const closuresAhead: CalendarClosureVM[] = dto.closures
    .filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6)
    .map((c) => ({
      key: c.date,
      label: c.until && c.until > c.date ? `${shortDate(c.date)} – ${c.until.slice(0, 7) === c.date.slice(0, 7) ? c.until.slice(8).replace(/^0/, "") : shortDate(c.until)}` : shortDate(c.date),
      note: c.note ?? null,
    }));
  const services: CalendarServiceVM[] = (dto.services ?? []).map((s) => ({
    name: s.name,
    duration: s.duration_min,
    consultFirst: s.consult_first,
    label: `${s.name}${s.duration_min ? ` · ${s.duration_min} min` : ""}${s.consult_first ? " · consult first" : ""}`,
  }));
  return {
    timezone: tz,
    from: dto.from,
    to: last,
    rangeLabel: `${shortDate(dto.from)} – ${sameMonth ? shortDate(last).replace(/^[A-Za-z]+ /, "") : shortDate(last)}`,
    monthLabel: monthLabelOf(dto.days.length >= 28 ? shiftKey(dto.from, 7) : dto.from),
    hours: { start, end },
    days,
    today: todayKey,
    now: nowIn,
    feed: { present: dto.feed.present, state: dto.feed.state, line: feedLine, events: dto.feed.events, source: dto.feed.source ?? "your calendar", problem: dto.feed.problem ?? null, stale },
    stats: { events, windows: windowCount, next },
    rules: rulesLine(dto.rules),
    hoursLines: hoursLines(dto.hours),
    closuresAhead,
    services,
    bookingLink: dto.booking_link,
  };
}

/** Midnight of a day key in `tz`, as an instant. */
export function zoneMidnight(tz: string, key: string): number {
  const { y, m, d } = keyParts(key);
  const guess = Date.UTC(y, m - 1, d);
  const off1 = zoneOffsetOf(tz, guess);
  const first = guess - off1;
  const off2 = zoneOffsetOf(tz, first);
  return guess - off2;
}

function zoneOffsetOf(tz: string, atMs: number): number {
  const c = clockInZone(tz, atMs);
  const day = dayInZone(tz, atMs);
  return Date.UTC(day.y, day.m - 1, day.d, c.hh, c.mm, c.ss) - Math.floor(atMs / 1000) * 1000;
}

/* ------------------------------------------------- the window and the views */

export type CalendarView = "week" | "day" | "month" | "agenda";

/** The days a view needs, from the day it looks at: a week (the day's week), six weeks for a month, two weeks for the agenda. */
export function spanForView(view: CalendarView, anchor: string): { from: string; days: number } {
  if (view === "month") return monthSpan(anchor);
  if (view === "agenda") return { from: anchor, days: 14 };
  return { from: mondayOf(anchor), days: 7 };
}

/**
 * The window loaded around an anchor: nine weeks from the Monday a week
 * before the anchor's month starts — enough for the month grid, the anchor's
 * week and its neighbours, and two weeks of agenda from any day in it, so
 * switching views and moving a week are slices, not reads.
 */
export function windowFor(anchor: string): { from: string; days: number } {
  return { from: shiftKey(mondayOf(`${anchor.slice(0, 7)}-01`), -7), days: 63 };
}

/** Whether contiguous loaded days cover `count` days from `from`. */
export function coversSpan(days: ReadonlyArray<{ key: string }>, from: string, count: number): boolean {
  if (!days.length || count < 1) return false;
  return days[0].key <= from && days[days.length - 1].key >= shiftKey(from, count - 1);
}

/** A day's frame from its key alone — the shape a view draws before the day's data has landed. */
export function frameOf(key: string, todayKey: string): { key: string; dow: string; date: string; long: string; dayNum: string; today: boolean; past: boolean } {
  const { y, m, d } = keyParts(key);
  return {
    key,
    dow: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
    date: shortDate(key),
    long: longDate(key),
    dayNum: String(d),
    today: key === todayKey,
    past: key < todayKey,
  };
}
