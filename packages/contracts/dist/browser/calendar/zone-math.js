import { dateFormat } from "../shared/time.js";
export function zoneParts(tz, at) {
  const parts = dateFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(at);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hh: Number(get("hour")) % 24,
    mm: Number(get("minute")),
    ss: Number(get("second")),
    weekday: get("weekday").toLowerCase().slice(0, 3)
  };
}
export function zoneOffsetMs(tz, atMs) {
  const p = zoneParts(tz, new Date(atMs));
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(atMs / 1e3) * 1e3;
}
export function localToUtcMs(tz, y, m, d, hh, mm) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - zoneOffsetMs(tz, guess);
  const second = guess - zoneOffsetMs(tz, first);
  return second;
}
export function clockInZone(tz, atMs) {
  const p = zoneParts(tz, new Date(atMs));
  return { hh: p.hh, mm: p.mm, ss: p.ss };
}
export function dayInZone(tz, atMs) {
  const p = zoneParts(tz, new Date(atMs));
  const pad = (n) => String(n).padStart(2, "0");
  return { key: `${p.y}-${pad(p.m)}-${pad(p.d)}`, weekday: p.weekday, y: p.y, m: p.m, d: p.d };
}
export const dayNumber = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export function dayPlusInZone(tz, atMs, days) {
  const from = dayInZone(tz, atMs);
  if (days === 0) return from;
  const at = new Date((dayNumber(from.y, from.m, from.d) + days) * 864e5);
  const pad = (n) => String(n).padStart(2, "0");
  const y = at.getUTCFullYear(), m = at.getUTCMonth() + 1, d = at.getUTCDate();
  return { key: `${y}-${pad(m)}-${pad(d)}`, weekday: WEEKDAY_KEYS[at.getUTCDay()], y, m, d };
}
