/** Reports: reports. */

import { shiftKey } from "../shared/zone/day-keys";
import { reasonShort } from "../conversations/escalations";
import {
  absoluteBuckets,
  heroSpeed,
  holdBuckets,
  speedHoldLine,
  holdOf,
  receptionistSpeed,
  replyDotsOf,
} from "./speed";
import { closedOf, hoursUnsetOf, type ReportProfile } from "./closed";
import { REPORT_TILES, beforeWords, fmtSeconds, newPeopleLine } from "./tiles";
import type { ReportHeadlineDto } from "./headline";
import type { ReportPeriodId } from "./periods";
import type { BookingReportDto } from "./booking-report";
import { pct, sumOf } from "../shared/numbers";
import { capitalize, plural } from "../shared/words";
import {
  REPORT_RANGES,
  REPORT_WEEK_LONG,
  REPORT_WEEK_SHORT,
  bars,
  channelsOf,
  dayDate,
  dayPointOf,
  daysWords,
  endedOn,
  fmtDay,
  hoursOf,
  onlyIndex,
  priorOf,
  quantile,
  type ReportBarVM,
  type ReportDto,
  type ReportLinesVM,
  type ReportPointVM,
  type ReportSpeedPointVM,
  type ReportVM,
  type ReportWeekVM,
  weekOf,
} from "./dtos";

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
    const items = chunk.flatMap((d) => byDay.get(d) ?? []).sort((a, b) => a - b);
    const first = chunk[0];
    const p50 = quantile(items, 0.5);
    const p90 = quantile(items, 0.9);
    return {
      day: first,
      label: fmtDay(first),
      short: chunk.length > 1 ? fmtDay(first) : String(dayDate(first).getDate()),
      p50,
      p90,
      p50Label: fmtSeconds(p50),
      p90Label: fmtSeconds(p90),
      count: items.length,
    };
  };
  if (days.length <= 14) return { unit: "day", points: days.map((d) => point([d])) };
  const weeks: string[][] = [];
  for (let end = days.length; end > 0; end -= 7) weeks.unshift(days.slice(Math.max(0, end - 7), end));
  if (weeks.length > 1 && weeks[0].length < 4) weeks.splice(0, 2, [...weeks[0], ...weeks[1]]);
  return { unit: "week", points: weeks.map(point) };
}

/** A caller's mood as the voice provider reads it ("Positive", "Neutral", "Negative", "Unknown") is a scale, so it reads in its own order (good, then neither, then bad), never by count. */
const moodRank = (s: string): number => (s === "Positive" ? 0 : s === "Negative" ? 2 : 1);

/** "Monday", "Monday or Tuesday", "Monday, Tuesday or Sunday". */
const listWords = (names: readonly string[], last: "or" | "and"): string =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} ${last} ${names[names.length - 1]}`;

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
 * The period in words, as a sentence takes it: the table's label for 7, 30 and 90 days, else the count ("5 days", Month on
 * the 5th). The report's and the headline's, so the two never spell a range two ways.
 */
export const rangeLabelOf = (days: number): string =>
  REPORT_RANGES.find((r) => r.days === days)?.label ?? plural(days, "day");

/**
 * The two periods by name, said the same way wherever they are said: "Last 30 days", "The 30 days before", and where a
 * sentence says when something happened, "in the last 30 days". `until` is the day the period ended where that was
 * before today (endedOn), and each caller says it: days a member picked are named by their dates, "Sep 1 – Sep 20",
 * and happened "in the 20 days to Sep 20" (the Reviews lens's words for a count that stopped short of today), since
 * "the last 20 days" would claim days the report did not read. The days before are "the 20 days before" either way.
 */
export const periodWords = (days: number, until: string | null): { now: string; before: string; within: string } => {
  const rangeLabel = rangeLabelOf(days);
  const before = capitalize(beforeWords(rangeLabel));
  if (until === null) return { now: `Last ${rangeLabel}`, before, within: `in the last ${rangeLabel}` };
  return {
    now: daysWords(shiftKey(until, -(days - 1)), until),
    before,
    within: days === 1 ? `on ${fmtDay(until)}` : `in the ${rangeLabel} to ${fmtDay(until)}`,
  };
};

/**
 * Where a sentence says when: "in the last 30 days", "today" where the period is the one day that is today (Month on
 * the 1st), and for a period that ended before today (`until`), "in the 20 days to Sep 20" or the one day's "on Sep 20".
 */
export const withinWords = (days: number, until: string | null): string =>
  days === 1 && until === null ? "today" : periodWords(days, until).within;

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
  const points: ReportPointVM[] = current.map((item) => ({
    ...dayPointOf(item.day),
    in: item.messages_in,
    ai: item.answered_ai,
    you: item.answered_you,
    none: item.unanswered,
    calls: item.calls,
    callSeconds: item.call_seconds,
    escalations: item.escalations,
    newPeople: item.new_contacts,
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
  const noun = plural(days, "day");
  const until = endedOn(dto);
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
    hold: holdOf(dto.replies),
  };
}

/** The facts every part of the report is built from (periodFactsOf). */
export type PeriodFacts = ReturnType<typeof periodFactsOf>;

/** Why the receptionist handed over, the most frequent first, in the owner's words. */
const reasonBarsOf = (reasons: ReportDto["reasons"]): ReportBarVM[] => {
  // One bar a reason as the owner reads it: two reasons said in the same words (a booking asked for, and the same booking
  // once you could not do its time) are one bar of both, never two bars of one name (Ruben's screenshot, 18 Oct 2026). The
  // bar keeps the id of its most frequent reason.
  const byLabel = new Map<string, [string, string, number]>();
  for (const [r, n] of Object.entries(reasons ?? {}).sort((a, b) => b[1] - a[1])) {
    const label = capitalize(reasonShort(r)) || r;
    const had = byLabel.get(label);
    byLabel.set(label, had ? [had[0], label, had[2] + n] : [r, label, n]);
  }
  return bars([...byLabel.values()].sort((a, b) => b[2] - a[2]));
};

/** How many reasons Why it stopped draws before it says the rest are in its table: beside a chart, a column of twenty bars of one stood a card's height of nothing next to it (18 Oct 2026). */
const REPORT_REASONS_SHOWN = 7;

/** The reasons the card draws, and its line when some are left to the table. One more than the cap is drawn whole: a line in place of one bar saves nothing. */
const reasonsShownOf = (reasons: ReportBarVM[]): ReportVM["reasonsShown"] => {
  if (reasons.length <= REPORT_REASONS_SHOWN + 1) return { bars: reasons, line: null };
  const top = reasons.slice(0, REPORT_REASONS_SHOWN);
  return {
    bars: bars(top.map((r) => [r.id, r.label, r.value])),
    line: `The ${REPORT_REASONS_SHOWN} most frequent of ${reasons.length} reasons. The table lists them all.`,
  };
};

/** The callers' moods in their own order (good, then neither, then bad). A mood is an order, not a verdict: no status colour. */
const moodBarsOf = (sentiments: ReportDto["sentiments"]): ReportBarVM[] =>
  bars(
    Object.entries(sentiments ?? {})
      .sort((a, b) => moodRank(a[0]) - moodRank(b[0]) || b[1] - a[1])
      .map(([s, n]): [string, string, number] => [s, s, n]),
  );

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
function answeredOf(periodFacts: PeriodFacts): ReportVM["answered"] {
  const { current, previous, points, tot, prev, answeredTotal, prevAnsweredTotal } = periodFacts;
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
    dots: replyDotsOf(dto.replies),
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
  if (hold) return speedHoldLine(hold);
  // Nine in ten is a claim about a tenth: under ten replies it would be a guess, so the slowest one is said instead.
  if (sortedReply.length >= 10) return `Nine in ten within ${fmtSeconds(p90)}.`;
  return sortedReply.length ? `The slowest took ${fmtSeconds(sortedReply[sortedReply.length - 1])}.` : null;
}

/** The one sentence under each chart, each adding the next thing (ReportLinesVM). */
function linesOf(periodFacts: PeriodFacts, week: ReportWeekVM): ReportLinesVM {
  const { points, tot, prev, rangeLabel, answeredTotal, prevAnsweredTotal } = periodFacts;
  // The busiest date (the first of a tie): Worth knowing names the busiest weekday, this the one day.
  const busiestDay = tot.in ? points.reduce((b, p) => (p.in > b.in ? p : b)) : null;
  return {
    hero: answeredTotal
      ? `${tot.ai} of ${answeredTotal} customer messages, without you.${heroSpeed(periodFacts.sortedReply.length, fmtSeconds(periodFacts.median), periodFacts.hold)}`
      : "No customer wrote in this period.",
    heroBefore: prevAnsweredTotal ? `${pct(prev.ai, prevAnsweredTotal)}% ${beforeWords(rangeLabel)}` : null,
    receptionist: answeredTotal
      ? `${tot.ai} of ${answeredTotal} messages answered without you${receptionistSpeed(periodFacts.hold)}.`
      : null,
    answered: busiestDay ? `Most messages on ${busiestDay.label}: ${busiestDay.in}.` : null,
    reply: replyLine(periodFacts),
    calls: tot.calls ? `About ${fmtSeconds(tot.callSeconds / tot.calls)} a call.` : null,
    people: newPeopleLine(tot.newPeople, prev.newPeople, rangeLabel, periodFacts.priorHadAny),
    rhythm: rhythmLine(week),
  };
}

/**
 * What Today reads of a period, summed where the series is: the same facts the report is built from (`periodFactsOf`,
 * `answeredOf`), so a count is counted once and the number Today says is the number Reports prints, and none of the series'
 * days goes over the wire. `booking` is the calendar's line over the same days, counted beside it (the server's `bookingOf`).
 */
export function headlineOf(
  dto: ReportDto,
  period: ReportPeriodId,
  booking: BookingReportDto | null,
): ReportHeadlineDto {
  const periodFacts = periodFactsOf(dto);
  return {
    period,
    days: periodFacts.days,
    empty: periodFacts.empty,
    messages_in: periodFacts.tot.in,
    // Nothing to compare with where the period before had no customer message and no call at all (compareWords).
    messages_before: periodFacts.priorHadAny ? periodFacts.prev.in : null,
    answered_ai: periodFacts.tot.ai,
    answered_you: periodFacts.tot.you,
    unanswered: periodFacts.tot.none,
    answered_share: answeredOf(periodFacts).share,
    calls: periodFacts.tot.calls,
    booking,
  };
}

/** The Reports page's view model: a builder per part, over the facts counted once. `profile` is the workspace's hours
 *  and closures, null where they could not be read; required, so each caller says (the node tests may leave it off). */
export function toReportVM(dto: ReportDto, opts: { profile: ReportProfile | null }): ReportVM {
  const periodFacts = periodFactsOf(dto);
  // Built first, in the order the DTO has always been read: the calls take the moods, the lines the week and channels.
  const tiles = REPORT_TILES.map((tile) => tile(periodFacts));
  const reasons = reasonBarsOf(dto.reasons);
  const sentiments = moodBarsOf(dto.sentiments);
  const week = weekShapeOf(periodFacts);
  const channels = channelsOf(dto.channels);
  const first = periodFacts.current[0]?.day;
  const last = periodFacts.current[periodFacts.current.length - 1]?.day;
  return {
    days: periodFacts.days,
    rangeLabel: periodFacts.rangeLabel,
    since: first ? fmtDay(first) : "",
    until: last ? fmtDay(last) : "",
    timezone: dto.timezone,
    today: dto.today,
    end: dto.end ?? dto.today,
    live: periodFacts.until === null,
    empty: periodFacts.empty,
    tiles,
    answered: answeredOf(periodFacts),
    reasons,
    reasonsShown: reasonsShownOf(reasons),
    replyTime: replyTimeOf(periodFacts),
    calls: callsOf(periodFacts, sentiments),
    people: peopleOf(periodFacts),
    speed: dto.replies
      ? speedOf(
          dto.replies,
          periodFacts.current.map((d) => d.day),
        )
      : null,
    week,
    hours: hoursOf(dto.hours, closedOf(dto.arrivals, opts?.profile)),
    hoursUnset: hoursUnsetOf(dto.arrivals, opts?.profile),
    channels,
    period: periodWords(periodFacts.days, periodFacts.until),
    lines: linesOf(periodFacts, week),
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
      rows: periodFacts.points.map((p) => [p.label, p.in, p.ai, p.you, p.none, p.calls, p.escalations, p.newPeople]),
    },
  };
}
