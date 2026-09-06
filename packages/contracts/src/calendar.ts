/**
 * Calendar — the owner's calendar as the receptionist reads it.
 *
 * A viewer, never a scheduler: what the feed says is taken, the hours and
 * closures the business keeps, and the windows the receptionist would offer
 * a caller — the same windows the phone tool and the assistant compute
 * (availability.ts), so the page shows what callers are told. Nothing is
 * booked here; the booking link does that, whichever tool stands behind it.
 *
 * The DTO is what the route returns; the view model is what the page draws:
 * a week of day columns with the mockup's own geometry (hours down, days
 * across), bands where the business is closed, blocks where the calendar is
 * taken, dashed windows where it is open. Pure; tests feed fixtures.
 */
import type { Closure, Hours } from "./config";
import { BOOKING_DEFAULTS, clockInZone, closedOn, dayInZone, dayIntervals, type BookingRulesLike } from "./availability";

export interface CalendarItemDto {
  id: string;
  /** ISO instants. */
  start: string;
  end: string;
  title: string;
  all_day: boolean;
  /** A person in People whose name the title carries, when one does. */
  person: { id: string; name: string } | null;
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
  state: "ok" | "unavailable" | "none";
  read_at: string | null;
  events: number;
  recurring_expanded: number;
  skipped_recurring: number;
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
  booking_link: string | null;
  days: CalendarDayDto[];
  error?: string;
}

/* ------------------------------------------------------------ day keys */

const DAY_MS = 86_400_000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const diff = Math.max(0, now.getTime() - Date.parse(iso));
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < DAY_MS) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / DAY_MS)}d ago`;
}

/** "Offers times at least 2h ahead · 15 min between appointments · up to 14 days out · 30-min slots". */
export function rulesLine(rules: BookingRulesLike | null | undefined): string {
  const r = { ...BOOKING_DEFAULTS, ...(rules ?? {}) };
  const parts = [`at least ${r.lead_hours}h ahead`];
  if (r.buffer_min > 0) parts.push(`${r.buffer_min} min between appointments`);
  parts.push(`up to ${r.max_days_ahead} days out`, `${r.slot_min}-min slots`);
  return `Offers times ${parts.join(" · ")}`;
}

/* ------------------------------------------------------------ the view */

export interface CalendarBlockVM {
  id: string;
  /** Hours from midnight in the business's zone, fractional. */
  t: number;
  /** Minutes. */
  dur: number;
  title: string;
  /** "2:00 – 3:00 PM" */
  time: string;
  person: { id: string; name: string } | null;
  /** The instants, for the panel. */
  start: string;
  end: string;
}

export interface CalendarBandVM {
  /** Hours from midnight. */
  from: number;
  to: number;
  label: string | null;
}

export interface CalendarWindowVM {
  t: number;
  dur: number;
  /** "2:30 – 4:00 PM" */
  label: string;
}

export interface CalendarDayVM {
  key: string;
  dow: string;
  date: string;
  long: string;
  today: boolean;
  past: boolean;
  closed: { yes: boolean; note: string | null };
  /** The bands where the business is closed, in hours from midnight. */
  bands: CalendarBandVM[];
  blocks: CalendarBlockVM[];
  allDay: CalendarBlockVM[];
  windows: CalendarWindowVM[];
}

export interface CalendarVM {
  timezone: string;
  from: string;
  to: string;
  /** "Sep 7 – 13" */
  rangeLabel: string;
  /** The hours the grid draws, whole hours. */
  hours: { start: number; end: number };
  days: CalendarDayVM[];
  today: string;
  /** Where the now line sits, hours from midnight, when today is in the week. */
  now: number | null;
  feed: { present: boolean; state: "ok" | "unavailable" | "none"; line: string; events: number };
  stats: { events: number; windows: number; next: string };
  rules: string;
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
    person: item.person,
    start: item.start,
    end: item.end,
  };
}

/**
 * The week as the page draws it. `now` decides today, the now line, which
 * days are past, and the next opening.
 */
export function toCalendarVM(dto: CalendarWeekDto, now = new Date()): CalendarVM {
  const tz = dto.timezone;
  const todayKey = dayInZone(tz, now.getTime()).key;
  const nowMs = now.getTime();

  // The grid's hours: the business's own, an hour of air on each side, and
  // stretched to hold anything the calendar puts outside them.
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
    const dayStartMs = Date.UTC(y, m - 1, dd) + 0; // placeholder, replaced below via zone math
    void dayStartMs;
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
    // The day's instants in the business's zone, for clipping multi-day items.
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
  const feedLine = dto.feed.state === "ok"
    ? `From your calendar · read ${ago ?? "just now"} · ${dto.feed.events} event${dto.feed.events === 1 ? "" : "s"}${dto.feed.skipped_recurring ? ` · ${dto.feed.skipped_recurring} repeating rule${dto.feed.skipped_recurring === 1 ? "" : "s"} read once` : ""}`
    : dto.feed.state === "unavailable"
      ? `Your calendar could not be read${ago ? ` · last read ${ago}` : ""}`
      : "No calendar connected";

  const nowIn = days.some((d) => d.today) ? hoursOf(tz, nowMs) : null;
  const last = dto.days[dto.days.length - 1]?.key ?? dto.from;
  const sameMonth = dto.from.slice(0, 7) === last.slice(0, 7);
  return {
    timezone: tz,
    from: dto.from,
    to: last,
    rangeLabel: `${shortDate(dto.from)} – ${sameMonth ? shortDate(last).replace(/^[A-Za-z]+ /, "") : shortDate(last)}`,
    hours: { start, end },
    days,
    today: todayKey,
    now: nowIn,
    feed: { present: dto.feed.present, state: dto.feed.state, line: feedLine, events: dto.feed.events },
    stats: { events, windows: windowCount, next },
    rules: rulesLine(dto.rules),
    bookingLink: dto.booking_link,
  };
}

/** Midnight of a day key in `tz`, as an instant. */
export function zoneMidnight(tz: string, key: string): number {
  const { y, m, d } = keyParts(key);
  // Two passes over the zone offset cover a DST edge, as localToUtcMs does.
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
