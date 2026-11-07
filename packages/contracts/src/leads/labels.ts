/**
 * The small helpers leads.ts and the lead modules share. Internal: index.ts never re-exports it (the
 * person-words.ts / run-words.ts pattern).
 */
import { dayInZone } from "../shared/zone/math";
import { dateFormat } from "../shared/time";
export const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:to|–|-|—)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i;

export const hourOf = (hour: string, message: string | undefined, ap: string): number =>
  (Number(hour) % 12) + (ap.toUpperCase() === "PM" ? 12 : 0) + (message ? Number(message) / 60 : 0);

/** A clock time on the day it happened, and the date too once it is not today (the peek is read weeks later). */
export function clockIn(tz: string, iso: string | null, now: Date): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const clock = dateFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
  if (dayInZone(tz, at.getTime()).key === dayInZone(tz, now.getTime()).key) return clock;
  return `${dateFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(at)}, ${clock}`;
}

const METRES_PER_MILE = 1609.344;

/** "1.2 mi" close in, whole miles past ten: nobody says "12.4 mi" about a drive across town. */
export const milesLabel = (metres: number | null): string => {
  if (metres === null || metres === undefined) return "";
  const mi = metres / METRES_PER_MILE;
  return `${mi < 10 ? mi.toFixed(1) : String(Math.round(mi))} mi`;
};
