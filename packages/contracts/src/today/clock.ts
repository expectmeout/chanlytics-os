/**
 * Today's clock words: a time, a day and a wait said in the workspace's own zone, never the reader's. Every
 * module of the brief that names a moment reads it from here. The days are zone-math's, counted by the calendar
 * (shared/clock.ts localDaysBetween, shared/zone/math.ts dayPlusInZone): tomorrow is the next day, never now plus
 * 24 hours, which late on the eve of a 23-hour day is the day after next.
 */
import { dayPlusInZone } from "../shared/zone/math";
import { localDaysBetween, zoneDayKey } from "../shared/clock";
import { dateFormat } from "../shared/time";

/** Wall-clock time AT THE SALON, whatever clock the reader is holding. */
/**
 * A clock time that says which day when it is not today: "3:30 PM",
 * "tomorrow 6:46 PM", "Wed 9:00 AM". A closing window printed as "6:46 PM"
 * beside "since 6:46 PM" read as the same moment.
 */
export function tzClock(iso: string | null | undefined, tz: string, now: Date): string | null {
  const result = tzTime(iso, tz);
  if (!iso || !result) return result;
  // A time was said, so the zone is one Intl can use.
  const day = zoneDayKey(Date.parse(iso), tz);
  if (day === zoneDayKey(now.getTime(), tz)) return result;
  if (day === dayPlusInZone(tz, now.getTime(), 1).key) return `tomorrow ${result}`;
  try {
    return `${dateFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(iso))} ${result}`;
  } catch {
    return result;
  }
}

/**
 * When a wait began, said with its day, in the workspace's zone: "8:00 AM"
 * today, "yesterday 8:00 AM", "Fri 8:00 AM" inside a week, "Aug 29, 8:00 AM"
 * beyond it. A bare time on a wait from an earlier day read as last night:
 * Today said "waiting since 6:51 PM" of a customer who had waited eight days.
 */
export function tzSince(iso: string | null | undefined, tz: string, now: Date): string | null {
  const result = tzTime(iso, tz);
  if (!iso || !result) return result;
  const days = localDaysBetween(Date.parse(iso), now.getTime(), tz);
  if (days <= 0) return result;
  if (days === 1) return `yesterday ${result}`;
  try {
    const within: Intl.DateTimeFormatOptions & { timeZone: string } =
      days < 7 ? { weekday: "short", timeZone: tz } : { month: "short", day: "numeric", timeZone: tz };
    const day = dateFormat("en-US", within).format(new Date(iso));
    return days < 7 ? `${day} ${result}` : `${day}, ${result}`;
  } catch {
    return result;
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

/**
 * A moment by its day and its time, in the workspace's zone: the time alone today, else "yesterday", the weekday inside a
 * week, the month and day beyond it. `form`: "sentence" joins them with "at" ("Tuesday at 4:12 PM"), as a sentence that
 * goes on says it; "clipped" as a line says it beside other facts ("Tuesday 4:12 PM", "October 27, 4:12 PM"), as the
 * canvas of 2 Nov 2026 writes the quiet head's last message.
 */
export function tzDayAndTime(iso: string | null, tz: string, now: Date, form: "sentence" | "clipped"): string | null {
  if (!iso) return null;
  const result = tzTime(iso, tz);
  if (!result) return null;
  const at = form === "sentence" ? " at " : " ";
  // The tenant's calendar day, not a 24-hour multiple: at 8 AM, a message
  // from 9:15 AM yesterday is "yesterday", however few hours ago it was.
  const days = localDaysBetween(Date.parse(iso), now.getTime(), tz);
  if (days < 1) return result;
  if (days === 1) return `yesterday${at}${result}`;
  try {
    const d = new Date(iso);
    if (days < 7) {
      const day = dateFormat("en-US", { weekday: "long", timeZone: tz }).format(d);
      return `${day}${at}${result}`;
    }
    const md = dateFormat("en-US", { month: "long", day: "numeric", timeZone: tz }).format(d);
    return `${md}${form === "sentence" ? " at " : ", "}${result}`;
  } catch {
    return result;
  }
}
