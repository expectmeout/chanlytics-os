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
import { PLAYBOOK_HOURS } from "./triggers/kinds";
import type { OccasionTrigger } from "./triggers/occasions";

/* ------------------------------ what names one ------------------------------ */

const VISIT = "visit";
const MISSED = "missed";
const ASK = "ask";

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

/** The appointment an occasion names on the record, or null for one that names none (an ask). */
export function occasionAppointment(occasion: string): string | null {
  const [kind, id] = occasion.split(":");
  return (kind === VISIT || kind === MISSED) && id ? id : null;
}

/* ------------------------------ what one comes of ------------------------------ */

/** What happened that an occasion may come of, as its event says it: an appointment's change, or the booking link sent. */
export type OccasionEvent =
  { about: "appointment"; appointmentId: string; change: string } | { about: "ask"; messageId: string };

/**
 * The thing an event says happened, where an occasion may come of it; null for every other event. An appointment's
 * change (`appointment.changed`, whichever door wrote it), or a message that left carrying the booking link
 * (`booking_link.sent`, 00313).
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
 * When the follow-up to someone sent the booking link goes: the next day at the sequence's hour, by the business's
 * clock, kept inside the sending hours. The day after, never the same day: they have the link in hand tonight.
 */
export function askFollowUpAt(ask: { askedAt: number; tz: string; runHour: number }): number {
  const day = shiftKey(localDate(ask.tz, new Date(ask.askedAt)), 1);
  const hour = Math.min(Math.max(ask.runHour, PLAYBOOK_HOURS.min), PLAYBOOK_HOURS.max);
  return wallClockAt(ask.tz, day, hour, 0);
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
}

/** Why an occasion's step is not sent, as its row keeps it (`sequence_occasions.why`). */
export type OccasionGone = "visit_gone" | "visit_moved" | "visit_begun" | "not_missed" | "booked";

/**
 * Why an occasion's step is no longer owed when its time comes, or null where it is. The one reading of it, asked by the
 * door that runs the step; the send asks the appointment's row once more as every visit's message does (contracts
 * appointmentHolds).
 *   visit_soon        The appointment still stands, at the start the occasion was made for, and has not begun.
 *   visit_missed      It is still marked missed (a member may take the word back), and they have not booked again.
 *   asked_no_booking  They have not booked since, and nothing of theirs is booked ahead.
 */
export function occasionGone(trigger: OccasionTrigger, occasion: string, facts: OccasionFacts): OccasionGone | null {
  if (trigger === "asked_no_booking") return facts.bookedSince || facts.bookedAhead ? "booked" : null;
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

/**
 * What an occasion's row says became of it once its step was asked for: its batch was made (`ran`, the person's message
 * is written or waits for an OK), or it left with why (occasionGone's reason, or the run's own: nobody to reach, the
 * sequence off). A step the run could not make this minute stays waiting, and is asked again.
 */
export type OccasionOutcome = { state: "ran"; batchId: string } | { state: "left"; why: string };
