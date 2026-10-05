/**
 * Reports — the receptionist's numbers over a period, as facts.
 *
 * The mockup's Reports page was built around revenue, bookings and eight
 * agents, none of which the schema holds. This report is what it does hold:
 * customer messages day by day, who answered them and how fast, when the
 * receptionist stopped and why, calls, and people who are new by evidence.
 * Every number here is a count over columns; no score, no estimate. Colors
 * are assigned by the page, never here.
 *
 * v3 (00139) adds where people reach the business (channels), when (the week
 * and the hours of the day) and every receptionist reply with its day. The
 * view model also says the one sentence under each chart (`lines`), so the
 * page composes no sentence of its own.
 */
import { reasonShort } from "../people/person-row-facts";
import { absoluteBuckets, heroSpeed, holdBuckets, holdLine, holdOf, type ReportHoldVM } from "./report-speed";
import { closedOf, hoursUnsetOf, type ReportArrivalDto, type ReportProfile } from "./report-closed";
import { REPORT_TILES, fmtSeconds, type ReportTileVM } from "./report-tiles";
import { sumOf } from "../shared/numbers";
import { DATE_FMT } from "../shared/time";
import { capitalize } from "../shared/words";

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

export const REPORT_RANGES: readonly { days: number; id: string; label: string }[] = [
  { days: 7, id: "7d", label: "7 days" },
  { days: 30, id: "30d", label: "30 days" },
  { days: 90, id: "90d", label: "90 days" },
];

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
  /** The status a bar stands for, when it has one (a caller's mood): the page gives it that status's colour, beside its word. */
  tone?: "" | "ok" | "danger";
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
  answered: string | null;
  reply: string | null;
  calls: string | null;
  channels: string | null;
  rhythm: string | null;
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
  replyTime: {
    count: number;
    median: number | null;
    p90: number | null;
    medianLabel: string;
    p90Label: string;
    buckets: ReportBarVM[];
    hold: ReportHoldVM | null;
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
  /** The two periods by name, said the same way in every legend, tooltip and table: "Last 30 days", "The 30 days before". */
  period: { now: string; before: string };
  lines: ReportLinesVM;
  table: { columns: string[]; rows: (string | number)[][] };
}

/** A calendar day ("2026-09-04") as a local date, without the UTC shift that
 *  `new Date("2026-09-04")` would apply. */
export function dayDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function fmtDay(day: string): string {
  return DATE_FMT.format(dayDate(day));
}

export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function bars(entries: [string, string, number][]): ReportBarVM[] {
  const max = Math.max(1, ...entries.map((e) => e[2]));
  return entries.map(([id, label, value]) => ({ id, label, value, share: value / max }));
}

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
function onlyIndex(values: readonly number[], wins: (a: number, b: number) => boolean): number | null {
  if (!values.some((v) => v > 0)) return null;
  let at = 0;
  for (let i = 1; i < values.length; i++) if (wins(values[i], values[at])) at = i;
  return values.filter((v) => v === values[at]).length === 1 ? at : null;
}

/** "12am", "9am", "12pm", "5pm"; 24 is midnight again. */
export function reportHourWords(h: number): string {
  const x = ((h % 24) + 24) % 24;
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

export function runningTotal(values: readonly (number | null)[]): number[] {
  let t = 0;
  return values.map((v) => (t += v || 0));
}

/**
 * The receptionist's reply time a day at a time up to two weeks, and a week at a time past that. Weeks end on the
 * period's last day so the newest point is a whole week; a first week of fewer than four days joins the next. The
 * median and the slowest tenth are taken from the replies themselves, never averaged from daily medians.
 */
export function speedOf(
  replies: readonly { day: string; s: number }[],
  days: readonly string[],
): { unit: "day" | "week"; points: ReportSpeedPointVM[] } {
  const byDay = new Map<string, number[]>();
  for (const r of replies) {
    if (!Number.isFinite(r.s)) continue;
    const xs = byDay.get(r.day) ?? [];
    xs.push(r.s);
    byDay.set(r.day, xs);
  }
  const point = (chunk: readonly string[]): ReportSpeedPointVM => {
    const s = chunk.flatMap((d) => byDay.get(d) ?? []).sort((a, b) => a - b);
    const first = chunk[0];
    const p50 = quantile(s, 0.5);
    const p90 = quantile(s, 0.9);
    return {
      day: first,
      label: fmtDay(first),
      short: chunk.length > 1 ? fmtDay(first) : String(dayDate(first).getDate()),
      p50,
      p90,
      p50Label: fmtSeconds(p50),
      p90Label: fmtSeconds(p90),
      count: s.length,
    };
  };
  if (days.length <= 14) return { unit: "day", points: days.map((d) => point([d])) };
  const weeks: string[][] = [];
  for (let end = days.length; end > 0; end -= 7) weeks.unshift(days.slice(Math.max(0, end - 7), end));
  if (weeks.length > 1 && weeks[0].length < 4) weeks.splice(0, 2, [...weeks[0], ...weeks[1]]);
  return { unit: "week", points: weeks.map(point) };
}

/** A caller's mood as the voice provider reads it ("Positive", "Neutral", "Negative", "Unknown"), as a status tone. */
export function callMoodTone(sentiment: string): "" | "ok" | "danger" {
  return sentiment === "Positive" ? "ok" : sentiment === "Negative" ? "danger" : "";
}

/** A mood is a scale, so it reads in its own order (good, then neither, then bad), never by count. */
const moodRank = (s: string): number => (s === "Positive" ? 0 : s === "Negative" ? 2 : 1);

/** "Monday", "Monday or Tuesday", "Monday, Tuesday or Sunday". */
const listWords = (names: readonly string[], last: "or" | "and"): string =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} ${last} ${names[names.length - 1]}`;

/** A channel inside a sentence: calls, email and texts are common nouns there; WhatsApp is a name. */
const channelNoun = (c: ReportChannelVM): string =>
  c.key === "voice" ? "calls" : c.key === "email" ? "email" : c.key === "sms" ? "texts" : c.label;

/** Where people reached the business, beside where they reached it the period before. */
function channelsLine(channels: ReportChannelVM[] | null, rangeLabel: string): string | null {
  if (!channels) return null;
  const reached = channels.reduce((s, c) => s + c.value, 0);
  if (!reached) return null;
  const top = channels.reduce((a, c) => (c.value > a.value ? c : a));
  const lead =
    top.value * 2 > reached
      ? `Mostly ${channelNoun(top)}`
      : `${capitalize(channelNoun(top))} ${top.key === "voice" || top.key === "sms" ? "lead" : "leads"}`;
  const before = channels.reduce((s, c) => s + c.prior, 0);
  if (!before) return `${lead}.`;
  const wasTop = channels.reduce((a, c) => (c.prior > a.prior ? c : a));
  if (wasTop.key === top.key) return `${lead}, as the ${rangeLabel} before.`;
  return `${capitalize(channelNoun(top))} took over from ${channelNoun(wasTop)}.`;
}

/**
 * The quiet side of the week (Worth knowing says the busy side): the days nothing came in, or the quietest one. Said
 * of one week as days ("Monday was the quietest day") and of a longer period as weekdays ("Quietest on Mondays").
 */
function rhythmLine(week: ReportWeekVM): string | null {
  if (!week.current.some((v) => v > 0)) return null;
  const avg = week.unit === "average";
  const name = (i: number): string => (avg ? `${week.long[i]}s` : week.long[i]);
  const idle = week.current.flatMap((v, i) => (v === 0 ? [i] : []));
  if (idle.length >= 4)
    return `Only on ${listWords(
      week.current.flatMap((v, i) => (v > 0 ? [name(i)] : [])),
      "and",
    )}.`;
  if (idle.length) return `Nothing on ${listWords(idle.map(name), "or")}.`;
  if (week.quietest === null) return null;
  return avg ? `Quietest on ${name(week.quietest)}.` : `${week.long[week.quietest]} was the quietest day.`;
}

/**
 * What every part of the report is built from, counted once: the period asked for (the series' last `days`) and the
 * one before it, the current days as points, both periods' totals and the receptionist's share of the answered, the
 * range in words, and its reply times in order.
 */
function periodFactsOf(dto: ReportDto) {
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
    in: sumOf(current.map((d) => d.messages_in)),
    ai: sumOf(current.map((d) => d.answered_ai)),
    you: sumOf(current.map((d) => d.answered_you)),
    none: sumOf(current.map((d) => d.unanswered)),
    escalations: sumOf(current.map((d) => d.escalations)),
    calls: sumOf(current.map((d) => d.calls)),
    callSeconds: sumOf(current.map((d) => d.call_seconds)),
    newPeople: sumOf(current.map((d) => d.new_contacts)),
  };
  const prev = {
    in: sumOf(previous.map((d) => d.messages_in)),
    ai: sumOf(previous.map((d) => d.answered_ai)),
    you: sumOf(previous.map((d) => d.answered_you)),
    none: sumOf(previous.map((d) => d.unanswered)),
    escalations: sumOf(previous.map((d) => d.escalations)),
    calls: sumOf(previous.map((d) => d.calls)),
    newPeople: sumOf(previous.map((d) => d.new_contacts)),
  };
  const noun = `${days} days`;
  const answeredTotal = tot.ai + tot.you + tot.none;
  const prevAnsweredTotal = prev.ai + prev.you + prev.none;
  const sortedReply = [...(dto.reply_seconds ?? [])].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return {
    dto,
    days,
    current,
    previous,
    points,
    tot,
    prev,
    noun,
    rangeLabel: REPORT_RANGES.find((r) => r.days === days)?.label ?? noun,
    // A comparison needs a period before that was lived in: its zeros are a count only if someone reached the business.
    priorHadAny: prev.in + prev.calls > 0,
    answeredTotal,
    aiShare: answeredTotal ? Math.round((tot.ai / answeredTotal) * 100) : null,
    prevAnsweredTotal,
    prevShare: prevAnsweredTotal ? Math.round((prev.ai / prevAnsweredTotal) * 100) : null,
    sortedReply,
    median: quantile(sortedReply, 0.5),
    p90: quantile(sortedReply, 0.9),
    // The replies against their holds, said once for the tile, the bars, the hero and the line (holdOf).
    hold: holdOf(dto.replies),
  };
}

/** The facts every part of the report is built from (periodFactsOf). */
export type PeriodFacts = ReturnType<typeof periodFactsOf>;

/** Why the receptionist handed over, the most frequent first, in the owner's words. */
const reasonBarsOf = (reasons: ReportDto["reasons"]): ReportBarVM[] =>
  bars(
    Object.entries(reasons ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => [r, capitalize(reasonShort(r)) || r, n] as [string, string, number]),
  );

/** The callers' moods in their own order (good, then neither, then bad), each with its status. */
const moodBarsOf = (sentiments: ReportDto["sentiments"]): ReportBarVM[] =>
  bars(
    Object.entries(sentiments ?? {})
      .sort((a, b) => moodRank(a[0]) - moodRank(b[0]) || b[1] - a[1])
      .map(([s, n]) => [s, s, n] as [string, string, number]),
  ).map((b) => ({ ...b, tone: callMoodTone(b.id) }));

/** Messages and calls per weekday, now and the period before, and the one busiest and quietest. */
function weekShapeOf({ current, previous }: PeriodFacts): ReportWeekVM {
  const weekNow = weekOf(current);
  const weekBefore = weekOf(previous);
  return {
    axes: [...REPORT_WEEK_SHORT],
    long: [...REPORT_WEEK_LONG],
    current: weekNow,
    prior: weekBefore.some((v) => v > 0) ? weekBefore : null,
    busiest: onlyIndex(weekNow, (a, b) => a > b),
    quietest: onlyIndex(weekNow, (a, b) => a < b),
    unit: current.length > 7 ? "average" : "count",
  };
}

/** Who answered the customer messages day by day, the period before beside them, and the receptionist's share. */
function answeredOf(f: PeriodFacts): ReportVM["answered"] {
  const { current, previous, points, tot, prev, answeredTotal, prevAnsweredTotal } = f;
  return {
    points,
    totals: { in: tot.in, ai: tot.ai, you: tot.you, none: tot.none },
    max: Math.max(1, ...points.map((p) => p.ai + p.you + p.none)),
    prior: priorOf(current.length, previous, (d) => d.messages_in),
    share: answeredTotal ? tot.ai / answeredTotal : null,
    priorShare: prevAnsweredTotal ? prev.ai / prevAnsweredTotal : null,
  };
}

/** The receptionist's reply times: how many, the median and the slowest tenth, the bars, and the hold. The bars count
 *  against the hold where replies waited one, as the hero and the line do, else on the seconds a reply took. */
function replyTimeOf({ dto, sortedReply, median, p90, hold }: PeriodFacts): ReportVM["replyTime"] {
  return {
    count: sortedReply.length,
    median,
    p90,
    medianLabel: fmtSeconds(median),
    p90Label: fmtSeconds(p90),
    buckets: bars(holdBuckets(dto.replies) ?? absoluteBuckets(sortedReply)),
    hold,
  };
}

/** The calls day by day, the period before beside them, the minutes, voicemail and the callers' moods. */
function callsOf({ dto, current, previous, points, tot }: PeriodFacts, sentiments: ReportBarVM[]): ReportVM["calls"] {
  return {
    points,
    total: tot.calls,
    minutes: Math.round(tot.callSeconds / 60),
    voicemail: dto.voicemail ?? 0,
    sentiments,
    max: Math.max(1, ...points.map((p) => p.calls)),
    prior: priorOf(current.length, previous, (d) => d.calls),
  };
}

/** New people day by day, the period before beside them, and each period added up. */
function peopleOf({ current, previous, points, tot, prev }: PeriodFacts): ReportVM["people"] {
  const peopleBefore = priorOf(current.length, previous, (d) => d.new_contacts);
  const peopleRun = runningTotal(points.map((p) => p.newPeople));
  return {
    points,
    total: tot.newPeople,
    max: Math.max(1, ...points.map((p) => p.newPeople)),
    prior: peopleBefore,
    cumulative: {
      points: points.map((p, i) => ({ ...p, total: peopleRun[i] })),
      prior: prev.newPeople > 0 ? runningTotal(peopleBefore) : null,
    },
  };
}

/** The line under the speed chart: what took longer than the hold, or, with no hold, the slowest tenth. */
function replyLine({ sortedReply, p90, hold }: PeriodFacts): string | null {
  if (hold) return holdLine(hold);
  // Nine in ten is a claim about a tenth: under ten replies it would be a guess, so the slowest one is said instead.
  if (sortedReply.length >= 10) return `Nine in ten within ${fmtSeconds(p90)}.`;
  return sortedReply.length ? `The slowest took ${fmtSeconds(sortedReply[sortedReply.length - 1])}.` : null;
}

/** The one sentence under each chart, each adding the next thing (ReportLinesVM). */
function linesOf(f: PeriodFacts, week: ReportWeekVM, channels: ReportChannelVM[] | null): ReportLinesVM {
  const { points, tot, prev, rangeLabel, answeredTotal, prevAnsweredTotal } = f;
  // The busiest date (the first of a tie): Worth knowing names the busiest weekday, this the one day.
  const busiestDay = tot.in ? points.reduce((b, p) => (p.in > b.in ? p : b)) : null;
  return {
    hero: answeredTotal
      ? `${tot.ai} of ${answeredTotal} customer messages, without you.${heroSpeed(f.sortedReply.length, fmtSeconds(f.median), f.hold)}`
      : "No customer wrote in this period.",
    heroBefore: prevAnsweredTotal
      ? `${Math.round((prev.ai / prevAnsweredTotal) * 100)}% the ${rangeLabel} before`
      : null,
    answered: busiestDay ? `Most messages on ${busiestDay.label}: ${busiestDay.in}.` : null,
    reply: replyLine(f),
    calls: tot.calls ? `About ${fmtSeconds(tot.callSeconds / tot.calls)} a call.` : null,
    channels: channelsLine(channels, rangeLabel),
    rhythm: rhythmLine(week),
  };
}

/** The Reports page's view model: a builder per part, over the facts counted once. `profile` is the workspace's hours
 *  and closures, null where they could not be read; required, so each caller says (the node tests may leave it off). */
export function toReportVM(dto: ReportDto, opts: { profile: ReportProfile | null }): ReportVM {
  const f = periodFactsOf(dto);
  // Built first, in the order the DTO has always been read: the calls take the moods, the lines the week and channels.
  const tiles = REPORT_TILES.map((tile) => tile(f));
  const reasons = reasonBarsOf(dto.reasons);
  const sentiments = moodBarsOf(dto.sentiments);
  const week = weekShapeOf(f);
  const channels = channelsOf(dto.channels);
  const first = f.current[0]?.day;
  const last = f.current[f.current.length - 1]?.day;
  return {
    days: f.days,
    rangeLabel: f.rangeLabel,
    since: first ? fmtDay(first) : "",
    until: last ? fmtDay(last) : "",
    timezone: dto.timezone,
    empty: f.tot.in === 0 && f.tot.calls === 0,
    tiles,
    answered: answeredOf(f),
    reasons,
    replyTime: replyTimeOf(f),
    calls: callsOf(f, sentiments),
    people: peopleOf(f),
    speed: dto.replies
      ? speedOf(
          dto.replies,
          f.current.map((d) => d.day),
        )
      : null,
    week,
    hours: hoursOf(dto.hours, closedOf(dto.arrivals, opts?.profile)),
    hoursUnset: hoursUnsetOf(dto.arrivals, opts?.profile),
    channels,
    period: { now: `Last ${f.rangeLabel}`, before: `The ${f.rangeLabel} before` },
    lines: linesOf(f, week, channels),
    table: {
      columns: [
        "Day",
        "Customer messages",
        "Answered by receptionist",
        "Answered by you",
        "Unanswered",
        "Calls",
        "Needed you",
        "New people",
      ],
      rows: f.points.map((p) => [p.label, p.in, p.ai, p.you, p.none, p.calls, p.escalations, p.newPeople]),
    },
  };
}
