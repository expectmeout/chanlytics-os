/**
 * Today's clock words: a time, a day and a wait said in the workspace's own zone, never the reader's. Every
 * module of the brief that names a moment reads it from here. The days are zone-math's, counted by the calendar
 * (shared/clock.ts localDaysBetween, calendar/zone-math.ts dayPlusInZone): tomorrow is the next day, never now plus
 * 24 hours, which late on the eve of a 23-hour day is the day after next.
 */
import { dayPlusInZone } from "../calendar/zone-math";
import { localDaysBetween, zoneDayKey } from "../shared/clock";
import { dateFormat } from "../shared/time";

/** Wall-clock time AT THE SALON, whatever clock the reader is holding. */
/**
 * A clock time that says which day when it is not today: "3:30 PM",
 * "tomorrow 6:46 PM", "Wed 9:00 AM". A closing window printed as "6:46 PM"
 * beside "since 6:46 PM" read as the same moment.
 */
export function tzClock(iso: string | null | undefined, tz: string, now: Date): string | null {
  const t = tzTime(iso, tz);
  if (!iso || !t) return t;
  // A time was said, so the zone is one Intl can use.
  const day = zoneDayKey(Date.parse(iso), tz);
  if (day === zoneDayKey(now.getTime(), tz)) return t;
  if (day === dayPlusInZone(tz, now.getTime(), 1).key) return `tomorrow ${t}`;
  try {
    return `${dateFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(iso))} ${t}`;
  } catch {
    return t;
  }
}

/**
 * When a wait began, said with its day, in the workspace's zone: "8:00 AM"
 * today, "yesterday 8:00 AM", "Fri 8:00 AM" inside a week, "Aug 29, 8:00 AM"
 * beyond it. A bare time on a wait from an earlier day read as last night:
 * Today said "waiting since 6:51 PM" of a customer who had waited eight days.
 */
export function tzSince(iso: string | null | undefined, tz: string, now: Date): string | null {
  const t = tzTime(iso, tz);
  if (!iso || !t) return t;
  const days = localDaysBetween(Date.parse(iso), now.getTime(), tz);
  if (days <= 0) return t;
  if (days === 1) return `yesterday ${t}`;
  try {
    const within: Intl.DateTimeFormatOptions & { timeZone: string } =
      days < 7 ? { weekday: "short", timeZone: tz } : { month: "short", day: "numeric", timeZone: tz };
    const day = dateFormat("en-US", within).format(new Date(iso));
    return days < 7 ? `${day} ${t}` : `${day}, ${t}`;
  } catch {
    return t;
  }
}

export function tzTime(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null;
  try {
    return dateFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function tzDayAndTime(iso: string | null, tz: string, now: Date): string | null {
  if (!iso) return null;
  const t = tzTime(iso, tz);
  if (!t) return null;
  // The tenant's calendar day, not a 24-hour multiple: at 8 AM, a message
  // from 9:15 AM yesterday is "yesterday", however few hours ago it was.
  const days = localDaysBetween(Date.parse(iso), now.getTime(), tz);
  if (days < 1) return t;
  if (days === 1) return `yesterday at ${t}`;
  try {
    const d = new Date(iso);
    if (days < 7) {
      const day = dateFormat("en-US", { weekday: "long", timeZone: tz }).format(d);
      return `${day} at ${t}`;
    }
    const md = dateFormat("en-US", { month: "long", day: "numeric", timeZone: tz }).format(d);
    return `${md} at ${t}`;
  } catch {
    return t;
  }
}
