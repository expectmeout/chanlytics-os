/**
 * Reports › Receptionist — the words of the lens's own parts: the labels of what became of a held reply, of a topic, a
 * language, an ending and a refusal, and the sentence under each part, said once. Pure; receptionist-report.ts puts them in
 * the view model, and only Reports' page reads them (PAGE_ONLY in tooling/scripts/gen/contracts-browser-entry.mjs).
 */
import { HELD_REASONS } from "../../broadcasts/run-words";
import { INTENT_LABELS } from "../../config/intent-labels";
import { DISCONNECTION_LABELS } from "../../conversations/call-dto";
import { NEEDS_YOU_WORD } from "../../conversations/standing";
import { BOOKED_NEEDS_A_LINK } from "../../setup/calendar-source";
import { durationWords } from "../../shared/clock";
import { capitalize, plural } from "../../shared/words";
import { BOOKED_NEEDS_TODAY } from "../booking-report";
import { ownWord, rankedEntries, type MixEntry } from "../report-mix";
import { MISSED_CALL_TOUCH_WORDS, type ReceptionistDto, type ReceptionistSeriesDto } from "./receptionist-record";

type Counts = Readonly<Record<string, number>>;
type HoldNow = ReceptionistSeriesDto["hold"]["now"];
type MissedNow = ReceptionistSeriesDto["missed"]["now"];
type LinksCalendar = NonNullable<ReceptionistDto["series"]>["links"]["calendar"];

/* ------------------------------------------------------------------ the hold */

/** What became of a held reply, in the order the lens draws it. */
const HOLD_OUTCOMES = [
  ["sent", "Went out as the hold ended"],
  ["canceled", "You cancelled"],
  ["steered", "You changed"],
  ["overtaken", "A newer message came first"],
  ["person_first", "A person answered first"],
  ["waiting", "Still waiting"],
  ["other", "Did not go out"],
] as const;

export const HOLD_EMPTY = "No reply waited in a hold in this period.";

/** The outcomes that happened, in the order the lens draws them: an outcome of none has no row. */
export const holdEntries = (now: HoldNow): MixEntry[] =>
  HOLD_OUTCOMES.map(([key, label]): MixEntry => [key, label, now[key]]).filter(([, , n]) => n > 0);

/** How many went out as the hold ended, and, where some were held for the owner's look, how many. */
export function holdLine(now: HoldNow): string {
  const out = `${now.sent} of ${now.total} went out as the hold ended.`;
  const n = now.low_confidence;
  return n > 0 ? `${out} ${n} ${n === 1 ? "was" : "were"} held back as not sure enough to send alone.` : out;
}

/* ------------------------------------------------------- topics and languages */

/** Why there is no topic to draw: no text or WhatsApp message came, or none was stamped; null where there is one to draw. */
export function topicsEmpty(of: number, stamped: number): string | null {
  if (of === 0) return "Topics are read from texts and WhatsApp messages. None came in this period.";
  if (stamped === 0) return `No topic is recorded for the ${plural(of, "message")} that came by text or WhatsApp.`;
  return null;
}

export const topicEntries = (byIntent: Counts): MixEntry[] =>
  rankedEntries(byIntent, (key) => ownWord(INTENT_LABELS, key) ?? key);

export const topicsLine = (stamped: number, of: number): string =>
  `${stamped} of ${of} text and WhatsApp messages had a topic.`;

const LANGUAGE_LABELS: Readonly<Record<string, string>> = { en: "English", es: "Spanish", other: "Another language" };

export const languageEntries = (byLanguage: Counts): MixEntry[] =>
  rankedEntries(byLanguage, (key) => ownWord(LANGUAGE_LABELS, key) ?? key);

export const languagesLine = (stamped: number, of: number): string =>
  `${stamped} of ${of} replies say the language they were written in.`;

/* -------------------------------------------------------------- how calls ended */

export const CALLS_EMPTY = "Nobody phoned in this period.";
/** No call connected, but someone rang and found nobody: "nobody phoned" would be untrue beside the missed-calls figure. */
export const CALLS_NONE_CONNECTED = "No call connected in this period.";

/** An ending in the owner's words; none recorded is `unknown`, and an ending the words do not know is its own word, spaced. */
const callEndingWords = (key: string): string =>
  key === "unknown" ? "Not recorded" : (ownWord(DISCONNECTION_LABELS, key) ?? key.replace(/_/g, " "));

export const callEndingEntries = (byReason: Counts): MixEntry[] => rankedEntries(byReason, callEndingWords);

export const callEndingsLine = (total: number): string => `${plural(total, "call")} that connected.`;

/* ---------------------------------------------------------------- the booking link */

/** Why there is no count of who booked: the calendar's own reason; nothing to add where it could say. */
function bookedReason(calendar: LinksCalendar): string | null {
  if (calendar === "ended") return BOOKED_NEEDS_TODAY;
  if (calendar === "none") return BOOKED_NEEDS_A_LINK;
  if (calendar === "unavailable") return "Your calendar could not be read.";
  return null;
}

/** Who was sent the booking link, and what came of it where the calendar could say. */
export function linkLine(sent: number, booked: number | null, calendar: LinksCalendar): string {
  if (sent === 0) return "Nobody was sent the booking link in this period.";
  const was = `${sent} ${sent === 1 ? "person was" : "people were"} sent the booking link`;
  if (booked !== null) return `${was}; ${booked} ${booked === 1 ? "has" : "have"} booked since.`;
  const reason = bookedReason(calendar);
  return reason === null ? `${was}.` : `${was}. ${reason}`;
}

/* ------------------------------------------------------------------ a handover */

const HANDOVER_NONE = "nothing was handed over in this period";

/** Under the first-reply figure: of the handovers that wanted a message (not an opt-out or a call-back), how many had one from a person. */
export const handoverReplyMeta = (replied: number, n: number): string =>
  n === 0 ? HANDOVER_NONE : `${replied} of ${plural(n, "handover")} that wanted a message had a reply from you`;

/** Under the time-to-settle figure: of the handovers, how many were settled. */
export const handoverSettledMeta = (settled: number, n: number): string =>
  n === 0 ? HANDOVER_NONE : `${settled} of ${n} settled`;

/* ------------------------------------------------------------- the calls nobody took */

export const MISSED_LABEL = `Missed calls answered within ${MISSED_CALL_TOUCH_WORDS}`;

/**
 * Under the figure: the people left out of it, said. A person whose call is under the hour old is not counted yet,
 * whether or not they were already answered (the rate is over people whose hour has passed); a call with no caller on record
 * has no person to count.
 */
export function missedMeta(m: MissedNow): string {
  const left = [
    m.pending > 0 ? `${m.pending} under ${MISSED_CALL_TOUCH_WORDS} old, not counted yet` : null,
    m.unknown > 0 ? `${m.unknown} with no caller on record not counted` : null,
  ].filter((part): part is string => part !== null);
  if (left.length > 0) return left.join(" · ");
  return m.n === 0
    ? "no call went unanswered at the phone"
    : `${plural(m.n, "person", "people")} rang and found nobody`;
}

/* ----------------------------------------------------------- while you were closed */

export const CLOSED_UNSET = "set your opening hours to see this";
/** Only messages are counted while closed, never calls, so "nothing came" would say more than the figure counts. */
export const CLOSED_NONE = "no message came while you were closed";

export const closedMeta = (came: number, answered: number): string =>
  `${plural(came, "message")} came while you were closed; the receptionist answered ${answered}.`;

/* ------------------------------------------------------------------------ stuck */

/** How long the longest-waiting one has waited, in an owner's words; null where it cannot be said. */
function waitedWords(oldestAt: string | null, nowMs: number): string | null {
  const seconds = oldestAt === null ? NaN : (nowMs - Date.parse(oldestAt)) / 1000;
  return Number.isFinite(seconds) ? durationWords(seconds) : null;
}

export function waitingMeta(waiting: number, oldestAt: string | null, nowMs: number): string {
  if (waiting === 0) return "nobody is waiting for you";
  const waited = waitedWords(oldestAt, nowMs);
  return waited === null ? "waiting for you now" : `the oldest has waited ${waited}`;
}

export const callbacksMeta = (callbacks: number): string =>
  callbacks === 0 ? "no call-back is waiting" : `people to ring, counted in ${NEEDS_YOU_WORD}`;

/** A refusal at the send door in the words a run's held people are given (HELD_REASONS), lower case as they stand. */
const refusalWords = (key: string): string => ownWord(HELD_REASONS, key) ?? key.replace(/_/g, " ");

/** Under the held-back figure: the two most common reasons and their counts. */
export function heldBackMeta(byReason: Counts): string {
  const top = rankedEntries(byReason, refusalWords).slice(0, 2);
  return top.length > 0
    ? top.map(([, words, n]) => `${words} ${n}`).join(" · ")
    : "none were held at the door in this period";
}

/** The reasons, most first, each as a sentence starts. */
export const heldBackEntries = (byReason: Counts): MixEntry[] =>
  rankedEntries(byReason, (key) => capitalize(refusalWords(key)));
