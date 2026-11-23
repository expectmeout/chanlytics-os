/**
 * The moments an occasion starts (decision 0119). Something happened to one person (they booked, a visit of theirs was
 * marked missed, they were sent the booking link), and a sequence owes them its first step at a time of their own. The
 * occasion is kept once (storage `sequence_occasions`, one row per sequence, person and occasion), so a second word about
 * the same thing makes no second message, and its step runs for that one person through the run every moment uses.
 *
 * Here: what names an occasion, when its step is due, and whether it is still owed when its time comes (which moments
 * they are, and their words, are triggers/occasions.ts). Pure: the clock and what the record holds are handed in.
 */
import { wallClockAt } from "../../shared/clock";
import { DAY_MS, HOUR_MS, MIN_MS } from "../../shared/time";
import { recordOrEmpty } from "../../shared/unknown";
import { shiftKey } from "../../shared/zone/day-keys";
import { localDate, localHour } from "./schedule";
import { PLAYBOOK_HOURS, PLAYBOOK_VETO_DELAY_MS } from "./triggers/kinds";
import type { OccasionTrigger } from "./triggers/occasions";

/* ------------------------------ what names one ------------------------------ */

const VISIT = "visit";
const MISSED = "missed";
const ASK = "ask";
const WON = "won";

/** What every occasion of one appointment's reminders starts with: how a move or a cancellation finds them. */
export function visitOccasionsOf(appointmentId: string): string {
  return `${VISIT}:${appointmentId}:`;
}

/** A visit's occasion: the appointment on the record at one start. Moved, it is another occasion, and the old one leaves. */
export function visitOccasion(appointmentId: string, startsAtMs: number): string {
  return `${visitOccasionsOf(appointmentId)}${Math.round(startsAtMs / MIN_MS)}`;
}

/** A missed visit's occasion: the appointment, whatever its time was. */
export function missedOccasion(appointmentId: string): string {
  return `${MISSED}:${appointmentId}`;
}

/** An ask's occasion: the message that carried the booking link to them. */
export function askOccasion(messageId: string): string {
  return `${ASK}:${messageId}`;
}

/**
 * A deal won's occasion (22 Nov 2026): the deal alone, whatever day it was marked. So its thank-you goes once for a
 * deal, and a deal taken back and marked won again makes no second one.
 */
export function wonOccasion(dealId: string): string {
  return `${WON}:${dealId}`;
}

/** The appointment an occasion names on the record, or null for one that names none (an ask, a deal won). */
export function occasionAppointment(occasion: string): string | null {
  const [kind, id] = occasion.split(":");
  return (kind === VISIT || kind === MISSED) && id ? id : null;
}

/** The deal an occasion names on the record, or null for one that names none. */
export function occasionDeal(occasion: string): string | null {
  const [kind, id] = occasion.split(":");
  return kind === WON && id ? id : null;
}

/* ------------------------------ what one comes of ------------------------------ */

/**
 * What happened that an occasion may come of, as its event says it: an appointment's change, the booking link sent, or a
 * deal marked won.
 */
export type OccasionEvent =
  | { about: "appointment"; appointmentId: string; change: string }
  | { about: "ask"; messageId: string }
  | { about: "deal"; dealId: string };

/**
 * The thing an event says happened, where an occasion may come of it; null for every other event. An appointment's
 * change (`appointment.changed`, whichever door wrote it), a message that left carrying the booking link
 * (`booking_link.sent`, 00313), or a deal marked won (`deal.won`, written with the fact by deal_record). A deal's other
 * moves enrol nobody: one taken back is found no longer won when its time comes (occasionGone).
 */
export function occasionEventOf(event: {
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
  data: unknown;
}): OccasionEvent | null {
  if (!event.subject_id) return null;
  if (event.kind === "appointment.changed" && event.subject_type === "appointment") {
    const change = recordOrEmpty(event.data).change;
    return typeof change === "string" ? { about: "appointment", appointmentId: event.subject_id, change } : null;
  }
  if (event.kind === "booking_link.sent" && event.subject_type === "message")
    return { about: "ask", messageId: event.subject_id };
  if (event.kind === "deal.won" && event.subject_type === "deal") return { about: "deal", dealId: event.subject_id };
  return null;
}

/**
 * What an event's enrolment came to, for its one log line: how many sequences took the person in, how many waiting
 * occasions left (a visit cancelled or moved, a Missed taken back), and where nothing was enrolled, why.
 */
export interface OccasionEnrolment {
  enrolled: number;
  left: number;
  why?: "no_step" | "gone" | "nobody" | "not_owed" | "already";
}

/* ------------------------------ when its step is due ------------------------------ */

/** How long before a visit its second reminder goes. */
const VISIT_SOON_BEFORE_MS = 2 * HOUR_MS;

/**
 * When the two-hour reminder of a visit goes, or null where none is owed. Two hours before its start, where that is
 * inside the sending hours and still ahead. A visit too early or too late in the day for that (one before eleven in the
 * morning, or after eleven at night) is reminded at 8:00 PM the evening before instead, but only where no day-before
 * reminder runs here (`dayBeforeRuns`): that one already reaches them the day or the evening before (decision 0118), and
 * two reminders a few hours apart are one too many. Booked inside the two hours, they booked a moment ago: nothing.
 */
export function visitSoonAt(visit: {
  startsAt: number;
  tz: string;
  nowMs: number;
  dayBeforeRuns: boolean;
}): number | null {
  if (visit.startsAt <= visit.nowMs) return null;
  const at = visit.startsAt - VISIT_SOON_BEFORE_MS;
  const hour = localHour(visit.tz, new Date(at));
  if (hour >= PLAYBOOK_HOURS.min && hour <= PLAYBOOK_HOURS.max) return at > visit.nowMs ? at : null;
  if (visit.dayBeforeRuns) return null;
  // The last sending hour before it: that evening for a visit late at night, the evening before for an early one.
  const day = localDate(visit.tz, new Date(at));
  const evening = wallClockAt(visit.tz, hour > PLAYBOOK_HOURS.max ? day : shiftKey(day, -1), PLAYBOOK_HOURS.max, 0);
  return evening > visit.nowMs ? evening : null;
}

/**
 * How long before a person's open WhatsApp chat closes their follow-up is due at the latest (decision 0135): the half
 * hour a sequence may hold its batch for an OK (PLAYBOOK_VETO_DELAY_MS), and a quarter of an hour to spare.
 */
const CHAT_ROOM_MS = PLAYBOOK_VETO_DELAY_MS + 15 * MIN_MS;

/**
 * When the follow-up to someone sent the booking link goes: the next day at the sequence's hour, by the business's
 * clock, kept inside the sending hours. The day after, never the same day: they have the link in hand tonight.
 *
 * `chatClosesAt`: when their open WhatsApp chat closes, said only where the follow-up may reply in it (decision 0135),
 * else null. Where it closes before the sequence's hour, the follow-up is due earlier that day, to the minute, with room
 * for its batch to wait (CHAT_ROOM_MS); never before the first sending hour, and where no such time is left (they last
 * wrote early the morning before, or the chat closes the same evening), at the sequence's hour, going as it would
 * without the chat.
 */
export function askFollowUpAt(ask: {
  askedAt: number;
  tz: string;
  runHour: number;
  chatClosesAt: number | null;
}): number {
  const { day, atHour } = nextDayAtHour(ask.askedAt, ask.tz, ask.runHour);
  if (ask.chatClosesAt === null) return atHour;
  const latest = Math.floor((ask.chatClosesAt - CHAT_ROOM_MS) / MIN_MS) * MIN_MS;
  return latest < atHour && latest >= wallClockAt(ask.tz, day, PLAYBOOK_HOURS.min, 0) ? latest : atHour;
}

/** The day after a moment by the business's clock, and the sequence's hour on it, kept inside the sending hours. */
function nextDayAtHour(fromMs: number, tz: string, runHour: number): { day: string; atHour: number } {
  const day = shiftKey(localDate(tz, new Date(fromMs)), 1);
  const hour = Math.min(Math.max(runHour, PLAYBOOK_HOURS.min), PLAYBOOK_HOURS.max);
  return { day, atHour: wallClockAt(tz, day, hour, 0) };
}

/**
 * When the thank-you for a deal marked won goes (22 Nov 2026): the next day at the sequence's hour, by the business's
 * clock, kept inside the sending hours, as the thank-you after a visit goes the day after it. Never the same day: a
 * member who marked the wrong deal has the rest of the day to take it back, and nothing is sent. Counted from the mark,
 * never from the day the deal's sheet says they said yes, which a member may set in the past.
 */
export function wonThanksAt(won: { markedAt: number; tz: string; runHour: number }): number {
  return nextDayAtHour(won.markedAt, won.tz, won.runHour).atHour;
}

/** How long after a visit is marked missed its message waits: long enough to take a slip of the finger back. */
const MISSED_GRACE_MS = 10 * MIN_MS;

/** How long after a visit's start a Missed still owes its person a message: marked later, it is bookkeeping. */
const MISSED_OWED_MS = 3 * DAY_MS;

/**
 * When the message to someone whose visit was marked missed goes, or null where none is owed: a few minutes after the
 * word, so a member who marked the wrong row can take it back and nothing is sent; none for a visit that began more than
 * three days before it was marked, where a member is tidying the record, not telling a customer.
 */
export function missedFollowUpAt(missed: { markedAt: number; startsAt: number }): number | null {
  if (missed.markedAt - missed.startsAt > MISSED_OWED_MS) return null;
  return missed.markedAt + MISSED_GRACE_MS;
}

/**
 * How many days pass before a second ask of the same person starts another follow-up in the same sequence. The follow-up
 * itself may carry the booking link, which is an ask's own sign: without the rest it would start the next one.
 */
export const ASK_REST_DAYS = 7;

/**
 * How long past its time an occasion's step may still go. One found later than this (its job could not run, or the
 * database was away) is left: a reminder a day late, or a follow-up two days after the ask, is the wrong message.
 */
export const OCCASION_LATE_MS = DAY_MS;

/* ------------------------------ whether it is still owed ------------------------------ */

/** What the record holds when an occasion's time comes: read by the door that runs it, judged here. */
export interface OccasionFacts {
  nowMs: number;
  /** The appointment the occasion names, as the record holds it now: null where it names none, or the row is gone. */
  appointment: { status: string; startsAt: number; vanished: boolean } | null;
  /** Whether the person has another visit that stands and has not begun. */
  bookedAhead: boolean;
  /** Whether an appointment of theirs was made since the occasion began. */
  bookedSince: boolean;
  /** The deal the occasion names, as the record holds it now: absent or null where it names none, or the row is gone. */
  deal?: { stage: string } | null;
}

/** Why an occasion's step is not sent, as its row keeps it (`sequence_occasions.why`). */
export type OccasionGone =
  "visit_gone" | "visit_moved" | "visit_begun" | "not_missed" | "booked" | "deal_gone" | "not_won";

/**
 * Why an occasion's step is no longer owed when its time comes, or null where it is. The one reading of it, asked by the
 * door that runs the step; the send asks the appointment's row once more as every visit's message does (contracts
 * appointmentHolds).
 *   visit_soon        The appointment still stands, at the start the occasion was made for, and has not begun.
 *   visit_missed      It is still marked missed (a member may take the word back), and they have not booked again.
 *   asked_no_booking  They have not booked since, and nothing of theirs is booked ahead.
 *   deal_won          The record still says the deal is won (a member may take the word back, or end it). Nothing else is
 *                     asked: the thank-you is never chosen by how the deal went, or by what else the person holds.
 */
export function occasionGone(trigger: OccasionTrigger, occasion: string, facts: OccasionFacts): OccasionGone | null {
  if (trigger === "asked_no_booking") return facts.bookedSince || facts.bookedAhead ? "booked" : null;
  if (trigger === "deal_won") {
    if (!facts.deal) return "deal_gone";
    return facts.deal.stage === "won" ? null : "not_won";
  }
  const appointment = facts.appointment;
  if (!appointment || appointment.vanished) return "visit_gone";
  if (trigger === "visit_missed") {
    if (appointment.status !== "missed") return "not_missed";
    return facts.bookedAhead ? "booked" : null;
  }
  if (appointment.status !== "booked") return "visit_gone";
  if (occasion !== visitOccasion(occasionAppointment(occasion) ?? "", appointment.startsAt)) return "visit_moved";
  return appointment.startsAt <= facts.nowMs ? "visit_begun" : null;
}

/* ------------------------------ a deal, asked once more at the send ------------------------------ */

/** The deal a person's row was made for (its `deal` fact), where it is owed only while that deal is won (`deal_was`). */
const dealOwedFor = (facts: Record<string, unknown>): string | null =>
  typeof facts.deal === "string" && facts.deal_was === "won" ? facts.deal : null;

/** The deals a batch's rows were made for, each once: what its send reads the stage of, in one read. */
export function dealIdsOf(batch: readonly { facts: unknown }[]): string[] {
  const ids = new Set<string>();
  for (const row of batch) {
    const id = dealOwedFor(recordOrEmpty(row.facts));
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Whether a row made for a deal won still goes, asked at the send as a visit's row is asked of its appointment (contracts
 * appointmentHolds): only while the record says that deal is won. A batch may wait half an hour for a stop, or days for
 * its words' first approval, and a deal taken back, lost or ended meanwhile is thanked for nothing. `stages` is each
 * deal's stage as the record holds it now, by id; one it no longer holds is not won. A row about no deal always goes.
 */
export function dealStillWon(stages: ReadonlyMap<string, string>, facts: Record<string, unknown>): boolean {
  const id = dealOwedFor(facts);
  return id === null || stages.get(id) === "won";
}

/**
 * What an occasion's row says became of it once its step was asked for: its batch was made (`ran`, the person's message
 * is written or waits for an OK), or it left with why (occasionGone's reason, or the run's own: nobody to reach, the
 * sequence off). A step the run could not make this minute stays waiting, and is asked again.
 */
export type OccasionOutcome = { state: "ran"; batchId: string } | { state: "left"; why: string };
