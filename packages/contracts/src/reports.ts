/**
 * Reports — the receptionist's numbers over a period, as facts.
 *
 * The mockup's Reports page was built around revenue, bookings and eight
 * agents, none of which the schema holds. This report is what it does hold:
 * customer messages day by day, who answered them and how fast, when the
 * receptionist stopped and why, calls, and people who are new by evidence.
 * Every number here is a count over columns; no score, no estimate. Colors
 * are assigned by the page, never here.
 */
import { reasonShort } from "./people";

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

/** What `report_series(tenant, days)` returns. `series` spans TWO periods —
 *  the requested one and the one before it — newest last. */
export interface ReportDto {
  timezone: string;
  days: number;
  span_days: number;
  today: string;
  series: ReportDayDto[];
  reasons: Record<string, number>;
  reply_seconds: number[];
  sentiments: Record<string, number>;
  voicemail: number;
  error?: string;
}

export const REPORT_RANGES: readonly { days: number; id: string; label: string }[] = [
  { days: 7, id: "7d", label: "7 days" },
  { days: 30, id: "30d", label: "30 days" },
  { days: 90, id: "90d", label: "90 days" },
];

export interface ReportTileVM {
  id: string;
  label: string;
  value: string;
  meta: string;
  /** Signed change against the previous period, or null when there is no
   *  prior data to compare with (never a fabricated 0%). */
  delta: { text: string; tone: "pos" | "neg" | "" } | null;
  /** One point per day of the current period, for the sparkline. */
  spark: number[];
}

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

export interface ReportVM {
  days: number;
  rangeLabel: string;
  since: string;
  until: string;
  timezone: string;
  /** Nothing came in during the period: no customer message and no call. */
  empty: boolean;
  tiles: ReportTileVM[];
  /** `prior`: customer messages the period before, day for day (null where there is no such day). */
  answered: { points: ReportPointVM[]; totals: { in: number; ai: number; you: number; none: number }; max: number; prior: (number | null)[] };
  reasons: ReportBarVM[];
  replyTime: { count: number; median: number | null; p90: number | null; medianLabel: string; p90Label: string; buckets: ReportBarVM[] };
  calls: { points: ReportPointVM[]; total: number; minutes: number; voicemail: number; sentiments: ReportBarVM[]; max: number; prior: (number | null)[] };
  people: { points: ReportPointVM[]; total: number; max: number; prior: (number | null)[] };
  table: { columns: string[]; rows: (string | number)[][] };
}

const DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });

/** A calendar day ("2026-09-04") as a local date, without the UTC shift that
 *  `new Date("2026-09-04")` would apply. */
export function dayDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function fmtDay(day: string): string {
  return DATE_FMT.format(dayDate(day));
}

/** "12s", "1m 05s", "14m", "2h 10m". */
export function fmtSeconds(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "—";
  const v = Math.max(0, Math.round(s));
  if (v < 60) return `${v}s`;
  if (v < 600) return `${Math.floor(v / 60)}m ${String(v % 60).padStart(2, "0")}s`;
  if (v < 3600) return `${Math.round(v / 60)}m`;
  return `${Math.floor(v / 3600)}h ${String(Math.round((v % 3600) / 60)).padStart(2, "0")}m`;
}

export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Signed change vs the previous period. Null when the previous period has
 * nothing to compare against: "+∞%" and "vs 0" are not information.
 * `upIsGood` decides the tone; a change of zero has none.
 */
export function deltaOf(current: number, previous: number, upIsGood: boolean, noun: string): ReportTileVM["delta"] {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: `same as the prior ${noun}`, tone: "" };
  const up = pct > 0;
  return { text: `${up ? "+" : ""}${pct}% vs prior ${noun}`, tone: up === upIsGood ? "pos" : "neg" };
}

/**
 * A share against the prior period's share, in percentage points — never a
 * percentage of a percentage, and null when either period has nothing to
 * take a share of.
 */
export function pointsDelta(current: number | null, previous: number | null, noun: string): ReportTileVM["delta"] {
  if (current === null || previous === null) return null;
  const pts = current - previous;
  if (pts === 0) return { text: `same share as the prior ${noun}`, tone: "" };
  return { text: `${pts > 0 ? "+" : ""}${pts} pts vs prior ${noun}`, tone: pts > 0 ? "pos" : "neg" };
}

const REPLY_BUCKETS: { id: string; label: string; max: number }[] = [
  { id: "lt15", label: "under 15s", max: 15 },
  { id: "lt60", label: "15s – 1m", max: 60 },
  { id: "lt300", label: "1 – 5m", max: 300 },
  { id: "lt1800", label: "5 – 30m", max: 1800 },
  { id: "gte1800", label: "over 30m", max: Infinity },
];

function bars(entries: [string, string, number][]): ReportBarVM[] {
  const max = Math.max(1, ...entries.map((e) => e[2]));
  return entries.map(([id, label, value]) => ({ id, label, value, share: value / max }));
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The period before, day for day beside the current one: the n days before them, newest last, and null where the
 * series has no day that far back (a workspace younger than two periods).
 */
export function priorOf<T>(n: number, previous: readonly T[], pick: (d: T) => number): (number | null)[] {
  return Array.from({ length: n }, (_, i) => {
    const j = previous.length - n + i;
    return j >= 0 ? pick(previous[j]) : null;
  });
}

export function toReportVM(dto: ReportDto): ReportVM {
  const days = dto.days;
  const series = dto.series ?? [];
  const current = series.slice(-days);
  const previous = series.slice(0, Math.max(0, series.length - days));
  const points: ReportPointVM[] = current.map((d) => ({
    day: d.day,
    label: fmtDay(d.day),
    short: String(dayDate(d.day).getDate()),
    in: d.messages_in,
    ai: d.answered_ai,
    you: d.answered_you,
    none: d.unanswered,
    calls: d.calls,
    callSeconds: d.call_seconds,
    escalations: d.escalations,
    newPeople: d.new_contacts,
  }));

  const tot = {
    in: sum(current.map((d) => d.messages_in)),
    ai: sum(current.map((d) => d.answered_ai)),
    you: sum(current.map((d) => d.answered_you)),
    none: sum(current.map((d) => d.unanswered)),
    escalations: sum(current.map((d) => d.escalations)),
    calls: sum(current.map((d) => d.calls)),
    callSeconds: sum(current.map((d) => d.call_seconds)),
    newPeople: sum(current.map((d) => d.new_contacts)),
  };
  const prev = {
    in: sum(previous.map((d) => d.messages_in)),
    ai: sum(previous.map((d) => d.answered_ai)),
    you: sum(previous.map((d) => d.answered_you)),
    none: sum(previous.map((d) => d.unanswered)),
    escalations: sum(previous.map((d) => d.escalations)),
    calls: sum(previous.map((d) => d.calls)),
    newPeople: sum(previous.map((d) => d.new_contacts)),
  };
  const noun = `${days} days`;
  const answeredTotal = tot.ai + tot.you + tot.none;
  const aiShare = answeredTotal ? Math.round((tot.ai / answeredTotal) * 100) : null;
  const prevAnsweredTotal = prev.ai + prev.you + prev.none;
  const prevShare = prevAnsweredTotal ? Math.round((prev.ai / prevAnsweredTotal) * 100) : null;

  const sortedReply = [...(dto.reply_seconds ?? [])].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const median = quantile(sortedReply, 0.5);
  const p90 = quantile(sortedReply, 0.9);
  const bucketCounts = REPLY_BUCKETS.map((b, i) => {
    const lo = i === 0 ? -Infinity : REPLY_BUCKETS[i - 1].max;
    return [b.id, b.label, sortedReply.filter((s) => s >= lo && s < b.max).length] as [string, string, number];
  });

  const tiles: ReportTileVM[] = [
    {
      id: "messages",
      label: "Customer messages",
      value: String(tot.in),
      meta: tot.in ? `on ${current.filter((d) => d.messages_in > 0).length} of ${days} days` : "none in this period",
      delta: deltaOf(tot.in, prev.in, true, noun),
      spark: points.map((p) => p.in),
    },
    {
      id: "answered",
      label: "Receptionist answered",
      value: aiShare === null ? "—" : `${aiShare}%`,
      meta: answeredTotal ? `${tot.ai} of ${answeredTotal} · ${tot.you} by you · ${tot.none} unanswered` : "nothing to answer",
      // A share compares in POINTS. Against counts, the share could fall from
      // 100% to 60% while the delta read +20% in green.
      delta: pointsDelta(aiShare, prevShare, noun),
      spark: points.map((p) => p.ai),
    },
    {
      id: "reply",
      label: "Median reply time",
      value: fmtSeconds(median),
      meta: sortedReply.length ? `slowest tenth ${fmtSeconds(p90)} · ${sortedReply.length} replies` : "no receptionist replies yet",
      delta: null,
      spark: [],
    },
    {
      id: "needed",
      label: "Needed you",
      value: String(tot.escalations),
      meta: tot.escalations ? "times the receptionist stopped" : "the receptionist never stopped",
      delta: deltaOf(tot.escalations, prev.escalations, false, noun),
      spark: points.map((p) => p.escalations),
    },
    {
      id: "calls",
      label: "Calls",
      value: String(tot.calls),
      meta: tot.calls ? `${Math.max(1, Math.round(tot.callSeconds / 60))} min on the phone · ${dto.voicemail ?? 0} to voicemail` : "no calls",
      delta: deltaOf(tot.calls, prev.calls, true, noun),
      spark: points.map((p) => p.calls),
    },
    {
      id: "people",
      label: "New people",
      value: String(tot.newPeople),
      meta: tot.newPeople ? "first contact in this period, by evidence" : "nobody new",
      delta: deltaOf(tot.newPeople, prev.newPeople, true, noun),
      spark: points.map((p) => p.newPeople),
    },
  ];

  const reasons = bars(
    Object.entries(dto.reasons ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => [r, capitalize(reasonShort(r)) || r, n] as [string, string, number]),
  );
  const sentiments = bars(
    Object.entries(dto.sentiments ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => [s, s, n] as [string, string, number]),
  );

  const first = current[0]?.day;
  const last = current[current.length - 1]?.day;
  return {
    days,
    rangeLabel: REPORT_RANGES.find((r) => r.days === days)?.label ?? `${days} days`,
    since: first ? fmtDay(first) : "",
    until: last ? fmtDay(last) : "",
    timezone: dto.timezone,
    empty: tot.in === 0 && tot.calls === 0,
    tiles,
    answered: { points, totals: { in: tot.in, ai: tot.ai, you: tot.you, none: tot.none }, max: Math.max(1, ...points.map((p) => p.ai + p.you + p.none)), prior: priorOf(current.length, previous, (d) => d.messages_in) },
    reasons,
    replyTime: {
      count: sortedReply.length,
      median,
      p90,
      medianLabel: fmtSeconds(median),
      p90Label: fmtSeconds(p90),
      buckets: bars(bucketCounts),
    },
    calls: { points, total: tot.calls, minutes: Math.round(tot.callSeconds / 60), voicemail: dto.voicemail ?? 0, sentiments, max: Math.max(1, ...points.map((p) => p.calls)), prior: priorOf(current.length, previous, (d) => d.calls) },
    people: { points, total: tot.newPeople, max: Math.max(1, ...points.map((p) => p.newPeople)), prior: priorOf(current.length, previous, (d) => d.new_contacts) },
    table: {
      columns: ["Day", "Customer messages", "Answered by receptionist", "Answered by you", "Unanswered", "Calls", "Needed you", "New people"],
      rows: points.map((p) => [p.label, p.in, p.ai, p.you, p.none, p.calls, p.escalations, p.newPeople]),
    },
  };
}
