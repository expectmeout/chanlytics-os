/**
 * The Calendar's words: a clock time, a date, a span of hours, a closure's dates, the booking rules, a week's
 * hours, and the feed's state and what a read left out. The board, Today, Settings and Setup say each one way.
 */
import { agoWords } from "../shared/time";
import type { BookingRules, Closure, Hours } from "../config/workspace-config/business-profile";
import { DAYS } from "../config/workspace-config/config-rules";
import { hoursRuns } from "../config/workspace-config/prompt-hours";
import { BOOKING_DEFAULTS, dayIntervals, type BookingRulesLike } from "./availability";
import { DAY_SHORT, keyParts } from "./day-keys";
import type { CalendarFeedDto, VisitMark } from "./calendar-dto";

/* ----------------------------------------------------------- what became of a visit (decision 0002, step 8) */

/** What a member may say became of a visit (00397 mark_visit). */
export type VisitWord = "kept" | "missed" | "cancelled";

/** Each word as the panel says it, on a state and on an act alike. */
export const VISIT_WORDS: Record<VisitWord, string> = { kept: "Kept", missed: "Missed", cancelled: "Cancelled" };

/** The door's refusals (mark_visit's `{ error }`), each in a sentence for the person who asked. */
export const VISIT_REFUSALS: Record<string, string> = {
  never_booked: "It was only requested, never booked: it can be cancelled, but not kept or missed.",
  cancelled: "It was cancelled already.",
  not_begun: "It hasn't begun yet: whether they came is said once it has.",
  already_said: "It's marked kept or missed already: say the other if that was wrong.",
  over: "It has ended: say whether they came instead.",
};

/**
 * What the panel says beside a visit's time: the member's word on it, else "Past" once it has ended (the record never
 * infers that they came: 0002's answer 3), else nothing.
 */
export function visitStateOf(
  visit: VisitMark | null,
  endMs: number,
  nowMs: number,
): { text: string; tone: VisitWord | "past" } | null {
  const said = visit?.status;
  if (said === "kept" || said === "missed" || said === "cancelled") return { text: VISIT_WORDS[said], tone: said };
  return endMs <= nowMs ? { text: "Past", tone: "past" } : null;
}

/**
 * What a member may say of a visit now, in the order it is offered, by mark_visit's own rules (00397): kept or missed
 * once it has begun, cancelled until it ends; a kept visit that has begun may be corrected to missed and a missed one to
 * kept; nothing
 * of a cancelled one, nor of an event the record has not kept yet.
 */
export function visitActsOf(visit: VisitMark | null, startMs: number, endMs: number, nowMs: number): VisitWord[] {
  if (!visit) return [];
  switch (visit.status) {
    // A correction is a word about a visit that has begun, as the door holds it (not_begun).
    case "kept":
      return startMs <= nowMs ? ["missed"] : [];
    case "missed":
      return startMs <= nowMs ? ["kept"] : [];
    case "cancelled":
      return [];
    case "proposed":
      return endMs > nowMs ? ["cancelled"] : [];
    case "booked": {
      const out: VisitWord[] = startMs <= nowMs ? ["kept", "missed"] : [];
      if (endMs > nowMs) out.push("cancelled");
      return out;
    }
  }
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

/*
 * A day key is already the business's day ("2026-11-17"), so its words are that day's for every viewer: the key's UTC
 * noon, said in UTC. Said in the viewer's own zone, as these were, a Tuesday read "Wednesday" east of UTC+12 (the
 * scorecard's defect 28); said in the business's zone it would do the same to a business there. Never a zone here.
 */
const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const LONG = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

/** "Nov 17" */
export function shortDate(key: string): string {
  const { y, m, d } = keyParts(key);
  return SHORT.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "Tuesday, November 17" */
export function longDate(key: string): string {
  const { y, m, d } = keyParts(key);
  return LONG.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * A closure's dates, as the board and Settings › Business both say them: "Dec 24", "Dec 24 – 26" within a month,
 * "Dec 30 – Jan 2" across two. One spelling, here, so the row that counts the closures ahead and the board that
 * draws them never name one date two ways.
 */
export function closureDatesLabel(c: Pick<Closure, "date" | "until">): string {
  if (!(c.until && c.until > c.date)) return shortDate(c.date);
  return `${shortDate(c.date)} – ${c.until.slice(0, 7) === c.date.slice(0, 7) ? c.until.slice(8).replace(/^0/, "") : shortDate(c.until)}`;
}

/**
 * The closures still ahead on the business's day `todayKey`, soonest first. One that ends today is still ahead; an
 * `until` before its `date` is a one-day closure, as the composer reads it.
 */
export function closuresFrom<C extends Pick<Closure, "date" | "until">>(closures: readonly C[], todayKey: string): C[] {
  return closures
    .filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function readAgoLabel(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  return agoWords(Date.parse(iso), now.getTime(), { dateAfterMs: Number.POSITIVE_INFINITY });
}

/** The booking rules as separate phrases, so a narrow screen wraps between rules and never inside one: "at least 2h notice", "15 min between appointments", "up to 14 days ahead", "30-min slots", "up to 6 people per booking" -- Business's own words, least notice and days ahead (C3). */
export function ruleParts(rules: (BookingRulesLike & Pick<BookingRules, "party_max">) | null | undefined): string[] {
  const r = { ...BOOKING_DEFAULTS, ...(rules ?? {}) };
  const parts = [`at least ${r.lead_hours}h notice`];
  if (r.buffer_min > 0) parts.push(`${r.buffer_min} min between appointments`);
  parts.push(`up to ${r.max_days_ahead} days ahead`, `${r.slot_min}-min slots`);
  // The party size a booking is held to, when Settings gives one: the receptionist follows it, and the page never said it (C1).
  if (rules?.party_max)
    parts.push(`up to ${rules.party_max} ${rules.party_max === 1 ? "person" : "people"} per booking`);
  return parts;
}

/** "Offers times with at least 2h notice · 15 min between appointments · up to 14 days ahead · 30-min slots". */
export function rulesLine(rules: (BookingRulesLike & Pick<BookingRules, "party_max">) | null | undefined): string {
  return `Offers times with ${ruleParts(rules).join(" · ")}`;
}

/**
 * What a read left out, in words the owner can act on. The feed line said
 * "2 repeating rules read once" and "3 more not shown" and never what either
 * meant: a repeat whose pattern parseIcs cannot follow keeps only its first
 * date, so a later one could be offered to a caller; and a day holding more
 * events than the board draws still has every one of them taken, because the
 * windows are worked out from all of them.
 */
export function feedNotes(
  feed: Pick<CalendarFeedDto, "state" | "skipped_recurring" | "dropped">,
): CalendarFeedNoteVM[] {
  if (feed.state !== "ok") return [];
  const notes: CalendarFeedNoteVM[] = [];
  const repeats = feed.skipped_recurring || 0;
  if (repeats > 0) {
    const one = repeats === 1;
    notes.push({
      id: "repeats",
      title: `${repeats} repeating event${one ? " counts" : "s count"} only once.`,
      body: `${one ? "It repeats" : "They repeat"} in a pattern the receptionist can't follow, like the second Tuesday of each month, so only the first date is treated as taken, and a caller could be offered a time on a later one. Repeating daily, weekly on set days, or monthly on one date fixes it.`,
    });
  }
  const undrawn = feed.dropped || 0;
  if (undrawn > 0) {
    const one = undrawn === 1;
    notes.push({
      id: "undrawn",
      title: `${undrawn} more event${one ? " isn't" : "s aren't"} drawn.`,
      body: `${one ? "It falls" : "They fall"} on a day holding more events than the board draws; the receptionist still treats ${one ? "its time" : "their times"} as taken.`,
    });
  }
  return notes;
}

/**
 * "Mon–Fri 10 AM – 7 PM", "Wed 9 AM – 1 PM and 3 – 7 PM", "Sun closed" — one line per run of days with the same hours:
 * the prompt's own runs, said in the board's clock. The bar said "10:00–19:00" over a board drawn in 10 AM, and a day
 * with half its hours said the prompt's "ask them to call" to the owner (C3).
 */
export function hoursLines(hours: Record<string, Hours | undefined> | null | undefined): string[] {
  if (!hours) return [];
  const clean: Record<string, Hours> = {};
  for (const d of DAYS) if (hours[d]) clean[d] = hours[d];
  return hoursRuns(clean).map(
    (r) =>
      `${DAY_SHORT[r.from] ?? r.from}${r.to !== r.from ? `–${DAY_SHORT[r.to] ?? r.to}` : ""} ${dayHoursWords(clean[r.from])}`,
  );
}

/** One day's hours in the board's clock: its spans; "closed" when it states none; "hours incomplete" when what it states can't be used. */
function dayHoursWords(h: Hours | undefined): string {
  const at = (s: string) => Number(s.split(":")[0]) + Number(s.split(":")[1]) / 60;
  const parts = dayIntervals(h).map(([o, c]) => spanLabel(at(o), at(c)));
  if (!parts.length) return h?.open || h?.close || h?.intervals?.length ? "hours incomplete" : "closed";
  return parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Something a read of the calendar left out, said so the owner can act on it. */
export interface CalendarFeedNoteVM {
  id: "repeats" | "undrawn";
  /** "2 repeating events count only once." */
  title: string;
  body: string;
}

/**
 * The calendar feed's state, in the words the Calendar's pill, Connections and Setup all use (C3): the page drew a
 * coloured dot where Connections said "Readable". `stale` is a read that landed before a refresh that didn't.
 */
export const CALENDAR_FEED_WORDS = {
  ok: "Readable",
  stale: "Last good read",
  unavailable: "Could not be read",
  none: "Not connected",
} as const;
export type CalendarFeedHealth = keyof typeof CALENDAR_FEED_WORDS;

export function spanLabel(t1: number, t2: number): string {
  const a = clockLabel(t1);
  const b = clockLabel(t2);
  // One AM or PM for a span inside one half of one day. A span to midnight ends in the next day's AM: its halves were
  // matched by their letters, and "10 AM – 12 AM" read "10 – 12 AM" (C3).
  const sameHalf = t2 < 24 && t1 < 12 === t2 < 12;
  return `${sameHalf ? a.slice(0, -3) : a} – ${b}`;
}
