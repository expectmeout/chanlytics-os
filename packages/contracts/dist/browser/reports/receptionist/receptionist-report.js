import { NEEDS_YOU_WORD } from "../../conversations/standing.js";
import { rangeLabelOf } from "../reports.js";
import { closedOf, hoursUnsetOf } from "../report-closed.js";
import { barsOf, mixOf, noMix } from "../report-mix.js";
import { REPORT_MIN_N, beforeWords, fmtSeconds } from "../report-tiles.js";
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
  waitingMeta
} from "./receptionist-words.js";
function holdPart({ hold }) {
  return hold.now.total === 0 ? noMix(HOLD_EMPTY) : mixOf(holdEntries(hold.now), holdLine(hold.now));
}
function topicsPart({ topics }) {
  const empty = topicsEmpty(topics.of, topics.stamped);
  return empty === null ? mixOf(topicEntries(topics.by_intent), topicsLine(topics.stamped, topics.of)) : noMix(empty);
}
function languagesPart({ languages }) {
  const entries = languageEntries(languages.by_language);
  return entries.length < 2 ? null : mixOf(entries, languagesLine(languages.stamped, languages.of));
}
function callEndingsPart({ call_endings, missed }) {
  if (call_endings.total > 0)
    return mixOf(callEndingEntries(call_endings.by_reason), callEndingsLine(call_endings.total));
  const rang = missed.now.n + missed.now.pending + missed.now.unknown > 0;
  return noMix(rang ? CALLS_NONE_CONNECTED : CALLS_EMPTY);
}
function wasWords(now, before, days) {
  return now === null || before === null ? null : `was ${fmtSeconds(before)} ${beforeWords(rangeLabelOf(days))}`;
}
function handoverFigures({ handover }, days) {
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
      minN: REPORT_MIN_N
    },
    {
      id: "handover-settled",
      metric: "handover_settled",
      label: "Time to settle a handover",
      value: fmtSeconds(now.settled.median_s),
      meta: handoverSettledMeta(now.settled.n, now.n),
      compare: wasWords(now.settled.median_s, before.settled.median_s, days),
      n: now.settled.n,
      minN: REPORT_MIN_N
    }
  ];
}
function missedFigure({ missed }, days) {
  const { now, before } = missed;
  return {
    id: "missed-calls",
    metric: "missed_calls_answered",
    label: MISSED_LABEL,
    value: now.n === 0 ? "\u2014" : `${now.touched} of ${now.n}`,
    meta: missedMeta(now),
    // Set against the period before only beside a figure: nothing is set against a dash.
    compare: now.n > 0 && before.n > 0 ? `was ${before.touched} of ${before.n} ${beforeWords(rangeLabelOf(days))}` : null,
    n: now.n,
    minN: REPORT_MIN_N
  };
}
function closedFigure({ after_hours }, profile) {
  const tile = {
    id: "closed",
    metric: "answered_while_closed",
    label: "Answered while you were closed",
    compare: null
  };
  if (hoursUnsetOf(after_hours, profile)) {
    return { ...tile, value: "\u2014", meta: CLOSED_UNSET, door: "admin/hours", unset: true };
  }
  if (profile === null) return null;
  const came = closedOf(after_hours, profile) ?? 0;
  if (came === 0) return { ...tile, value: "0", meta: CLOSED_NONE, unset: false };
  const answered = closedOf(
    after_hours.map(({ d, q, a }) => ({ d, q, n: a })),
    profile
  ) ?? 0;
  return {
    ...tile,
    value: `${answered} of ${came}`,
    meta: closedMeta(came, answered),
    n: came,
    minN: REPORT_MIN_N,
    unset: false
  };
}
function stuckFigures({ stuck, blocked }, nowMs) {
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
      door: "inbox"
    },
    {
      id: "call-backs",
      metric: "call_backs",
      label: "Call-backs",
      value: String(stuck.callbacks),
      meta: callbacksMeta(stuck.callbacks),
      compare: null,
      door: "today"
    },
    {
      id: "held-back",
      metric: "replies_held_back",
      label: "Replies held back",
      value: String(blocked.total),
      meta: heldBackMeta(blocked.by_reason),
      compare: null,
      door: "inbox"
    }
  ];
}
function unavailableVM() {
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
      value: "\u2014",
      meta: "",
      compare: null
    },
    closed: null,
    stuck: [],
    heldBack: []
  };
}
export function toReceptionistReportVM(dto, opts) {
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
    heldBack: barsOf(heldBackEntries(series.blocked.by_reason))
  };
}
