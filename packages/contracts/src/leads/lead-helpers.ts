/**
 * The small helpers leads.ts and the lead modules share. Internal: index.ts never re-exports it (the
 * person-words.ts / run-words.ts pattern).
 */
export const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:to|–|-|—)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i;

export const hourOf = (h: string, m: string | undefined, ap: string): number =>
  (Number(h) % 12) + (ap.toUpperCase() === "PM" ? 12 : 0) + (m ? Number(m) / 60 : 0);

/** A clock time on the day it happened, and the date too once it is not today (the peek is read weeks later). */
export function clockIn(tz: string, iso: string | null, now: Date): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
  if (day(at) === day(now)) return clock;
  return `${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(at)}, ${clock}`;
}

const METRES_PER_MILE = 1609.344;

/** "1.2 mi" close in, whole miles past ten: nobody says "12.4 mi" about a drive across town. */
export const milesLabel = (m: number | null): string => {
  if (m === null || m === undefined) return "";
  const mi = m / METRES_PER_MILE;
  return `${mi < 10 ? mi.toFixed(1) : String(Math.round(mi))} mi`;
};
