import { dateFormat } from "../shared/time.js";
export const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:to|–|-|—)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i;
export const hourOf = (h, m, ap) => Number(h) % 12 + (ap.toUpperCase() === "PM" ? 12 : 0) + (m ? Number(m) / 60 : 0);
export function clockIn(tz, iso, now) {
  if (!iso) return "\u2014";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "\u2014";
  const day = (d) => dateFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const clock = dateFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
  if (day(at) === day(now)) return clock;
  return `${dateFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(at)}, ${clock}`;
}
const METRES_PER_MILE = 1609.344;
export const milesLabel = (m) => {
  if (m === null || m === void 0) return "";
  const mi = m / METRES_PER_MILE;
  return `${mi < 10 ? mi.toFixed(1) : String(Math.round(mi))} mi`;
};
