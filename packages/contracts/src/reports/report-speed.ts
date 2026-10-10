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

/** The seconds a reply was held; none for a reply sent with no hold, a hold that is not a number or a negative one. The one reading of "has a hold". */
const heldSeconds = (r: HoldReply): number => (r.hold !== undefined && r.hold > 0 ? r.hold : 0);

/** The one rule for how far past its hold a reply went; the counts, the line and the bars all read this. */
function classOf(r: HoldReply): HoldClass {
  const hold = heldSeconds(r);
  if (!hold) return { kind: "unheld" };
  const past = r.s - hold;
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

/** The counts of a hold the sentences need: what the metrics carry to Today, and what `ReportHoldVM` has beside them. */
type HoldCounts = Pick<ReportHoldVM, "label" | "atEnd" | "later" | "unheld">;

/**
 * The summary the day's metrics carry (snake_case: it rides a route): the hold most replies waited, in words, and how many replies
 * went out as it ended, later than it, and with none. Constant in size, whatever the day held; made on the server by `holdOf` and
 * read by `replySpeedOf`, so the rule's slack is applied once.
 */
export interface ReplyHoldDto {
  label: string;
  at_end: number;
  later: number;
  unheld: number;
}

/** The hold's summary for the wire: null where no reply waited a hold. */
export const replyHoldDtoOf = (hold: ReportHoldVM | null): ReplyHoldDto | null =>
  hold ? { label: hold.label, at_end: hold.atEnd, later: hold.later, unheld: hold.unheld } : null;

/** The replies a hold was counted over: those that waited it (as it ended, or later) and those sent with none. */
const repliesSeen = (hold: HoldCounts): number => hold.unheld + hold.atEnd + hold.later;

/**
 * Whether most of the replies seen waited a hold (more than half): the one test for saying the speed against the hold,
 * which Reports' hero and Today's sentences both ask. A hold that few replies waited says nothing of the receptionist's speed.
 */
const waitedHold = (hold: HoldCounts): boolean => (hold.atEnd + hold.later) * 2 > repliesSeen(hold);

/** Whether the replies that waited a hold mostly went out as it ended, rather than later: the one tie-break both sentences read. */
const endedWithHold = (hold: HoldCounts): boolean => hold.atEnd >= hold.later;

/** How a sentence about speed ends against the hold, said once for Reports and Today: "as your 1-minute hold ended", or later. */
const againstHold = (hold: HoldCounts): string =>
  endedWithHold(hold) ? `as your ${hold.label} hold ended` : `later than your ${hold.label} hold`;

/** How many of the replies went out the way `againstHold` says: as the hold ended, or later than it. */
const heldCount = (hold: HoldCounts): number => (endedWithHold(hold) ? hold.atEnd : hold.later);

/**
 * How fast, beside the hero: against the hold where most replies waited one, since the setting is not the
 * receptionist's speed. Where most replies had no hold, the hold says nothing of them and the median does. The
 * count of replies is the hold's own, the replies it saw.
 */
export function heroSpeed(replies: number, medianLabel: string, hold: ReportHoldVM | null): string {
  if (!replies) return "";
  if (!hold || !waitedHold(hold)) return ` Half of its replies went out within ${medianLabel}.`;
  return ` ${heldCount(hold)} of ${repliesSeen(hold)} went out ${againstHold(hold)}.`;
}

/**
 * The tail of the Receptionist lens's head ("13 of 17 messages answered without you, 8 as your 1-minute hold ended."): how
 * many replies went out against the hold, by the hero's own test and tie-break. Nothing where there is no hold or most replies
 * had none, since the setting then says nothing of the receptionist's speed.
 */
export function receptionistSpeed(hold: ReportHoldVM | null): string {
  return hold && waitedHold(hold) ? `, ${heldCount(hold)} ${againstHold(hold)}` : "";
}

/** The most dots the reply plot is given: the latest replies, so a busy period's payload and its drawing stay small. */
const REPLY_DOTS_MOST = 500;

/**
 * One reply as the dot plot draws it: the day it was asked, and the seconds it went out past its own hold. `held` says it had a
 * hold: a reply sent with none is not past anything, its `past` is the whole time it took.
 */
export interface ReplyDotVM {
  day: string;
  past: number;
  held: boolean;
}

/**
 * Each reply's seconds past its own hold (a reply that went out before its hold ended is on the line, 0), in the order given
 * and in whole seconds, the last `most` of them. A reply with no hold counts from the question, and is not `held`. Empty for
 * a report from before the replies were listed.
 */
export function replyDotsOf(
  replies: readonly (HoldReply & { day: string })[] | undefined,
  most = REPLY_DOTS_MOST,
): ReplyDotVM[] {
  const dots = (replies ?? [])
    .filter((r) => Number.isFinite(r.s))
    .map((r) => ({
      day: r.day,
      past: Math.round(Math.max(0, r.s - heldSeconds(r))),
      held: heldSeconds(r) > 0,
    }));
  return dots.slice(Math.max(0, dots.length - most));
}

/** How fast the receptionist replied, as a sentence says it: the median, or the hold's words where most replies waited one. */
export type ReplySpeed = { held: false; seconds: number } | { held: true; words: string };

/**
 * The reply speed in the words Today's sentences take ("typically in 34s", "typically as your 1-minute hold ended"): the median,
 * or, where most replies waited the owner's hold, against it (spec D14), by the classes `holdOf` counts and the test the hero
 * asks. Null with no median to speak of.
 */
export function replySpeedOf(median: number | null, hold: ReplyHoldDto | null): ReplySpeed | null {
  if (median === null) return null;
  const counts: HoldCounts | null = hold && {
    label: hold.label,
    atEnd: hold.at_end,
    later: hold.later,
    unheld: hold.unheld,
  };
  if (!counts || !waitedHold(counts)) return { held: false, seconds: median };
  return {
    held: true,
    words: againstHold(counts),
  };
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
