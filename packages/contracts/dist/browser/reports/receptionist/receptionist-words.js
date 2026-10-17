import { HELD_REASONS } from "../../broadcasts/run-words.js";
import { INTENT_LABELS } from "../../config/intent-labels.js";
import { DISCONNECTION_LABELS } from "../../conversations/call-dto.js";
import { NEEDS_YOU_WORD } from "../../conversations/standing.js";
import { BOOKED_NEEDS_A_LINK } from "../../setup/calendar-source.js";
import { durationWords } from "../../shared/clock.js";
import { capitalize, plural } from "../../shared/words.js";
import { BOOKED_NEEDS_TODAY } from "../booking-report.js";
import { ownWord, rankedEntries } from "../report-mix.js";
import { MISSED_CALL_TOUCH_WORDS } from "./receptionist-record.js";
const HOLD_OUTCOMES = [
  ["sent", "Went out as the hold ended"],
  ["canceled", "You cancelled"],
  ["steered", "You changed"],
  ["overtaken", "A newer message came first"],
  ["person_first", "A person answered first"],
  ["waiting", "Still waiting"],
  ["other", "Did not go out"]
];
export const HOLD_EMPTY = "No reply waited in a hold in this period.";
export const holdEntries = (now) => HOLD_OUTCOMES.map(([key, label]) => [key, label, now[key]]).filter(([, , n]) => n > 0);
export function holdLine(now) {
  const out = `${now.sent} of ${now.total} went out as the hold ended.`;
  const n = now.low_confidence;
  return n > 0 ? `${out} ${n} ${n === 1 ? "was" : "were"} held back as not sure enough to send alone.` : out;
}
export function topicsEmpty(of, stamped) {
  if (of === 0) return "Topics are read from texts and WhatsApp messages. None came in this period.";
  if (stamped === 0) return `No topic is recorded for the ${plural(of, "message")} that came by text or WhatsApp.`;
  return null;
}
export const topicEntries = (byIntent) => rankedEntries(byIntent, (key) => ownWord(INTENT_LABELS, key) ?? key);
export const topicsLine = (stamped, of) => `${stamped} of ${of} text and WhatsApp messages had a topic.`;
const LANGUAGE_LABELS = { en: "English", es: "Spanish", other: "Another language" };
export const languageEntries = (byLanguage) => rankedEntries(byLanguage, (key) => ownWord(LANGUAGE_LABELS, key) ?? key);
export const languagesLine = (stamped, of) => `${stamped} of ${of} replies say the language they were written in.`;
export const CALLS_EMPTY = "Nobody phoned in this period.";
export const CALLS_NONE_CONNECTED = "No call connected in this period.";
const callEndingWords = (key) => key === "unknown" ? "Not recorded" : ownWord(DISCONNECTION_LABELS, key) ?? key.replace(/_/g, " ");
export const callEndingEntries = (byReason) => rankedEntries(byReason, callEndingWords);
export const callEndingsLine = (total) => `${plural(total, "call")} that connected.`;
function bookedReason(calendar) {
  if (calendar === "ended") return BOOKED_NEEDS_TODAY;
  if (calendar === "none") return BOOKED_NEEDS_A_LINK;
  if (calendar === "unavailable") return "Your calendar could not be read.";
  return null;
}
export function linkLine(sent, booked, calendar) {
  if (sent === 0) return "Nobody was sent the booking link in this period.";
  const was = `${sent} ${sent === 1 ? "person was" : "people were"} sent the booking link`;
  if (booked !== null) return `${was}; ${booked} ${booked === 1 ? "has" : "have"} booked since.`;
  const reason = bookedReason(calendar);
  return reason === null ? `${was}.` : `${was}. ${reason}`;
}
const HANDOVER_NONE = "nothing was handed over in this period";
export const handoverReplyMeta = (replied, n) => n === 0 ? HANDOVER_NONE : `${replied} of ${plural(n, "handover")} that wanted a message had a reply from you`;
export const handoverSettledMeta = (settled, n) => n === 0 ? HANDOVER_NONE : `${settled} of ${n} settled`;
export const MISSED_LABEL = `Missed calls answered within ${MISSED_CALL_TOUCH_WORDS}`;
export function missedMeta(m) {
  const left = [
    m.pending > 0 ? `${m.pending} under ${MISSED_CALL_TOUCH_WORDS} old, not counted yet` : null,
    m.unknown > 0 ? `${m.unknown} with no caller on record not counted` : null
  ].filter((part) => part !== null);
  if (left.length > 0) return left.join(" \xB7 ");
  return m.n === 0 ? "no call went unanswered at the phone" : `${plural(m.n, "person", "people")} rang and found nobody`;
}
export const CLOSED_UNSET = "set your opening hours to see this";
export const CLOSED_NONE = "no message came while you were closed";
export const closedMeta = (came, answered) => `${plural(came, "message")} came while you were closed; the receptionist answered ${answered}.`;
function waitedWords(oldestAt, nowMs) {
  const seconds = oldestAt === null ? NaN : (nowMs - Date.parse(oldestAt)) / 1e3;
  return Number.isFinite(seconds) ? durationWords(seconds) : null;
}
export function waitingMeta(waiting, oldestAt, nowMs) {
  if (waiting === 0) return "nobody is waiting for you";
  const waited = waitedWords(oldestAt, nowMs);
  return waited === null ? "waiting for you now" : `the oldest has waited ${waited}`;
}
export const callbacksMeta = (callbacks) => callbacks === 0 ? "no call-back is waiting" : `people to ring, counted in ${NEEDS_YOU_WORD}`;
const refusalWords = (key) => ownWord(HELD_REASONS, key) ?? key.replace(/_/g, " ");
export function heldBackMeta(byReason) {
  const top = rankedEntries(byReason, refusalWords).slice(0, 2);
  return top.length > 0 ? top.map(([, words, n]) => `${words} ${n}`).join(" \xB7 ") : "none were held at the door in this period";
}
export const heldBackEntries = (byReason) => rankedEntries(byReason, (key) => capitalize(refusalWords(key)));
