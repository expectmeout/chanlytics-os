import { localToUtcMs } from "./zone-math.js";
import { dateFormat } from "../shared/time.js";
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_SHORT = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun"
};
export function keyParts(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m ?? 1, d: d ?? 1 };
}
export function shiftKey(key, n) {
  const { y, m, d } = keyParts(key);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}
export function mondayOf(key) {
  const { y, m, d } = keyParts(key);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shiftKey(key, -((dow + 6) % 7));
}
export function isDayKey(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
export function monthSpan(key) {
  return { from: mondayOf(`${key.slice(0, 7)}-01`), days: 42 };
}
export function shiftMonth(key, n) {
  const { y, m } = keyParts(key);
  const at = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
export function monthLabelOf(key) {
  const { y, m } = keyParts(key);
  return dateFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1, 12))
  );
}
export function zoneMidnight(tz, key) {
  const { y, m, d } = keyParts(key);
  return localToUtcMs(tz, y, m, d, 0, 0);
}
