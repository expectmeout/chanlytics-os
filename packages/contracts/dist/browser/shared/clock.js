import { localToUtcMs } from "../calendar/zone-math.js";
import { DAY_MS } from "./time.js";
const FORMATS = /* @__PURE__ */ new Map();
function formatsFor(tz) {
  const hit = FORMATS.get(tz);
  if (hit) return hit;
  let zone = tz || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const made = {
    zone,
    time: new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }),
    date: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }),
    dateYear: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", year: "numeric" }),
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }),
    parts: new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
  };
  FORMATS.set(tz, made);
  return made;
}
const WALLS = /* @__PURE__ */ new Map();
const WALLS_MAX = 2048;
function wall(atMs, tz) {
  const id = `${tz}|${atMs}`;
  const hit = WALLS.get(id);
  if (hit) return hit;
  const p = {};
  for (const x of formatsFor(tz).parts.formatToParts(new Date(atMs))) p[x.type] = x.value;
  const made = {
    key: `${p.year}-${p.month}-${p.day}`,
    year: Number(p.year),
    hh: Number(p.hour) % 24,
    mm: Number(p.minute)
  };
  if (WALLS.size >= WALLS_MAX) WALLS.clear();
  WALLS.set(id, made);
  return made;
}
function shiftDay(key, days) {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + days)).toISOString().slice(0, 10);
}
function dayOfWeek(key) {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))).getUTCDay();
}
export function zoneDayKey(atMs, tz) {
  return wall(atMs, tz).key;
}
export function clockTime(atMs, tz) {
  return formatsFor(tz).time.format(new Date(atMs));
}
export function clockHour(hour) {
  const h = Number.isFinite(hour) ? (Math.floor(hour) % 24 + 24) % 24 : 0;
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
}
export function clockDate(atMs, tz, nowMs) {
  const f = formatsFor(tz);
  return wall(atMs, tz).year === wall(nowMs, tz).year ? f.date.format(new Date(atMs)) : f.dateYear.format(new Date(atMs));
}
export function clockHistoryDay(atMs, tz, nowMs) {
  const day = zoneDayKey(atMs, tz);
  const today = zoneDayKey(nowMs, tz);
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  const f = formatsFor(tz);
  const weekday = f.weekday.format(new Date(atMs));
  const gap = (Date.parse(today) - Date.parse(day)) / DAY_MS;
  if (gap > 0 && gap < 7) return weekday;
  return `${weekday} ${clockDate(atMs, tz, nowMs)}`;
}
export function clockDateYear(atMs, tz) {
  return formatsFor(tz).dateYear.format(new Date(atMs));
}
export function clockShort(atMs, tz, nowMs) {
  return zoneDayKey(atMs, tz) === zoneDayKey(nowMs, tz) ? clockTime(atMs, tz) : clockDate(atMs, tz, nowMs);
}
export function clockStamp(atMs, tz, nowMs) {
  const time = clockTime(atMs, tz);
  return zoneDayKey(atMs, tz) === zoneDayKey(nowMs, tz) ? time : `${clockDate(atMs, tz, nowMs)} \xB7 ${time}`;
}
export function clockWhen(atMs, tz, nowMs) {
  const time = clockTime(atMs, tz);
  const day = zoneDayKey(atMs, tz);
  const today = zoneDayKey(nowMs, tz);
  if (day === today) return `today ${time}`;
  if (day === shiftDay(today, 1)) return `tomorrow ${time}`;
  return `${clockDate(atMs, tz, nowMs)} \xB7 ${time}`;
}
function daysBetween(fromKey, toKey) {
  const at = (key) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.round((at(toKey) - at(fromKey)) / DAY_MS);
}
function daysFromToday(atMs, tz, nowMs) {
  return daysBetween(zoneDayKey(nowMs, tz), zoneDayKey(atMs, tz));
}
export function localDaysBetween(fromMs, toMs, tz) {
  return daysBetween(zoneDayKey(fromMs, tz), zoneDayKey(toMs, tz));
}
export function inLocalWeek(atMs, tz, nowMs) {
  const today = zoneDayKey(nowMs, tz);
  const monday = shiftDay(today, -((dayOfWeek(today) + 6) % 7));
  const d = daysBetween(monday, zoneDayKey(atMs, tz));
  return d >= 0 && d <= 6;
}
export function clockNear(atMs, tz, nowMs) {
  const gap = daysFromToday(atMs, tz, nowMs);
  if (gap === 0) return "today";
  if (gap === -1) return "yesterday";
  if (gap === 1) return "tomorrow";
  if (Math.abs(gap) <= 6) return formatsFor(tz).weekday.format(new Date(atMs));
  return clockDate(atMs, tz, nowMs);
}
export function clockNearWhen(atMs, tz, nowMs) {
  const time = clockTime(atMs, tz);
  return Math.abs(daysFromToday(atMs, tz, nowMs)) <= 6 ? `${clockNear(atMs, tz, nowMs)} ${time}` : `${clockDate(atMs, tz, nowMs)} \xB7 ${time}`;
}
export function clockDayLabel(atMs, tz, nowMs) {
  const day = zoneDayKey(atMs, tz);
  const today = zoneDayKey(nowMs, tz);
  const date = clockDate(atMs, tz, nowMs);
  if (day === today) return `Today \xB7 ${date}`;
  if (day === shiftDay(today, -1)) return `Yesterday \xB7 ${date}`;
  return date;
}
export function wallClockAt(tz, dayKey, hh, mm) {
  return localToUtcMs(
    formatsFor(tz).zone,
    Number(dayKey.slice(0, 4)),
    Number(dayKey.slice(5, 7)),
    Number(dayKey.slice(8, 10)),
    hh,
    mm
  );
}
export function tomorrowAtIn(tz, nowMs, hh, mm = 0) {
  return wallClockAt(tz, shiftDay(zoneDayKey(nowMs, tz), 1), hh, mm);
}
const two = (n) => String(n).padStart(2, "0");
export function zonedInputValue(atMs, tz) {
  const w = wall(atMs, tz);
  return `${w.key}T${two(w.hh)}:${two(w.mm)}`;
}
export function fromZonedInput(value, tz) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::[0-9]{2})?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const ms = localToUtcMs(formatsFor(tz).zone, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isFinite(ms) ? ms : null;
}
export function mmss(ms) {
  const total = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1e3)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
export function callLength(ms) {
  return ms != null && Number.isFinite(ms) && ms > 0 ? mmss(ms) : void 0;
}
export function durationWords(seconds) {
  const v = Math.max(0, Math.round(seconds));
  if (v < 60) return `${v}s`;
  if (v < 600) {
    const m2 = Math.floor(v / 60);
    const r = v % 60;
    return r ? `${m2}m ${r}s` : `${m2}m`;
  }
  const minutes = Math.round(v / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
