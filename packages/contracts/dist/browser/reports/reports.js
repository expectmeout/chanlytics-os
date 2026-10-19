import { shiftKey } from "../calendar/day-keys.js";
import { reasonShort } from "../conversations/escalations.js";
import {
  absoluteBuckets,
  heroSpeed,
  holdBuckets,
  holdLine,
  holdOf,
  receptionistSpeed,
  replyDotsOf
} from "./report-speed.js";
import { closedOf, hoursUnsetOf } from "./report-closed.js";
import { REPORT_TILES, beforeWords, fmtSeconds, newPeopleLine } from "./report-tiles.js";
import { pct, sumOf } from "../shared/numbers.js";
import { DATE_FMT } from "../shared/time.js";
import { capitalize, plural } from "../shared/words.js";
export const REPORT_CHANNELS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "voice", label: "Calls" },
  { key: "email", label: "Email" },
  { key: "sms", label: "Text" }
];
export const REPORT_RANGES = [
  { days: 7, id: "7d", label: "7 days" },
  { days: 30, id: "30d", label: "30 days" },
  { days: 90, id: "90d", label: "90 days" },
  { days: null, id: "month", label: "Month" }
];
function dayDate(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
export function fmtDay(day) {
  return DATE_FMT.format(dayDate(day));
}
export const daysWords = (from, to) => from === to ? fmtDay(to) : `${fmtDay(from)} \u2013 ${fmtDay(to)}`;
export const endedOn = (report) => report.end && report.end < report.today ? report.end : null;
export function dayPointOf(day) {
  return { day, label: fmtDay(day), short: String(dayDate(day).getDate()) };
}
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function bars(entries) {
  const max = Math.max(1, ...entries.map((e) => e[2]));
  return entries.map(([id, label, value]) => ({ id, label, value, share: value / max }));
}
export function priorOf(n, previous, pick) {
  return Array.from({ length: n }, (_, i) => {
    const j = previous.length - n + i;
    return j >= 0 ? pick(previous[j]) : null;
  });
}
export const REPORT_WEEK_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const REPORT_WEEK_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const weekdayOf = (day) => (dayDate(day).getDay() + 6) % 7;
export function weekOf(series) {
  const total = [0, 0, 0, 0, 0, 0, 0];
  const seen = [0, 0, 0, 0, 0, 0, 0];
  for (const d of series) {
    const w = weekdayOf(d.day);
    total[w] += (d.messages_in || 0) + (d.calls || 0);
    seen[w] += 1;
  }
  return total.map((t, w) => seen[w] ? Math.round(t / seen[w] * 10) / 10 : 0);
}
function onlyIndex(values, wins) {
  if (!values.some((v) => v > 0)) return null;
  let at = 0;
  for (let i = 1; i < values.length; i++) if (wins(values[i], values[at])) at = i;
  return values.filter((v) => v === values[at]).length === 1 ? at : null;
}
export function reportHourWords(h) {
  const x = (h % 24 + 24) % 24;
  return x === 0 ? "12am" : x < 12 ? `${x}am` : x === 12 ? "12pm" : `${x - 12}pm`;
}
export function hoursOf(grid, closed = null) {
  if (!grid || !grid.length) return null;
  const values = Array.from({ length: 24 }, (_, h) => grid.reduce((s, row) => s + (Number(row?.[h]) || 0), 0));
  const total = values.reduce((a, b) => a + b, 0);
  let peak = null;
  if (total > 0) {
    peak = 0;
    for (let h = 1; h < 23; h++) if (values[h] + values[h + 1] > values[peak] + values[peak + 1]) peak = h;
  }
  return { values, peak, closed, labels: values.map((_, h) => reportHourWords(h)) };
}
export function channelsOf(ch) {
  if (!ch) return null;
  return REPORT_CHANNELS.map(({ key, label }) => ({
    key,
    label,
    value: Number(ch.current?.[key]) || 0,
    prior: Number(ch.previous?.[key]) || 0
  })).filter((c) => c.value > 0 || c.prior > 0);
}
export function runningTotal(values) {
  let t = 0;
  return values.map((v) => t += v || 0);
}
export function speedOf(replies, days) {
  const byDay = /* @__PURE__ */ new Map();
  for (const r of replies) {
    if (!Number.isFinite(r.s)) continue;
    const xs = byDay.get(r.day) ?? [];
    xs.push(r.s);
    byDay.set(r.day, xs);
  }
  const point = (chunk) => {
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
      count: s.length
    };
  };
  if (days.length <= 14) return { unit: "day", points: days.map((d) => point([d])) };
  const weeks = [];
  for (let end = days.length; end > 0; end -= 7) weeks.unshift(days.slice(Math.max(0, end - 7), end));
  if (weeks.length > 1 && weeks[0].length < 4) weeks.splice(0, 2, [...weeks[0], ...weeks[1]]);
  return { unit: "week", points: weeks.map(point) };
}
const moodRank = (s) => s === "Positive" ? 0 : s === "Negative" ? 2 : 1;
const listWords = (names, last) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} ${last} ${names[names.length - 1]}`;
function rhythmLine(week) {
  if (!week.current.some((v) => v > 0)) return null;
  const avg = week.unit === "average";
  const name = (i) => avg ? `${week.long[i]}s` : week.long[i];
  const idle = week.current.flatMap((v, i) => v === 0 ? [i] : []);
  if (idle.length >= 4)
    return `Only on ${listWords(
      week.current.flatMap((v, i) => v > 0 ? [name(i)] : []),
      "and"
    )}.`;
  if (idle.length) return `Nothing on ${listWords(idle.map(name), "or")}.`;
  if (week.quietest === null) return null;
  return avg ? `Quietest on ${name(week.quietest)}.` : `${week.long[week.quietest]} was the quietest day.`;
}
export const rangeLabelOf = (days) => REPORT_RANGES.find((r) => r.days === days)?.label ?? plural(days, "day");
export const periodWords = (days, until) => {
  const rangeLabel = rangeLabelOf(days);
  const before = capitalize(beforeWords(rangeLabel));
  if (until === null) return { now: `Last ${rangeLabel}`, before, within: `in the last ${rangeLabel}` };
  return {
    now: daysWords(shiftKey(until, -(days - 1)), until),
    before,
    within: days === 1 ? `on ${fmtDay(until)}` : `in the ${rangeLabel} to ${fmtDay(until)}`
  };
};
export const withinWords = (days, until) => days === 1 && until === null ? "today" : periodWords(days, until).within;
function periodFactsOf(dto) {
  const days = dto.days;
  const series = dto.series ?? [];
  const current = series.slice(-days);
  const previous = series.slice(0, Math.max(0, series.length - days));
  const points = current.map((d) => ({
    ...dayPointOf(d.day),
    in: d.messages_in,
    ai: d.answered_ai,
    you: d.answered_you,
    none: d.unanswered,
    calls: d.calls,
    callSeconds: d.call_seconds,
    escalations: d.escalations,
    newPeople: d.new_contacts
  }));
  const tot = {
    in: sumOf(current.map((d) => d.messages_in)),
    ai: sumOf(current.map((d) => d.answered_ai)),
    you: sumOf(current.map((d) => d.answered_you)),
    none: sumOf(current.map((d) => d.unanswered)),
    escalations: sumOf(current.map((d) => d.escalations)),
    calls: sumOf(current.map((d) => d.calls)),
    callSeconds: sumOf(current.map((d) => d.call_seconds)),
    newPeople: sumOf(current.map((d) => d.new_contacts))
  };
  const prev = {
    in: sumOf(previous.map((d) => d.messages_in)),
    ai: sumOf(previous.map((d) => d.answered_ai)),
    you: sumOf(previous.map((d) => d.answered_you)),
    none: sumOf(previous.map((d) => d.unanswered)),
    escalations: sumOf(previous.map((d) => d.escalations)),
    calls: sumOf(previous.map((d) => d.calls)),
    newPeople: sumOf(previous.map((d) => d.new_contacts))
  };
  const noun = plural(days, "day");
  const until = endedOn(dto);
  const answeredTotal = tot.ai + tot.you + tot.none;
  const prevAnsweredTotal = prev.ai + prev.you + prev.none;
  const sortedReply = [...dto.reply_seconds ?? []].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return {
    dto,
    days,
    current,
    previous,
    points,
    tot,
    prev,
    noun,
    /** The day the period ended, where that was before today; null for one that ends today (endedOn). */
    until,
    rangeLabel: rangeLabelOf(days),
    // A comparison needs a period before that was lived in: its zeros are a count only if someone reached the business.
    priorHadAny: prev.in + prev.calls > 0,
    /** Nobody wrote or called in the period: no customer message and no call. */
    empty: tot.in === 0 && tot.calls === 0,
    answeredTotal,
    aiShare: pct(tot.ai, answeredTotal),
    prevAnsweredTotal,
    prevShare: pct(prev.ai, prevAnsweredTotal),
    sortedReply,
    median: quantile(sortedReply, 0.5),
    p90: quantile(sortedReply, 0.9),
    // The replies against their holds, said once for the tile, the bars, the hero and the line (holdOf).
    hold: holdOf(dto.replies)
  };
}
const reasonBarsOf = (reasons) => {
  const byLabel = /* @__PURE__ */ new Map();
  for (const [r, n] of Object.entries(reasons ?? {}).sort((a, b) => b[1] - a[1])) {
    const label = capitalize(reasonShort(r)) || r;
    const had = byLabel.get(label);
    byLabel.set(label, had ? [had[0], label, had[2] + n] : [r, label, n]);
  }
  return bars([...byLabel.values()].sort((a, b) => b[2] - a[2]));
};
const REPORT_REASONS_SHOWN = 7;
const reasonsShownOf = (reasons) => {
  if (reasons.length <= REPORT_REASONS_SHOWN + 1) return { bars: reasons, line: null };
  const top = reasons.slice(0, REPORT_REASONS_SHOWN);
  return {
    bars: bars(top.map((r) => [r.id, r.label, r.value])),
    line: `The ${REPORT_REASONS_SHOWN} most frequent of ${reasons.length} reasons. The table lists them all.`
  };
};
const moodBarsOf = (sentiments) => bars(
  Object.entries(sentiments ?? {}).sort((a, b) => moodRank(a[0]) - moodRank(b[0]) || b[1] - a[1]).map(([s, n]) => [s, s, n])
);
function weekShapeOf({ current, previous }) {
  const weekNow = weekOf(current);
  const weekBefore = weekOf(previous);
  return {
    axes: [...REPORT_WEEK_SHORT],
    long: [...REPORT_WEEK_LONG],
    current: weekNow,
    prior: weekBefore.some((v) => v > 0) ? weekBefore : null,
    busiest: onlyIndex(weekNow, (a, b) => a > b),
    quietest: onlyIndex(weekNow, (a, b) => a < b),
    unit: current.length > 7 ? "average" : "count"
  };
}
function answeredOf(f) {
  const { current, previous, points, tot, prev, answeredTotal, prevAnsweredTotal } = f;
  return {
    points,
    totals: { in: tot.in, ai: tot.ai, you: tot.you, none: tot.none },
    max: Math.max(1, ...points.map((p) => p.ai + p.you + p.none)),
    prior: priorOf(current.length, previous, (d) => d.messages_in),
    share: answeredTotal ? tot.ai / answeredTotal : null,
    priorShare: prevAnsweredTotal ? prev.ai / prevAnsweredTotal : null
  };
}
function replyTimeOf({ dto, sortedReply, median, p90, hold }) {
  return {
    count: sortedReply.length,
    median,
    p90,
    medianLabel: fmtSeconds(median),
    p90Label: fmtSeconds(p90),
    buckets: bars(holdBuckets(dto.replies) ?? absoluteBuckets(sortedReply)),
    hold,
    dots: replyDotsOf(dto.replies)
  };
}
function callsOf({ dto, current, previous, points, tot }, sentiments) {
  return {
    points,
    total: tot.calls,
    minutes: Math.round(tot.callSeconds / 60),
    voicemail: dto.voicemail ?? 0,
    sentiments,
    max: Math.max(1, ...points.map((p) => p.calls)),
    prior: priorOf(current.length, previous, (d) => d.calls)
  };
}
function peopleOf({ current, previous, points, tot, prev }) {
  const peopleBefore = priorOf(current.length, previous, (d) => d.new_contacts);
  const peopleRun = runningTotal(points.map((p) => p.newPeople));
  return {
    points,
    total: tot.newPeople,
    max: Math.max(1, ...points.map((p) => p.newPeople)),
    prior: peopleBefore,
    cumulative: {
      points: points.map((p, i) => ({ ...p, total: peopleRun[i] })),
      prior: prev.newPeople > 0 ? runningTotal(peopleBefore) : null
    }
  };
}
function replyLine({ sortedReply, p90, hold }) {
  if (hold) return holdLine(hold);
  if (sortedReply.length >= 10) return `Nine in ten within ${fmtSeconds(p90)}.`;
  return sortedReply.length ? `The slowest took ${fmtSeconds(sortedReply[sortedReply.length - 1])}.` : null;
}
function linesOf(f, week) {
  const { points, tot, prev, rangeLabel, answeredTotal, prevAnsweredTotal } = f;
  const busiestDay = tot.in ? points.reduce((b, p) => p.in > b.in ? p : b) : null;
  return {
    hero: answeredTotal ? `${tot.ai} of ${answeredTotal} customer messages, without you.${heroSpeed(f.sortedReply.length, fmtSeconds(f.median), f.hold)}` : "No customer wrote in this period.",
    heroBefore: prevAnsweredTotal ? `${pct(prev.ai, prevAnsweredTotal)}% ${beforeWords(rangeLabel)}` : null,
    receptionist: answeredTotal ? `${tot.ai} of ${answeredTotal} messages answered without you${receptionistSpeed(f.hold)}.` : null,
    answered: busiestDay ? `Most messages on ${busiestDay.label}: ${busiestDay.in}.` : null,
    reply: replyLine(f),
    calls: tot.calls ? `About ${fmtSeconds(tot.callSeconds / tot.calls)} a call.` : null,
    people: newPeopleLine(tot.newPeople, prev.newPeople, rangeLabel, f.priorHadAny),
    rhythm: rhythmLine(week)
  };
}
export function headlineOf(dto, period, booking) {
  const f = periodFactsOf(dto);
  return {
    period,
    days: f.days,
    empty: f.empty,
    messages_in: f.tot.in,
    // Nothing to compare with where the period before had no customer message and no call at all (compareWords).
    messages_before: f.priorHadAny ? f.prev.in : null,
    answered_ai: f.tot.ai,
    answered_you: f.tot.you,
    unanswered: f.tot.none,
    answered_share: answeredOf(f).share,
    calls: f.tot.calls,
    booking
  };
}
export function toReportVM(dto, opts) {
  const f = periodFactsOf(dto);
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
    today: dto.today,
    end: dto.end ?? dto.today,
    live: f.until === null,
    empty: f.empty,
    tiles,
    answered: answeredOf(f),
    reasons,
    reasonsShown: reasonsShownOf(reasons),
    replyTime: replyTimeOf(f),
    calls: callsOf(f, sentiments),
    people: peopleOf(f),
    speed: dto.replies ? speedOf(
      dto.replies,
      f.current.map((d) => d.day)
    ) : null,
    week,
    hours: hoursOf(dto.hours, closedOf(dto.arrivals, opts?.profile)),
    hoursUnset: hoursUnsetOf(dto.arrivals, opts?.profile),
    channels,
    period: periodWords(f.days, f.until),
    lines: linesOf(f, week),
    table: {
      columns: [
        "Day",
        "Customer messages",
        "Answered by receptionist",
        "Answered by you",
        "Unanswered",
        "Calls",
        "Needed you",
        "New people"
      ],
      rows: f.points.map((p) => [p.label, p.in, p.ai, p.you, p.none, p.calls, p.escalations, p.newPeople])
    }
  };
}
