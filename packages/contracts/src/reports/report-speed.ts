/**
 * Reply speed said against the hold the owner set (spec D14): the replies measured from the hold each waited, so a
 * receptionist that holds a minute is not reported as one that takes a minute.
 */
import { durationWords } from "../shared/clock";

/** Each bucket's last second, inclusive, on the same rounded seconds the words say: a reply of 60s is "within 1m". */
const REPLY_BUCKETS: { id: string; label: string; max: number }[] = [
  { id: "lt15", label: "under 15s", max: 14 },
  { id: "lt60", label: "15s – 1m", max: 60 },
  { id: "lt300", label: "1 – 5m", max: 300 },
  { id: "lt1800", label: "5 – 30m", max: 1800 },
  { id: "gte1800", label: "over 30m", max: Infinity },
];

/** The same edges for the replies that went out later than their hold, counted from the hold's end. */
const LATER_BUCKETS: { id: string; label: string; max: number }[] = [
  { id: "lt60", label: "up to 1m later", max: 60 },
  { id: "lt300", label: "1 – 5m later", max: 300 },
  { id: "gte300", label: "over 5m later", max: Infinity },
];

/** A reply that went out within this many seconds past its hold went out as the hold ended: the queue's own tick. */
const HOLD_SLACK_S = 10;

/** The replies measured against the hold each waited (spec D14). */
export interface ReportHoldVM {
  /** The hold most replies waited, in seconds, and in words ("1-minute"): the owner's own setting as each was queued. */
  seconds: number;
  label: string;
  /** As the hold ended; unheld (sent with no hold); later, with the most any took past its hold. */
  atEnd: number;
  unheld: number;
  later: number;
  laterMost: number | null;
}

/** "30-second", "1-minute", "1m 30s": a hold said as the setting is. */
const holdWords = (s: number): string =>
  s < 60 ? `${s}-second` : s % 60 === 0 && s < 3600 ? `${s / 60}-minute` : durationWords(s);

/** A reply as ReportDto carries it: the seconds it took, and the seconds it was held (0 or absent: no hold). */
interface HoldReply {
  s: number;
  hold?: number;
}

/** One reply against its own hold: sent with none, as it ended, or later, with how far past it went. */
type HoldClass = { kind: "unheld" } | { kind: "atEnd" } | { kind: "later"; past: number };

/** The one rule for how far past its hold a reply went; the counts, the line and the bars all read this. */
function classOf(r: HoldReply): HoldClass {
  if (r.hold === undefined || !(r.hold > 0)) return { kind: "unheld" };
  const past = r.s - r.hold;
  return past > HOLD_SLACK_S ? { kind: "later", past } : { kind: "atEnd" };
}

/**
 * Every finite reply with its class and hold. Null where the payload carries no hold at all (a report from before
 * 00304) or no reply waited one: the sentences and the bars then say speed as they did.
 */
function classified(replies: readonly HoldReply[] | undefined): { hold: number; c: HoldClass }[] | null {
  const rs = (replies ?? []).filter((r) => Number.isFinite(r.s));
  if (!rs.some((r) => r.hold !== undefined)) return null;
  const all = rs.map((r) => ({ hold: r.hold ?? 0, c: classOf(r) }));
  return all.some((x) => x.c.kind !== "unheld") ? all : null;
}

const countOf = (all: readonly { c: HoldClass }[], kind: HoldClass["kind"]): number =>
  all.filter((x) => x.c.kind === kind).length;

/** How far past its hold each reply that went out later than it did. */
const pastOf = (all: readonly { c: HoldClass }[]): number[] =>
  all.flatMap((x) => (x.c.kind === "later" ? [x.c.past] : []));

/**
 * Each reply against its own hold. Null where the payload carries no hold at all or no reply waited one. The replies
 * are ReportDto's own (reports.ts).
 */
export function holdOf(replies: readonly HoldReply[] | undefined): ReportHoldVM | null {
  const all = classified(replies);
  if (!all) return null;
  const counts = new Map<number, number>();
  for (const x of all) if (x.c.kind !== "unheld") counts.set(x.hold, (counts.get(x.hold) ?? 0) + 1);
  // The hold most replies waited; a tie goes to the shorter.
  const [seconds] = [...counts].reduce((a, b) => (b[1] > a[1] || (b[1] === a[1] && b[0] < a[0]) ? b : a));
  const past = pastOf(all);
  return {
    seconds,
    label: holdWords(seconds),
    atEnd: countOf(all, "atEnd"),
    unheld: countOf(all, "unheld"),
    later: past.length,
    laterMost: past.length ? Math.max(...past) : null,
  };
}

/** How many of the seconds fall in each span, as the bars draw them: a span's last second inclusive, on rounded seconds. */
function spanCounts(spans: typeof REPLY_BUCKETS, seconds: readonly number[]): [string, string, number][] {
  const rounded = seconds.map(Math.round);
  const rows: [string, string, number][] = [];
  let lo = -Infinity;
  for (const { id, label, max } of spans) {
    rows.push([id, label, rounded.filter((s) => s > lo && s <= max).length]);
    lo = max;
  }
  return rows;
}

/**
 * The bars against the hold, from the class holdOf reads: no hold, as the hold ended, and the three spans of
 * later. The first two are holdOf's unheld and atEnd and the last three add up to its later, so the hero, the line
 * under the chart and the bars count one split. Null where holdOf is.
 */
export function holdBuckets(replies: readonly HoldReply[] | undefined): [string, string, number][] | null {
  const all = classified(replies);
  if (!all) return null;
  return [
    ["unheld", "with no hold", countOf(all, "unheld")],
    ["atEnd", "as the hold ended", countOf(all, "atEnd")],
    ...spanCounts(LATER_BUCKETS, pastOf(all)),
  ];
}

/** The bars on the seconds a reply took, for a report with no hold (from before 00304, or none waited one). */
export const absoluteBuckets = (sortedReply: readonly number[]): [string, string, number][] =>
  spanCounts(REPLY_BUCKETS, sortedReply);

/**
 * How fast, beside the hero: against the hold where most replies waited one, since the setting is not the
 * receptionist's speed. Where most replies had no hold, the hold says nothing of them and the median does. The
 * count of replies is the hold's own, the replies it saw.
 */
export function heroSpeed(replies: number, medianLabel: string, hold: ReportHoldVM | null): string {
  if (!replies) return "";
  const held = hold ? hold.atEnd + hold.later : 0;
  const seen = hold ? hold.unheld + held : 0;
  if (!hold || held * 2 <= seen) return ` Half of its replies went out within ${medianLabel}.`;
  if (hold.atEnd >= hold.later) return ` ${hold.atEnd} of ${seen} went out as your ${hold.label} hold ended.`;
  return ` ${hold.later} of ${seen} took longer than your ${hold.label} hold.`;
}

/** The line under the speed chart where replies waited a hold: what took longer than it, or that none did. */
export function holdLine(hold: ReportHoldVM): string {
  if (hold.laterMost !== null) {
    const more = durationWords(hold.laterMost);
    return `${hold.later} ${hold.later === 1 ? "reply" : "replies"} took longer than the hold, at most ${more} more.`;
  }
  return hold.unheld
    ? `None waited longer than your hold; ${hold.unheld} had no hold.`
    : "None waited longer than your hold.";
}

/** What the median tile adds where replies waited a hold: that its numbers include it. */
export const holdNote = (hold: ReportHoldVM | null): string => (hold ? ` · includes your ${hold.label} hold` : "");
