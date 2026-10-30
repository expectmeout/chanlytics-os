/**
 * The opening a listing's own fields write (decision 0078): one sentence, said by code, from what the finder stored
 * (00144: hours as [{day, hours}], Monday to Sunday, each "Open 24 hours", "Closed" or "8:30 AM to 5 PM"; the rating and
 * its reviews). Nothing in it is a guess, so the writer is not asked for it; the reader still reads it, as it reads every
 * opening, for the business's language and against the record. A week code cannot read whole says nothing of hours.
 */
import { leadCalledByOf } from "../leads/search/called-by";
import type { WrittenOpening } from "./reach-out-words";

/** What the opening is written from: the listing as the check's record row holds it. */
export interface FactListing {
  business_name: string | null;
  city?: string | null;
  /** The finder's hours (00144); anything else is no week. */
  hours: unknown;
  rating: number | null;
  reviews: number | null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** The least a rating says anything at, and the fewest reviews it is said from. */
const RATING_MIN = 4;
const REVIEWS_MIN = 20;

/** A day as code reads it: closed, open around the clock, or open until a time ("5 PM", "8:30 PM", "midnight"). */
type Day = { closed: true } | { allDay: true } | { until: string };

const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i;
/** One stretch of a day, "8:30 AM to 5 PM": a second stretch ("9 AM to 1 PM, 2 to 6 PM") is a shape not read. */
const STRETCH = /^(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))$/i;

/** A time as a person says it: "5 PM", "8:30 PM", and twelve at night as midnight. */
function clockWords(s: string): string | null {
  const m = CLOCK.exec(s.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minutes = m[2] ?? "00";
  const half = (m[3] ?? "").toUpperCase();
  if (hour < 1 || hour > 12 || Number(minutes) > 59) return null;
  if (hour === 12 && minutes === "00" && half === "AM") return "midnight";
  return `${hour}${minutes === "00" ? "" : `:${minutes}`} ${half}`;
}

function listingDayOf(hours: string): Day | null {
  const h = hours.trim();
  if (/^closed$/i.test(h)) return { closed: true };
  if (/^open 24 hours$/i.test(h)) return { allDay: true };
  const m = STRETCH.exec(h);
  if (!m || !clockWords(m[1] ?? "")) return null;
  const until = clockWords(m[2] ?? "");
  return until ? { until } : null;
}

/** The listing's week, Monday first, or null where any day is missing or in a shape code does not read. */
function weekOf(hours: unknown): Day[] | null {
  if (!Array.isArray(hours)) return null;
  const byDay = new Map<string, string>();
  for (const h of hours as unknown[]) {
    if (!h || typeof h !== "object") return null;
    const day = (h as { day?: unknown }).day;
    const words = (h as { hours?: unknown }).hours;
    if (typeof day !== "string" || typeof words !== "string") return null;
    byDay.set(day.trim(), words);
  }
  const week: Day[] = [];
  for (const d of DAYS) {
    const words = byDay.get(d);
    const day = words === undefined ? null : listingDayOf(words);
    if (!day) return null;
    week.push(day);
  }
  return week;
}

const untilOf = (d: Day | undefined): string | null => (d && "until" in d ? d.until : null);
const isClosed = (d: Day | undefined): boolean => !!d && "closed" in d;
const isAllDay = (d: Day | undefined): boolean => !!d && "allDay" in d;

/** What the week says after the name ("is open until 5 PM on weekdays"), and its angle; null where it says nothing whole. */
function hoursSaid(week: Day[]): { said: string; angle: string } | null {
  if (week.every(isAllDay)) return { said: "is open 24 hours, seven days a week", angle: "open 24 hours" };
  const weekday = week.slice(0, 5);
  const [sat, sun] = [week[5], week[6]];
  const all = untilOf(week[0]);
  if (all && week.every((d) => untilOf(d) === all))
    return { said: `is open until ${all} every day`, angle: "their hours" };
  const close = untilOf(weekday[0]);
  if (!close || !weekday.every((d) => untilOf(d) === close)) return null;
  const satUntil = untilOf(sat);
  const said =
    isClosed(sat) && isClosed(sun)
      ? `is open until ${close} on weekdays and closed on weekends`
      : satUntil && isClosed(sun)
        ? satUntil === close
          ? `is open until ${close} Monday to Saturday`
          : `is open until ${close} on weekdays and until ${satUntil} on Saturdays`
        : untilOf(sat) && untilOf(sun)
          ? `is open until ${close} on weekdays, and on weekends too`
          : `is open until ${close} on weekdays`;
  return { said, angle: "their hours" };
}

/**
 * The opening a listing's own fields say, or null: its hours where code reads the whole week, else its rating where it
 * is 4.0 or more from 20 reviews or more. The business is named as every email names it (leadCalledByOf).
 */
export function leadFactOf(l: FactListing): WrittenOpening | null {
  const name = (
    leadCalledByOf({ business_name: l.business_name, city: l.city ?? null }) ??
    l.business_name ??
    ""
  ).trim();
  if (!name) return null;
  const week = weekOf(l.hours);
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
