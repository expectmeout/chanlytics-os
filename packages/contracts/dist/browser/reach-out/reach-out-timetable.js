import { dayPlusInZone, localToUtcMs } from "../calendar/zone-math.js";
import { DEFAULT_WEEK } from "./lead-hours.js";
import { DAY_MS, MIN_MS } from "../shared/time.js";
export const SEND_WINDOW_MARGIN_MIN = 30;
export const SEND_DAY_FRAME = { from: 9 * 60, to: 17 * 60 };
export const TIMETABLE_HORIZON_DAYS = 7;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
function inFrame(week) {
  const out = {};
  for (const day of DAYS) {
    out[day] = (week[day] ?? []).map((w) => ({
      from: Math.max(w.from + SEND_WINDOW_MARGIN_MIN, SEND_DAY_FRAME.from),
      to: Math.min(w.to - SEND_WINDOW_MARGIN_MIN, SEND_DAY_FRAME.to)
    })).filter((w) => w.to > w.from);
  }
  return out;
}
export function sendWindowsOf(week) {
  const framed = inFrame(week);
  if (DAYS.some((d) => framed[d].length > 0)) return framed;
  return DAYS.some((d) => (week[d] ?? []).length > 0) ? inFrame(DEFAULT_WEEK) : framed;
}
function openSpans(zone, windows, fromMs, days) {
  const spans = [];
  for (let i = 0; i <= Math.ceil(days); i += 1) {
    const day = dayPlusInZone(zone, fromMs, i);
    for (const w of windows[day.weekday] ?? []) {
      const start = localToUtcMs(zone, day.y, day.m, day.d, Math.floor(w.from / 60), w.from % 60);
      const end = localToUtcMs(zone, day.y, day.m, day.d, Math.floor(w.to / 60), w.to % 60);
      if (end > fromMs) spans.push([Math.max(start, fromMs), end]);
    }
  }
  return spans.sort((a, b) => a[0] - b[0]);
}
function lowerBound(times, x) {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (times[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function fitsCap(times, t, cap) {
  const ends = [t, ...times.slice(lowerBound(times, t), lowerBound(times, t + DAY_MS))];
  for (const q of ends) {
    const already = lowerBound(times, q + 1) - lowerBound(times, q - DAY_MS + 1);
    if (already + 1 > cap) return false;
  }
  return true;
}
function earliest(spans, times, cap, gapMs, limitMs) {
  let floor = 0;
  for (const [start, end] of spans) {
    let t = Math.max(start, floor);
    for (let guard = 0; guard < 500 && t < end && t < limitMs; guard += 1) {
      const i = lowerBound(times, t - gapMs + 1);
      if (i < times.length && times[i] < t + gapMs) {
        t = times[i] + gapMs;
        floor = t;
        continue;
      }
      if (!fitsCap(times, t, cap)) {
        const j = lowerBound(times, t - DAY_MS + 1);
        t = (j < times.length && times[j] <= t ? times[j] : t) + DAY_MS;
        floor = t;
        continue;
      }
      return t;
    }
  }
  return null;
}
function spansOrNone(zone, week, fromMs, days) {
  try {
    return openSpans(zone, sendWindowsOf(week), fromMs, days);
  } catch {
    return [];
  }
}
export function timetable(input) {
  if (!Number.isFinite(input.gapMinutes) || input.gapMinutes <= 0)
    throw new Error(`timetable: a gap is a number of minutes above zero (${input.gapMinutes})`);
  const horizon = input.horizonDays ?? TIMETABLE_HORIZON_DAYS;
  const limitMs = input.nowMs + horizon * DAY_MS;
  const draw = input.jitter ?? (() => Math.random() * 2 - 1);
  const jitter = () => {
    const j = draw();
    return Number.isFinite(j) ? Math.max(-1, Math.min(1, j)) : 0;
  };
  const senders = input.senders.filter((d) => d.cap > 0).map((d) => ({ ...d, times: [...d.recent].sort((a, b) => a - b), placed: 0 }));
  const spansOf = /* @__PURE__ */ new Map();
  const placed = [];
  const unplaced = [];
  for (const s of input.sends) {
    const gapMs = Math.round(input.gapMinutes * MIN_MS * (1 + 0.25 * jitter()));
    const key = `${s.zone}|${JSON.stringify(s.week)}`;
    let spans = spansOf.get(key);
    if (!spans) {
      spans = spansOrNone(s.zone, s.week, input.nowMs, horizon);
      spansOf.set(key, spans);
    }
    let best = null;
    for (const d of senders) {
      if (s.only && d.id !== s.only) continue;
      const t = earliest(spans, d.times, d.cap, gapMs, limitMs);
      if (t === null) continue;
      if (!best || t < best.t || t === best.t && d.placed < best.d.placed) best = { d, t };
    }
    if (!best) {
      unplaced.push(s.id);
      continue;
    }
    best.d.times.splice(lowerBound(best.d.times, best.t), 0, best.t);
    best.d.placed += 1;
    placed.push({ id: s.id, senderId: best.d.id, sendAtMs: best.t });
  }
  return { placed, unplaced };
}
