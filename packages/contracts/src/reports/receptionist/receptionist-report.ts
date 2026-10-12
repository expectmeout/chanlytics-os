/**
 * Reports › Receptionist — what the lens's own read says, counted once.
 *
 * The route answers the lens's parts in one DTO (receptionist-record.ts: receptionist_series, with the people sent the
 * booking link counted against the calendar and who waits on you counted by `standingOfThread`, and the workspace's hours
 * beside them). This puts them in words: the mixes (what became of the held replies, what customers asked about, the
 * language the receptionist wrote in, how calls ended), the booking link and what came of it, and the figures: your
 * first reply and the time to settle a handover, the calls nobody took and whether anyone answered within an hour, what
 * came while the business was closed, and what is stuck now. A page draws these and makes no sentence of its own; Ask says
 * what it says. A ratio carries the count it is of (REPORT_MIN_N greys it under five), and a number with no source is a
 * dash with words, never a zero. Pure: the page feeds it the DTO and the clock.
 *
 * The hold's `other` ("Did not go out") and the door's refusals (`heldBack`) overlap by design: a draft the door refused is
 * in both, so the two are never added together here or anywhere.
 */
import { NEEDS_YOU_WORD } from "../../conversations/standing";
import { rangeLabelOf, type ReportBarVM } from "../reports";
import { closedOf, hoursUnsetOf, type ReportProfile } from "../report-closed";
import { barsOf, mixOf, noMix, type MixPartVM } from "../report-mix";
import { REPORT_MIN_N, beforeWords, fmtSeconds, type ReportStripTile } from "../report-tiles";
import type { ReceptionistDto } from "./receptionist-record";
import {
  CALLS_EMPTY,
  CALLS_NONE_CONNECTED,
  CLOSED_NONE,
  CLOSED_UNSET,
  HOLD_EMPTY,
  MISSED_LABEL,
  callEndingEntries,
  callEndingsLine,
  callbacksMeta,
  closedMeta,
  handoverReplyMeta,
  handoverSettledMeta,
  heldBackEntries,
  heldBackMeta,
  holdEntries,
  holdLine,
  languageEntries,
  languagesLine,
  linkLine,
  missedMeta,
  topicEntries,
  topicsEmpty,
  topicsLine,
  waitingMeta,
} from "./receptionist-words";

/** A figure of the lens: the strip's tile, with the count a ratio is of (`n`) and the page a number opens (`door`) where it has them. */
export type ReceptionistFigureVM = ReportStripTile;

export interface ReceptionistReportVM {
  /** False: the database has no receptionist_series yet, and the lens draws nothing of the parts below. */
  available: boolean;
  hold: MixPartVM;
  topics: MixPartVM;
  /** Null unless the receptionist wrote in two or more languages: one is no mix. */
  languages: MixPartVM | null;
  callEndings: MixPartVM;
  /** The people sent the booking link, how many have booked since where the calendar could say, and the sentence. */
  link: { sent: number; booked: number | null; line: string };
  /** [your first reply after a handover, the time to settle one] */
  handover: ReceptionistFigureVM[];
  missed: ReceptionistFigureVM;
  /** Null where the workspace's hours could not be read; `unset` where they were and hold no open day. */
  closed: (ReceptionistFigureVM & { unset: boolean }) | null;
  /** [needs you, call-backs, replies held back] */
  stuck: ReceptionistFigureVM[];
  /** The reasons the door refused a reply, most first, for Ask and the figure's line. */
  heldBack: ReportBarVM[];
}

type Series = NonNullable<ReceptionistDto["series"]>;

function holdPart({ hold }: Series): MixPartVM {
  return hold.now.total === 0 ? noMix(HOLD_EMPTY) : mixOf(holdEntries(hold.now), holdLine(hold.now));
}

function topicsPart({ topics }: Series): MixPartVM {
  const empty = topicsEmpty(topics.of, topics.stamped);
  return empty === null ? mixOf(topicEntries(topics.by_intent), topicsLine(topics.stamped, topics.of)) : noMix(empty);
}

function languagesPart({ languages }: Series): MixPartVM | null {
  const entries = languageEntries(languages.by_language);
  return entries.length < 2 ? null : mixOf(entries, languagesLine(languages.stamped, languages.of));
}

function callEndingsPart({ call_endings, missed }: Series): MixPartVM {
  if (call_endings.total > 0)
    return mixOf(callEndingEntries(call_endings.by_reason), callEndingsLine(call_endings.total));
  // The endings are of calls that connected. A missed call, one under the hour old and one with no caller on record are
  // calls too: with any of them, "nobody phoned" is untrue beside the missed-calls figure.
  const rang = missed.now.n + missed.now.pending + missed.now.unknown > 0;
  return noMix(rang ? CALLS_NONE_CONNECTED : CALLS_EMPTY);
}

/** The period before's middle beside this one's, where both have one: a time is not set against a dash. */
function wasWords(now: number | null, before: number | null, days: number): string | null {
  return now === null || before === null ? null : `was ${fmtSeconds(before)} ${beforeWords(rangeLabelOf(days))}`;
}

function handoverFigures({ handover }: Series, days: number): ReceptionistFigureVM[] {
  const { now, before } = handover;
  return [
    {
      id: "handover-reply",
      metric: "handover_first_reply",
      label: "Your first reply after a handover",
      value: fmtSeconds(now.replied.median_s),
      meta: handoverReplyMeta(now.replied.n, now.n),
      compare: wasWords(now.replied.median_s, before.replied.median_s, days),
      n: now.replied.n,
      minN: REPORT_MIN_N,
    },
    {
      id: "handover-settled",
      metric: "handover_settled",
      label: "Time to settle a handover",
      value: fmtSeconds(now.settled.median_s),
      meta: handoverSettledMeta(now.settled.n, now.n),
      compare: wasWords(now.settled.median_s, before.settled.median_s, days),
      n: now.settled.n,
      minN: REPORT_MIN_N,
    },
  ];
}

function missedFigure({ missed }: Series, days: number): ReceptionistFigureVM {
  const { now, before } = missed;
  return {
    id: "missed-calls",
    metric: "missed_calls_answered",
    label: MISSED_LABEL,
    value: now.n === 0 ? "—" : `${now.touched} of ${now.n}`,
    meta: missedMeta(now),
    // Set against the period before only beside a figure: nothing is set against a dash.
    compare:
      now.n > 0 && before.n > 0 ? `was ${before.touched} of ${before.n} ${beforeWords(rangeLabelOf(days))}` : null,
    n: now.n,
    minN: REPORT_MIN_N,
  };
}

/**
 * What came while the business was closed, and how many of those the receptionist answered first: by the workspace's
 * own hours and closures, each quarter hour asked the one question (closedOf). Null where the hours could not be read.
 */
function closedFigure({ after_hours }: Series, profile: ReportProfile | null): ReceptionistReportVM["closed"] {
  const tile = {
    id: "closed",
    metric: "answered_while_closed",
    label: "Answered while you were closed",
    compare: null,
  } as const;
  if (hoursUnsetOf(after_hours, profile)) {
    return { ...tile, value: "—", meta: CLOSED_UNSET, door: "admin/workspace", unset: true };
  }
  if (profile === null) return null;
  const came = closedOf(after_hours, profile) ?? 0;
  if (came === 0) return { ...tile, value: "0", meta: CLOSED_NONE, unset: false };
  const answered =
    closedOf(
      after_hours.map(({ d, q, a }) => ({ d, q, n: a })),
      profile,
    ) ?? 0;
  return {
    ...tile,
    value: `${answered} of ${came}`,
    meta: closedMeta(came, answered),
    n: came,
    minN: REPORT_MIN_N,
    unset: false,
  };
}

function stuckFigures({ stuck, blocked }: Series, nowMs: number): ReceptionistFigureVM[] {
  return [
    {
      id: "waiting",
      metric: "waiting_on_you",
      // The Inbox's name for a thread flagged that nobody has taken, which is what this counts (standingOfThread): the tile
      // said "Waiting on you", which People used for a thread you have, so 3 here and 1 there were both right.
      label: NEEDS_YOU_WORD,
      // A list cut at the database's limit is a floor: the Inbox is where the rest is.
      value: stuck.capped ? `${stuck.waiting}+` : String(stuck.waiting),
      meta: waitingMeta(stuck.waiting, stuck.oldest_at, nowMs),
      compare: null,
      door: "inbox",
    },
    {
      id: "call-backs",
      metric: "call_backs",
      label: "Call-backs",
      value: String(stuck.callbacks),
      meta: callbacksMeta(stuck.callbacks),
      compare: null,
      door: "today",
    },
    {
      id: "held-back",
      metric: "replies_held_back",
      label: "Replies held back",
      value: String(blocked.total),
      meta: heldBackMeta(blocked.by_reason),
      compare: null,
      door: "inbox",
    },
  ];
}

/** What the lens draws of a database that has no receptionist_series: nothing of the new parts. */
function unavailableVM(): ReceptionistReportVM {
  return {
    available: false,
    hold: noMix(null),
    topics: noMix(null),
    languages: null,
    callEndings: noMix(null),
    link: { sent: 0, booked: null, line: "" },
    handover: [],
    missed: {
      id: "missed-calls",
      metric: "missed_calls_answered",
      label: MISSED_LABEL,
      value: "—",
      meta: "",
      compare: null,
    },
    closed: null,
    stuck: [],
    heldBack: [],
  };
}

/** The lens's own parts, in words, from the DTO the route answers. */
export function toReceptionistReportVM(dto: ReceptionistDto, opts: { nowMs: number }): ReceptionistReportVM {
  const { series } = dto;
  if (series === null) return unavailableVM();
  const { links } = series;
  return {
    available: true,
    hold: holdPart(series),
    topics: topicsPart(series),
    languages: languagesPart(series),
    callEndings: callEndingsPart(series),
    link: { sent: links.sent, booked: links.booked, line: linkLine(links.sent, links.booked, links.calendar) },
    handover: handoverFigures(series, dto.days),
    missed: missedFigure(series, dto.days),
    closed: closedFigure(series, dto.profile),
    stuck: stuckFigures(series, opts.nowMs),
    heldBack: barsOf(heldBackEntries(series.blocked.by_reason)),
  };
}
