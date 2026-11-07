/** Reports: dtos. */

import type { ReplyDotVM, ReportHoldVM } from "./speed";
import type { ReportArrivalDto } from "./closed";
import type { ReportTileVM } from "./tiles";
import { dateFormat } from "../shared/time";

export interface ReportDayDto {
  day: string;
  messages_in: number;
  conversations: number;
  answered_ai: number;
  answered_you: number;
  unanswered: number;
  out_ai: number;
  out_you: number;
  escalations: number;
  calls: number;
  call_seconds: number;
  new_contacts: number;
}

/** The channels a report names, in the order a chart lists them; each keeps its own colour whatever its rank.
 *  No Instagram: the messages CHECK admits none, so a report would only ever say zero (spec A5). */
export type ReportChannelKey = "whatsapp" | "voice" | "email" | "sms";

export const REPORT_CHANNELS: readonly { key: ReportChannelKey; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "voice", label: "Calls" },
  { key: "email", label: "Email" },
  { key: "sms", label: "Text" },
];

export type ReportChannelCounts = Record<ReportChannelKey, number>;

/** What `report_series(tenant, days, end)` returns. `series` spans TWO periods —
 *  the requested one and the one before it — newest last. */
export interface ReportDto {
  timezone: string;
  days: number;
  span_days: number;
  /** The workspace's today, "YYYY-MM-DD", whatever days the report is of. */
  today: string;
  /** The report's last day (00360): today for a period by name, an earlier day for days a member picked. Absent on a
   *  report from before 00360, which always ended today. */
  end?: string;
  series: ReportDayDto[];
  reasons: Record<string, number>;
  reply_seconds: number[];
  sentiments: Record<string, number>;
  voicemail: number;
  /** v3 (00139): each receptionist first reply this period, with the day it was asked (tenant zone); 00304 adds the
   *  hold it waited in seconds (0: none). Absent on a report from before 00304. */
  replies?: { day: string; s: number; hold?: number }[];
  /** v3: inbound customer messages by channel, and connected calls as voice, this period and the one before. */
  channels?: { current: ReportChannelCounts; previous: ReportChannelCounts };
  /** v3: inbound customer messages plus connected calls this period, 7 rows (Monday first) of 24 hours. */
  hours?: number[][];
  /** 00304: this period's customer messages and connected calls by local day and quarter hour. */
  arrivals?: ReportArrivalDto[];
  error?: string;
}

/**
 * The periods Reports offers, said once. Three are a count of days; Month has none of its own: it is the days since the 1st in
 * the workspace's zone, today included (reports/periods.ts), read against the same number of days before, as every period is.
 * `id` is what a request, the tab's storage and the control's choice call the period.
 */
export const REPORT_RANGES = [
  { days: 7, id: "7d", label: "7 days" },
  { days: 30, id: "30d", label: "30 days" },
  { days: 90, id: "90d", label: "90 days" },
  { days: null, id: "month", label: "Month" },
] as const;

export interface ReportPointVM {
  day: string;
  /** "Aug 28" */
  label: string;
  /** "28" */
  short: string;
  in: number;
  ai: number;
  you: number;
  none: number;
  calls: number;
  callSeconds: number;
  escalations: number;
  newPeople: number;
}

export interface ReportBarVM {
  id: string;
  label: string;
  value: number;
  /** 0..1 of the largest bar in its group. */
  share: number;
}

export interface ReportSpeedPointVM {
  day: string;
  label: string;
  short: string;
  p50: number | null;
  p90: number | null;
  /** fmtSeconds of each, so the page never formats a duration itself. */
  p50Label: string;
  p90Label: string;
  count: number;
}

export interface ReportWeekVM {
  axes: string[];
  long: string[];
  /** Messages and calls per weekday, Monday first: counts over a week, a weekday's average over a longer period. */
  current: number[];
  prior: number[] | null;
  /** The one busiest (quietest) weekday; null on a tie or with nothing in the period. */
  busiest: number | null;
  quietest: number | null;
  /** "count" when each weekday happened once in the period, "average" when some happened more than once. */
  unit: "count" | "average";
}

export interface ReportHoursVM {
  /** Messages and calls per hour of the day, the period summed. */
  values: number[];
  /** The first hour of the busiest two-hour window; null when nothing came in. */
  peak: number | null;
  /** How many came while the business was closed by its own hours and closures (closedOf); null where the workspace
   *  has not said its hours or the report has no arrivals. Never 8 to 8. */
  closed: number | null;
  /** Each hour in words, "12am" to "11pm", for the page's axis, tooltips and table. */
  labels: string[];
}

export interface ReportChannelVM {
  key: ReportChannelKey;
  label: string;
  value: number;
  prior: number;
}

/** The one sentence under each chart, or null for none. Each adds the next thing, never a number a tile, the hero or a legend gives. */
export interface ReportLinesVM {
  /** The headline beside the receptionist's share: how many of how many, and how fast: against the hold, where replies waited one. */
  hero: string;
  /** The share the period before, said beside the tick it draws on the ring; null with nothing answered then. */
  heroBefore: string | null;
  /** The Receptionist lens's head: how many of how many messages it answered without you, and, where most replies waited a hold, how many went out against it; null with nothing to answer. */
  receptionist: string | null;
  /** The busiest date: the answered card's own line. */
  answered: string | null;
  reply: string | null;
  calls: string | null;
  /** How many new people reached you, against the period before where there was one: the People lens's head until its own read lands (always a sentence; a quiet period has one too). */
  people: string;
  rhythm: string | null;
}

export interface ReportVM {
  days: number;
  rangeLabel: string;
  since: string;
  until: string;
  timezone: string;
  /** The business's today, "YYYY-MM-DD": what the period's control counts from, whatever days the report is of. */
  today: string;
  /** The report's last day, "YYYY-MM-DD": today for a period by name, an earlier day for days a member picked. */
  end: string;
  /** Whether the report ends today. One that does not is of days a member picked, and says them by their dates. */
  live: boolean;
  /** Nothing came in during the period: no customer message and no call. */
  empty: boolean;
  tiles: ReportTileVM[];
  /** `prior`: customer messages the period before, day for day (null where there is no such day). `share` and
   *  `priorShare`: the receptionist's part of the answered, 0..1, or null with nothing answered. */
  answered: {
    points: ReportPointVM[];
    totals: { in: number; ai: number; you: number; none: number };
    max: number;
    prior: (number | null)[];
    share: number | null;
    priorShare: number | null;
  };
  reasons: ReportBarVM[];
  /**
   * What Why it stopped draws: every reason, or the most frequent where there are more than a card holds, with the line
   * that says so (null when every one is drawn). The table beside it keeps `reasons`, all of them.
   */
  reasonsShown: { bars: ReportBarVM[]; line: string | null };
  replyTime: {
    count: number;
    median: number | null;
    p90: number | null;
    medianLabel: string;
    p90Label: string;
    buckets: ReportBarVM[];
    hold: ReportHoldVM | null;
    /** Each reply's seconds past its own hold, the latest 500 in the order asked: the dot plot's dots. */
    dots: ReplyDotVM[];
  };
  calls: {
    points: ReportPointVM[];
    total: number;
    minutes: number;
    voicemail: number;
    sentiments: ReportBarVM[];
    max: number;
    prior: (number | null)[];
  };
  people: {
    points: ReportPointVM[];
    total: number;
    max: number;
    prior: (number | null)[];
    /** New people added up over the period, and the period before's own running total day for day. */
    cumulative: { points: (ReportPointVM & { total: number })[]; prior: number[] | null };
  };
  /** v3: reply speed a day (up to two weeks) or a week at a time; null on a v2 payload. */
  speed: { unit: "day" | "week"; points: ReportSpeedPointVM[] } | null;
  week: ReportWeekVM;
  /** v3: null on a v2 payload. */
  hours: ReportHoursVM | null;
  /** True only when the workspace's profile was read and has no open day, on a report with arrivals: closed is unsaid. */
  hoursUnset: boolean;
  /** v3: null on a v2 payload; channels with nothing now or before are left out. */
  channels: ReportChannelVM[] | null;
  /** The two periods by name, said the same way in every legend, tooltip and table: "Last 30 days", "The 30 days before"; and "in the last 30 days" for a sentence. */
  period: { now: string; before: string; within: string };
  lines: ReportLinesVM;
  table: { columns: string[]; rows: (string | number)[][] };
}

/** A calendar day ("2026-09-04") as a local date, without the UTC shift that
 *  `new Date("2026-09-04")` would apply. */
export function dayDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** A calendar day ("2026-09-04") as words, "Sep 4": the date itself, read at its noon in UTC so no zone can move it. */
export function fmtDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return dateFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
    Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12),
  );
}

/** Days in words: "Sep 7 – Oct 6", or the one day's "Oct 6". The one way a report says a stretch of days. */
export const daysWords = (from: string, to: string): string =>
  from === to ? fmtDay(to) : `${fmtDay(from)} – ${fmtDay(to)}`;

/**
 * The day a report ended, where that was before the workspace's today; null where it ends today, which every report
 * did before a member could pick its days (00360) and a period by name still does. The one question the period's words
 * ask: a window that ended in September is not "the last 20 days".
 */
export const endedOn = (report: { today: string; end?: string | null }): string | null =>
  report.end && report.end < report.today ? report.end : null;

/** A calendar day as a chart's point names it: the day, "Aug 28", and the date alone, "28". */
export function dayPointOf(day: string): { day: string; label: string; short: string } {
  return { day, label: fmtDay(day), short: String(dayDate(day).getDate()) };
}

export function quantile(sorted: number[], quantity: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * quantity;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function bars(entries: [string, string, number][]): ReportBarVM[] {
  const max = Math.max(1, ...entries.map((e) => e[2]));
  return entries.map(([id, label, value]) => ({ id, label, value, share: value / max }));
}

/**
 * The period before, day for day beside the current one: the n days before them, newest last, and null where the
 * series has no day that far back (a workspace younger than two periods).
 */
export function priorOf<T>(count: number, previous: readonly T[], pick: (d: T) => number): (number | null)[] {
  return Array.from({ length: count }, (_, i) => {
    const j = previous.length - count + i;
    return j >= 0 ? pick(previous[j]) : null;
  });
}

export const REPORT_WEEK_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const REPORT_WEEK_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Monday 0 to Sunday 6. */
const weekdayOf = (day: string): number => (dayDate(day).getDay() + 6) % 7;

/**
 * Messages and calls on each weekday, Monday first: the count over a week, and each weekday's average over its own
 * days in a longer period, because 30 days hold five of two weekdays and four of the rest, and a sum would lean
 * toward whichever weekdays the window repeats. One decimal.
 */
export function weekOf(series: readonly ReportDayDto[]): number[] {
  const total = [0, 0, 0, 0, 0, 0, 0];
  const seen = [0, 0, 0, 0, 0, 0, 0];
  for (const d of series) {
    const w = weekdayOf(d.day);
    total[w] += (d.messages_in || 0) + (d.calls || 0);
    seen[w] += 1;
  }
  return total.map((t, w) => (seen[w] ? Math.round((t / seen[w]) * 10) / 10 : 0));
}

/** The index of the one value `wins` picks over every other; null when two share it, or when every value is 0. */
export function onlyIndex(values: readonly number[], wins: (a: number, b: number) => boolean): number | null {
  if (!values.some((v) => v > 0)) return null;
  let at = 0;
  for (let i = 1; i < values.length; i++) if (wins(values[i], values[at])) at = i;
  return values.filter((v) => v === values[at]).length === 1 ? at : null;
}

/** "12am", "9am", "12pm", "5pm"; 24 is midnight again. */
export function reportHourWords(hours: number): string {
  const x = ((hours % 24) + 24) % 24;
  return x === 0 ? "12am" : x < 12 ? `${x}am` : x === 12 ? "12pm" : `${x - 12}pm`;
}

/** The hours of the day, the period summed; the busiest two-hour window's first hour (the earliest on a tie); and
 *  what came while closed, as closedOf counted it. Null without v3's grid. */
export function hoursOf(
  grid: readonly (readonly number[])[] | undefined,
  closed: number | null = null,
): ReportHoursVM | null {
  if (!grid || !grid.length) return null;
  const values = Array.from({ length: 24 }, (_, h) => grid.reduce((s, row) => s + (Number(row?.[h]) || 0), 0));
  const total = values.reduce((a, b) => a + b, 0);
  let peak: number | null = null;
  if (total > 0) {
    peak = 0;
    for (let h = 1; h < 23; h++) if (values[h] + values[h + 1] > values[peak] + values[peak + 1]) peak = h;
  }
  return { values, peak, closed, labels: values.map((_, h) => reportHourWords(h)) };
}

/** The channels in their fixed order; one with nothing now and nothing before is left out. Null without v3. */
export function channelsOf(ch: ReportDto["channels"]): ReportChannelVM[] | null {
  if (!ch) return null;
  return REPORT_CHANNELS.map(({ key, label }) => ({
    key,
    label,
    value: Number(ch.current?.[key]) || 0,
    prior: Number(ch.previous?.[key]) || 0,
  })).filter((c) => c.value > 0 || c.prior > 0);
}
