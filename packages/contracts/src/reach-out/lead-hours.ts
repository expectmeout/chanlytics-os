/**
 * A listing's hours as the send window reads them (Reach out, Part 3): Maps' own words ("9 AM to 6 PM",
 * "9:30 AM to 12 PM, 1 to 5:30 PM", "Closed", "Open 24 hours"), stored as `[{day, hours}]` (00144:34), turned into open
 * windows per weekday in minutes after the business's local midnight. A window past midnight runs on (6 PM to 2 AM is
 * 1080 to 1560). Hours that cannot be read are the default week, Monday to Friday, nine to five, and `read` says so.
 * One day whose words do not read is that day of the default week, never a day closed; a day this cannot name leaves the
 * whole week unread. The display readers (lead-facts.ts) are left as they are: they read one range for a line of text.
 *
 * The same reading says a cold email's opening where the week reads whole (leadFactOf, decision 0078): "is open until
 * 5 PM on weekdays and until 1 PM on Saturdays", or the listing's rating where its hours say nothing whole.
 */
import { weekdayNamed, type WeekdayKey } from "../calendar/day-keys";
import { DAYS } from "../config/workspace-config/config-rules";
import { leadCalledByOf } from "../leads/search/called-by";
import type { WrittenOpening } from "./reach-out-words";

export interface OpenWindow {
  from: number;
  to: number;
}
export type WeekHours = Record<WeekdayKey, OpenWindow[]>;

const NINE_TO_FIVE: OpenWindow[] = [{ from: 9 * 60, to: 17 * 60 }];
export const DEFAULT_WEEK: WeekHours = {
  mon: NINE_TO_FIVE,
  tue: NINE_TO_FIVE,
  wed: NINE_TO_FIVE,
  thu: NINE_TO_FIVE,
  fri: NINE_TO_FIVE,
  sat: [],
  sun: [],
};

/** A listing's own two letters for a day ("Mo", "Th"), which no sentence reads as one (day-keys.ts weekdayNamed). */
const LISTING_DAY = new Map<string, WeekdayKey>([
  ["mo", "mon"],
  ["tu", "tue"],
  ["we", "wed"],
  ["th", "thu"],
  ["fr", "fri"],
  ["sa", "sat"],
  ["su", "sun"],
]);

/** "Monday", "Mon.", "Monday (Labor Day)", "Mo": the weekday, or null. */
const dayNameOf = (raw: unknown): WeekdayKey | null => {
  const word = String(raw ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\./g, "")
    .trim()
    .toLowerCase();
  return weekdayNamed(word) ?? LISTING_DAY.get(word) ?? null;
};

/**
 * "9", "9:30", "12 PM", "noon", "0:30": the time on a twelve-hour clock (minutes after twelve), and its meridiem when one
 * was said or is certain. Noon is twelve PM and midnight twelve AM, as on the clock; an hour of zero is the morning.
 * Null for anything else.
 */
function timeOf(s: string): { min: number; meridiem: "am" | "pm" | null } | null {
  const t = s.trim().toLowerCase().replace(/\./g, "");
  if (t === "noon") return { min: 0, meridiem: "pm" };
  if (t === "midnight") return { min: 0, meridiem: "am" };
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  if (mm > 59) return null;
  if (hh === 0) return m[3] ? null : { min: mm, meridiem: "am" };
  if (hh > 12) return null;
  return { min: (hh % 12) * 60 + mm, meridiem: (m[3] as "am" | "pm" | undefined) ?? null };
}
const withMeridiem = (min: number, meridiem: "am" | "pm") => (meridiem === "pm" ? min + 12 * 60 : min);

/** One range: "9 AM to 6 PM", "8 to 11 AM", "6 PM–2 AM". Null when it is not one. */
function rangeOf(s: string): OpenWindow | null {
  const parts = s.split(/\s*(?:to|–|—|-)\s*/i);
  if (parts.length !== 2) return null;
  const a = timeOf(parts[0]);
  const b = timeOf(parts[1]);
  if (!a || !b || !b.meridiem) return null;
  const to0 = withMeridiem(b.min, b.meridiem);
  // A start with no meridiem borrows its end's, unless that puts it after the end ("11 to 2 PM" is 11 AM).
  let from = a.meridiem ? withMeridiem(a.min, a.meridiem) : withMeridiem(a.min, b.meridiem);
  if (!a.meridiem && from > to0) from = a.min;
  // Midnight at the end is the day's end; an end before the start runs past midnight.
  const to = to0 === 0 ? 24 * 60 : to0 <= from ? to0 + 24 * 60 : to0;
  return { from, to };
}

/** One day's words: every range, or all day, or closed. A note in brackets is not hours. Null when it does not read. */
function dayOf(words: string): OpenWindow[] | null {
  const w = words
    .replace(/\([^)]*\)/g, "")
    .trim()
    .toLowerCase();
  if (w === "closed") return [];
  if (w === "open 24 hours" || w === "24 hours") return [{ from: 0, to: 24 * 60 }];
  const ranges = w.split(/\s*,\s*/).map(rangeOf);
  return ranges.every((r): r is OpenWindow => r !== null) && ranges.length > 0 ? ranges : null;
}

export function weekHoursOf(hours: unknown): { week: WeekHours; read: boolean } {
  if (!Array.isArray(hours) || hours.length === 0) return { week: DEFAULT_WEEK, read: false };
  const week: WeekHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  let readAny = false;
  for (const e of hours) {
    // A day this cannot name could be any of the seven: the week is not read.
    const day = e && typeof e === "object" ? dayNameOf((e as { day?: unknown }).day) : null;
    if (!day) return { week: DEFAULT_WEEK, read: false };
    const said = (e as { hours?: unknown }).hours;
    const windows = typeof said === "string" ? dayOf(said) : null;
    // A day whose words do not read keeps the default week's hours for it: a guess of nine to five, never a day closed.
    week[day] = windows ?? DEFAULT_WEEK[day];
    if (windows !== null) readAny = true;
  }
  return readAny ? { week, read: true } : { week: DEFAULT_WEEK, read: false };
}

/* ------------------------------------------------- the opening the week says */

/** What the opening is written from: the listing as the check's record row holds it. */
export interface FactListing {
  business_name: string | null;
  city?: string | null;
  /** The finder's hours (00144); anything else is no week. */
  hours: unknown;
  rating: number | null;
  reviews: number | null;
}

/** The least a rating says anything at, and the fewest reviews it is said from. */
const RATING_MIN = 4;
const REVIEWS_MIN = 20;

/** A day as the opening says it: closed, open around the clock, or open until a time ("5 PM", "8:30 PM", "midnight"). */
type SaidDay = { closed: true } | { allDay: true } | { until: string };

/** A close as a person says it, from minutes after midnight (one past midnight is the next day's): twelve at night is midnight. */
function closeSaid(to: number): string {
  const min = to % (24 * 60);
  if (min === 0) return "midnight";
  const hour = Math.floor(min / 60);
  const minutes = min % 60;
  return `${hour % 12 || 12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`;
}

/** One day's windows as the opening says them; a day of two stretches ("9 AM to 1 PM, 2 to 6 PM") is a shape not said. */
function saidDayOf(windows: OpenWindow[] | null): SaidDay | null {
  if (!windows) return null;
  const [only, second] = windows;
  if (!only) return { closed: true };
  if (second) return null;
  if (only.from === 0 && only.to === 24 * 60) return { allDay: true };
  return { until: closeSaid(only.to) };
}

/** The listing's week, Monday first, read as the send window reads it, or null where any day is missing or unread. */
function saidWeekOf(hours: unknown): SaidDay[] | null {
  if (!Array.isArray(hours)) return null;
  const byDay = new Map<WeekdayKey, SaidDay>();
  for (const e of hours) {
    if (!e || typeof e !== "object") return null;
    const day = dayNameOf((e as { day?: unknown }).day);
    const words = (e as { hours?: unknown }).hours;
    const said = day && typeof words === "string" ? saidDayOf(dayOf(words)) : null;
    if (!day || !said) return null;
    byDay.set(day, said);
  }
  const week: SaidDay[] = [];
  for (const d of DAYS) {
    const said = byDay.get(d);
    if (!said) return null;
    week.push(said);
  }
  return week;
}

const untilOf = (d: SaidDay | undefined): string | null => (d && "until" in d ? d.until : null);
const isClosed = (d: SaidDay | undefined): boolean => !!d && "closed" in d;
const isAllDay = (d: SaidDay | undefined): boolean => !!d && "allDay" in d;

/** What the week says after the name ("is open until 5 PM on weekdays"), and its angle; null where it says nothing whole. */
function hoursSaid(week: SaidDay[]): { said: string; angle: string } | null {
  if (week.every(isAllDay)) return { said: "is open 24 hours, seven days a week", angle: "open 24 hours" };
  const weekday = week.slice(0, 5);
  const [sat, sun] = [week[5], week[6]];
  const all = untilOf(week[0]);
  if (all && week.every((d) => untilOf(d) === all))
    return { said: `is open until ${all} every day`, angle: "their hours" };
  const close = untilOf(weekday[0]);
  if (!close || !weekday.every((d) => untilOf(d) === close)) return null;
  return { said: weekendSaid(close, sat, sun), angle: "their hours" };
}

/**
 * The weekdays' one close and the weekend as the listing has it. A weekend open both days says each day's close, so no
 * close is said that the listing does not give ("until 8 PM Monday to Saturday and until 4 PM on Sundays"); both at the
 * weekdays' close is every day, said before this.
 */
function weekendSaid(close: string, sat: SaidDay | undefined, sun: SaidDay | undefined): string {
  const satUntil = untilOf(sat);
  const sunUntil = untilOf(sun);
  if (isClosed(sat) && isClosed(sun)) return `is open until ${close} on weekdays and closed on weekends`;
  if (satUntil && isClosed(sun))
    return satUntil === close
      ? `is open until ${close} Monday to Saturday`
      : `is open until ${close} on weekdays and until ${satUntil} on Saturdays`;
  if (!satUntil || !sunUntil) return `is open until ${close} on weekdays`;
  if (satUntil === close) return `is open until ${close} Monday to Saturday and until ${sunUntil} on Sundays`;
  if (satUntil === sunUntil) return `is open until ${close} on weekdays and until ${satUntil} on weekends`;
  return `is open until ${close} on weekdays, until ${satUntil} on Saturdays and until ${sunUntil} on Sundays`;
}

/**
 * The opening a listing's own fields say, or null (decision 0078): its hours where the whole week reads, else its rating
 * where it is 4.0 or more from 20 reviews or more. One sentence said by code, so nothing in it is a guess and the writer is
 * not asked for it; the check's reader still reads it, as it reads every opening, for the business's language and
 * against the record. The business is named as every email names it (leadCalledByOf).
 */
export function leadFactOf(l: FactListing): WrittenOpening | null {
  const name = (
    leadCalledByOf({ business_name: l.business_name, city: l.city ?? null }) ??
    l.business_name ??
    ""
  ).trim();
  if (!name) return null;
  const week = saidWeekOf(l.hours);
  const hours = week ? hoursSaid(week) : null;
  if (hours) return { opening: `${name} ${hours.said}.`, angle: hours.angle, facts_used: ["hours"] };
  if (l.rating !== null && l.reviews !== null && l.rating >= RATING_MIN && l.reviews >= REVIEWS_MIN)
    return {
      opening: `${name} has a ${l.rating.toFixed(1)} rating across ${l.reviews} reviews.`,
      angle: "their rating",
      facts_used: ["rating", "reviews"],
    };
  return null;
}
