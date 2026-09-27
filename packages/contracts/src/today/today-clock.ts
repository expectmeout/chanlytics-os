/**
 * Today's clock words: a time, a day and a wait said in the workspace's own zone, never the reader's. Every
 * module of the brief that names a moment reads it from here.
 */
import { DAY_MS } from "../shared/time";

/** Wall-clock time AT THE SALON, whatever clock the reader is holding. */
/**
 * A clock time that says which day when it is not today: "3:30 PM",
 * "tomorrow 6:46 PM", "Wed 9:00 AM". A closing window printed as "6:46 PM"
 * beside "since 6:46 PM" read as the same moment.
 */
export function tzClock(iso: string | null | undefined, tz: string, now: Date): string | null {
  const t = tzTime(iso, tz);
  if (!iso || !t) return t;
  const key = (d: Date) => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch {
      return d.toDateString();
    }
  };
  const day = key(new Date(iso));
  if (day === key(now)) return t;
  if (day === key(new Date(now.getTime() + DAY_MS))) return `tomorrow ${t}`;
  try {
    return `${new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(iso))} ${t}`;
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
  const dayNumber = (d: Date): number => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(d)
        .split("-")
        .map(Number);
      return Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1) / DAY_MS;
    } catch {
      return Math.floor(d.getTime() / DAY_MS);
    }
  };
  const days = dayNumber(now) - dayNumber(new Date(iso));
  if (days <= 0) return t;
  if (days === 1) return `yesterday ${t}`;
  try {
    const within: Intl.DateTimeFormatOptions =
      days < 7 ? { weekday: "short", timeZone: tz } : { month: "short", day: "numeric", timeZone: tz };
    const day = new Intl.DateTimeFormat("en-US", within).format(new Date(iso));
    return days < 7 ? `${day} ${t}` : `${day}, ${t}`;
  } catch {
    return t;
  }
}

export function tzTime(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
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
  const key = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const toUtc = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  const days = Math.round((toUtc(key(now)) - toUtc(key(new Date(iso)))) / DAY_MS);
  if (days < 1) return t;
  if (days === 1) return `yesterday at ${t}`;
  try {
    const d = new Date(iso);
    if (days < 7) {
      const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz }).format(d);
      return `${day} at ${t}`;
    }
    const md = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: tz }).format(d);
    return `${md} at ${t}`;
  } catch {
    return t;
  }
}
