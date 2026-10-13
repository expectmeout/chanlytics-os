/**
 * When each email of a run goes, and from which sender, a connected mailbox (Reach out §4.5, decision 0056): a pure
 * plan. Each send takes the earliest moment that is inside its lead's own open hours (half an hour clear of each end)
 * and inside the day (eight to eight, the lead's time: a business open all night is not written to at one in the
 * morning), at least a gap after every other send from the same mailbox (the gap moved by up to a quarter either way,
 * so runs keep no rhythm), and inside the mailbox's share of any rolling day. The sender is whichever gives the earliest
 * such moment, so a run's new leads take turns across its mailboxes; a send that names its one sender (`only`: a later
 * step's lead keeps the mailbox its chain wrote from, so the nudge is in the same thread) takes that one or none. What
 * finds no moment within the horizon is left unplaced, and the run says so: nothing is forced into a closed day or past
 * a mailbox's share. `recent` is every time the mailbox already spends, planned sends ahead included, read once for
 * the run (db mailbox_capacity); the claim is what enforces it (C7).
 *
 * A run is a few hundred leads over a few mailboxes, planned inside one request: the times are kept sorted and
 * searched, and a lead's open spans are worked out once per zone and week, since most leads share both.
 */
import { dayPlusInZone, localToUtcMs } from "../calendar/zone-math";
import { DEFAULT_WEEK, type OpenWindow, type WeekHours, type WeekdayKey } from "./lead-hours";
import { DAY_MS, MIN_MS } from "../shared/time";

export const SEND_WINDOW_MARGIN_MIN = 30;
/** The part of any day a cold email may arrive in, in the lead's own time (minutes after midnight). */
export const SEND_DAY_FRAME: OpenWindow = { from: 8 * 60, to: 20 * 60 };
export const TIMETABLE_HORIZON_DAYS = 7;

export interface TimetableSend {
  id: string;
  zone: string;
  week: WeekHours;
  /** The one sender this send may take (a later step's lead keeps its chain's mailbox); any of them when absent. */
  only?: string | null;
}
export interface TimetableSender {
  id: string;
  /** The mailbox's share of a day now (contracts mailboxDailyCap). */
  cap: number;
  /** When it already spends a send: left, of unknown outcome, queued, claimed or planned (ms). */
  recent: number[];
}
export interface TimetableInput {
  sends: TimetableSend[];
  senders: TimetableSender[];
  gapMinutes: number;
  nowMs: number;
  horizonDays?: number;
  /** A number in [-1, 1] per send: how far its gap moves (a quarter at most). Math.random by default. */
  jitter?: () => number;
}
export interface Placed {
  id: string;
  senderId: string;
  sendAtMs: number;
}
export interface TimetableResult {
  placed: Placed[];
  unplaced: string[];
}

const DAYS: readonly WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function inFrame(week: WeekHours): WeekHours {
  const out = {} as WeekHours;
  for (const day of DAYS) {
    out[day] = (week[day] ?? [])
      .map((w) => ({
        from: Math.max(w.from + SEND_WINDOW_MARGIN_MIN, SEND_DAY_FRAME.from),
        to: Math.min(w.to - SEND_WINDOW_MARGIN_MIN, SEND_DAY_FRAME.to),
      }))
      .filter((w) => w.to > w.from);
  }
  return out;
}

/**
 * The windows a send may take on each weekday: the open hours, half an hour in from each end, inside the day's frame.
 * A business open only at night (a bar from nine) has none, and is written to in the default week's hours instead: its
 * owner reads mail by day too. A business closed every day has none, and stays unplaced.
 */
export function sendWindowsOf(week: WeekHours): WeekHours {
  const framed = inFrame(week);
  if (DAYS.some((d) => framed[d].length > 0)) return framed;
  return DAYS.some((d) => (week[d] ?? []).length > 0) ? inFrame(DEFAULT_WEEK) : framed;
}

/** The send windows of the lead's days, as UTC instants, from `fromMs` for `days` days. */
function openSpans(zone: string, windows: WeekHours, fromMs: number, days: number): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let i = 0; i <= Math.ceil(days); i += 1) {
    const day = dayPlusInZone(zone, fromMs, i);
    for (const w of windows[day.weekday as WeekdayKey] ?? []) {
      const start = localToUtcMs(zone, day.y, day.m, day.d, Math.floor(w.from / 60), w.from % 60);
      const end = localToUtcMs(zone, day.y, day.m, day.d, Math.floor(w.to / 60), w.to % 60);
      if (end > fromMs) spans.push([Math.max(start, fromMs), end]);
    }
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

/** The index of the first time at or after `x`, in sorted `times`. */
function lowerBound(times: number[], x: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Whether one more send at `t` keeps every rolling day on this mailbox within its cap. A day that holds `t` ends at `t`
 * or at a later send less than a day after it, so those are the only days to count.
 */
function fitsCap(times: number[], t: number, cap: number): boolean {
  const ends = [t, ...times.slice(lowerBound(times, t), lowerBound(times, t + DAY_MS))];
  for (const q of ends) {
    const already = lowerBound(times, q + 1) - lowerBound(times, q - DAY_MS + 1);
    if (already + 1 > cap) return false;
  }
  return true;
}

/** The earliest moment for this send from this mailbox, or null within the horizon. */
function earliest(
  spans: Array<[number, number]>,
  times: number[],
  cap: number,
  gapMs: number,
  limitMs: number,
): number | null {
  // A move forward (a gap, a full day) carries into the next window: a later window starts no earlier than it.
  let floor = 0;
  for (const [start, end] of spans) {
    let t = Math.max(start, floor);
    for (let guard = 0; guard < 500 && t < end && t < limitMs; guard += 1) {
      // The first send closer than a gap to `t`, either side.
      const i = lowerBound(times, t - gapMs + 1);
      if (i < times.length && times[i] < t + gapMs) {
        t = times[i] + gapMs;
        floor = t;
        continue;
      }
      if (!fitsCap(times, t, cap)) {
        // Wait for the oldest send of the day before it to leave the window: a day is (q - 24 h, q], as the claim
        // counts it (db mailbox_capacity), so the moment it leaves is a day after it.
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

/** The spans of one zone and week, or none when the zone is one the runtime does not know. */
function spansOrNone(zone: string, week: WeekHours, fromMs: number, days: number): Array<[number, number]> {
  try {
    return openSpans(zone, sendWindowsOf(week), fromMs, days);
  } catch {
    return []; // an unknown zone: this send is unplaced, and the rest of the run is planned
  }
}

export function timetable(input: TimetableInput): TimetableResult {
  // The pace is a step's (00183 holds it to 5..120): without one, no two sends are kept apart, so there is no plan.
  if (!Number.isFinite(input.gapMinutes) || input.gapMinutes <= 0)
    throw new Error(`timetable: a gap is a number of minutes above zero (${input.gapMinutes})`);
  const horizon = input.horizonDays ?? TIMETABLE_HORIZON_DAYS;
  const limitMs = input.nowMs + horizon * DAY_MS;
  const draw = input.jitter ?? (() => Math.random() * 2 - 1);
  const jitter = () => {
    const j = draw();
    return Number.isFinite(j) ? Math.max(-1, Math.min(1, j)) : 0;
  };
  const senders = input.senders
    .filter((d) => d.cap > 0)
    .map((d) => ({ ...d, times: [...d.recent].sort((a, b) => a - b), placed: 0 }));
  const spansOf = new Map<string, Array<[number, number]>>();
  const placed: Placed[] = [];
  const unplaced: string[] = [];
  for (const s of input.sends) {
    const gapMs = Math.round(input.gapMinutes * MIN_MS * (1 + 0.25 * jitter()));
    const key = `${s.zone}|${JSON.stringify(s.week)}`;
    let spans = spansOf.get(key);
    if (!spans) {
      spans = spansOrNone(s.zone, s.week, input.nowMs, horizon);
      spansOf.set(key, spans);
    }
    let best: { d: (typeof senders)[number]; t: number } | null = null;
    for (const d of senders) {
      if (s.only && d.id !== s.only) continue;
      const t = earliest(spans, d.times, d.cap, gapMs, limitMs);
      if (t === null) continue;
      if (!best || t < best.t || (t === best.t && d.placed < best.d.placed)) best = { d, t };
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
