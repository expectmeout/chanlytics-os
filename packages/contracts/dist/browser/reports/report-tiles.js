import { durationWords } from "../shared/clock.js";
import { pct } from "../shared/numbers.js";
import { plural } from "../shared/words.js";
import { holdNote } from "./report-speed.js";
export const REPORT_MIN_N = 5;
export const isThinShare = (n, minN) => n > 0 && n < minN;
export const shareSaid = (share, count, of) => share === null ? null : of >= REPORT_MIN_N ? `${share}%` : `${count} of ${of}`;
export function fmtSeconds(s) {
  if (s == null || !Number.isFinite(s)) return "\u2014";
  return durationWords(s);
}
export function deltaOf(current, previous, upIsGood, noun) {
  if (!previous) return null;
  const pct2 = Math.round((current - previous) / previous * 100);
  if (pct2 === 0) return { text: `same as the prior ${noun}`, tone: "" };
  const up = pct2 > 0;
  return { text: `${up ? "+" : ""}${pct2}% vs prior ${noun}`, tone: up === upIsGood ? "pos" : "neg" };
}
export function pointsDelta(current, previous, noun) {
  if (current === null || previous === null) return null;
  const pts = current - previous;
  if (pts === 0) return { text: `same share as the prior ${noun}`, tone: "" };
  return { text: `${pts > 0 ? "+" : ""}${pts} pts vs prior ${noun}`, tone: pts > 0 ? "pos" : "neg" };
}
export const beforeWords = (rangeLabel) => `the ${rangeLabel === plural(1, "day") ? "day" : rangeLabel} before`;
export function compareWords(current, previous, rangeLabel, priorHadAny) {
  if (!priorHadAny || current === 0 && previous === 0) return null;
  if (previous === 0) return `none ${beforeWords(rangeLabel)}`;
  if (current === previous) return `same as ${beforeWords(rangeLabel)}`;
  return `${current > previous ? "up" : "down"} from ${previous}`;
}
export function shareWasWords(nowOf, was, rangeLabel) {
  if (nowOf === 0) return null;
  const said = shareSaid(pct(was.part, was.of), was.part, was.of);
  return said === null ? null : `was ${said} ${beforeWords(rangeLabel)}`;
}
export const messagesAnsweredWords = (answered, of) => `${answered} of ${of} ${answered === 1 ? "was" : "were"} answered`;
export function newPeopleLine(newNow, newBefore, rangeLabel, priorHadAny) {
  if (newNow === 0) return "Nobody new reached you in this period.";
  const reached = `${plural(newNow, "new person", "new people")} reached you`;
  if (!priorHadAny) return `${reached}.`;
  return `${reached} (${newBefore === 0 ? "none" : newBefore} ${beforeWords(rangeLabel)}).`;
}
const messagesTile = ({ days, current, points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "messages",
  metric: "customer_messages",
  label: "Customer messages",
  value: String(tot.in),
  meta: tot.in ? `on ${current.filter((d) => d.messages_in > 0).length} of ${plural(days, "day")}` : "none in this period",
  delta: deltaOf(tot.in, prev.in, true, noun),
  spark: points.map((p) => p.in),
  compare: compareWords(tot.in, prev.in, rangeLabel, priorHadAny),
  door: "conversations"
});
const answeredTile = ({ points, tot, noun, answeredTotal, aiShare, prevShare }) => ({
  id: "answered",
  metric: "answered_share",
  label: "Receptionist answered",
  value: aiShare === null ? "\u2014" : `${aiShare}%`,
  meta: answeredTotal ? `${tot.ai} of ${answeredTotal} \xB7 ${tot.you} by you \xB7 ${tot.none} unanswered` : "nothing to answer",
  // A share compares in POINTS. Against counts, the share could fall from
  // 100% to 60% while the delta read +20% in green.
  delta: pointsDelta(aiShare, prevShare, noun),
  spark: points.map((p) => p.ai),
  compare: null,
  // A share of the messages that wanted an answer: of few, it says nothing (the page greys it).
  n: answeredTotal,
  minN: REPORT_MIN_N
});
const replyTile = ({ sortedReply, median, p90, hold }) => ({
  id: "reply",
  metric: "reply_median",
  label: "Median reply time",
  value: fmtSeconds(median),
  // The reply time includes the hold the owner set, and says so where replies waited one (spec D14).
  meta: sortedReply.length ? `slowest tenth ${fmtSeconds(p90)} \xB7 ${sortedReply.length} replies${holdNote(hold)}` : "no receptionist replies yet",
  delta: null,
  spark: [],
  compare: null,
  // A median of the replies counted: of few, it says nothing (the page greys it).
  n: sortedReply.length,
  minN: REPORT_MIN_N
});
const neededTile = ({ points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "needed",
  metric: "handovers",
  label: "Needed you",
  value: String(tot.escalations),
  meta: tot.escalations ? "times the receptionist stopped" : "the receptionist never stopped",
  delta: deltaOf(tot.escalations, prev.escalations, false, noun),
  spark: points.map((p) => p.escalations),
  compare: compareWords(tot.escalations, prev.escalations, rangeLabel, priorHadAny),
  door: "inbox"
});
const callsTile = ({ dto, points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "calls",
  metric: "calls",
  label: "Calls",
  value: String(tot.calls),
  meta: tot.calls ? `${Math.max(1, Math.round(tot.callSeconds / 60))} min on the phone \xB7 ${dto.voicemail ?? 0} to voicemail` : "no calls",
  delta: deltaOf(tot.calls, prev.calls, true, noun),
  spark: points.map((p) => p.calls),
  compare: compareWords(tot.calls, prev.calls, rangeLabel, priorHadAny)
});
const peopleTile = ({ points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "people",
  metric: "new_people",
  label: "New people",
  value: String(tot.newPeople),
  meta: tot.newPeople ? "first got in touch in this period" : "nobody new",
  delta: deltaOf(tot.newPeople, prev.newPeople, true, noun),
  spark: points.map((p) => p.newPeople),
  compare: compareWords(tot.newPeople, prev.newPeople, rangeLabel, priorHadAny)
});
export const REPORT_TILES = [
  messagesTile,
  answeredTile,
  replyTile,
  neededTile,
  callsTile,
  peopleTile
];
export const BOOKED_ENDED_META = "not counted for days that have ended: it follows people as they stand today";
export function bookedTileOf(booking) {
  const tile = { id: "booked", metric: "booked", label: "Booked", compare: null };
  if (booking?.calendar === "ended") return { ...tile, value: "\u2014", meta: BOOKED_ENDED_META };
  if (booking && booking.present)
    return {
      ...tile,
      value: String(booking.booked),
      meta: booking.asked ? `of ${booking.asked} who asked` : "nobody asked"
    };
  return {
    ...tile,
    value: "\u2014",
    meta: booking && booking.calendar === "unavailable" ? "the calendar could not be read" : "no calendar link"
  };
}
