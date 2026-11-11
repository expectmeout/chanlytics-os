/**
 * A booking the reminder's daily look can no longer name (decision 0118). The look for a visit is the one on the day
 * before it, at the step's hour (runDueNow); a booking that lands after that look was reminded by nobody. It gets its own
 * reminder: 8:00 PM the evening before, at once when that has just passed, else the visit's own morning where that leaves
 * two hours. Nothing where the look will still name it, and nothing where no reminder is owed: booked today for today, or
 * at night for the next morning, they booked hours ago.
 */
import { wallClockAt } from "../../shared/clock";
import { HOUR_MS } from "../../shared/time";
import { shiftKey } from "../../shared/zone/day-keys";
import { localDate, localHour } from "./schedule";
import { PLAYBOOK_HOURS } from "./triggers/kinds";

/** The least a same-day reminder leaves before the visit. */
const LATE_REMINDER_NOTICE_MS = 2 * HOUR_MS;

/** A booking as the rule reads it: the visit, the moment it landed, and the reminder step's own clock. */
interface LateBooking {
  /** The visit's start, epoch ms. */
  startsAt: number;
  /** The business's zone. */
  tz: string;
  /** When the booking landed. */
  nowMs: number;
  /** The reminder step's hour, and the last day it ran (sequence_steps.run_hour, last_run_for). */
  runHour: number;
  lastRunFor: string | null;
}

/**
 * When a late booking's reminder goes (epoch ms) and the visit day it is about, by the business's clock; null where the
 * daily look still names the visit, or no reminder is owed.
 */
export function lateReminderAt(booking: LateBooking): { at: number; day: string } | null {
  if (booking.startsAt <= booking.nowMs) return null;
  const now = new Date(booking.nowMs);
  const today = localDate(booking.tz, now);
  const day = localDate(booking.tz, new Date(booking.startsAt));
  if (day === today) return null;
  const eve = shiftKey(day, -1);
  // A visit two days out or more: the look on its eve names it.
  if (eve > today) return null;
  const hour = localHour(booking.tz, now);
  // Today is the eve. A look still to come today names the visit itself.
  if (booking.lastRunFor !== today && hour <= PLAYBOOK_HOURS.max) return null;
  const evening = wallClockAt(booking.tz, eve, PLAYBOOK_HOURS.max, 0);
  if (booking.nowMs < evening) return { at: evening, day };
  if (hour <= PLAYBOOK_HOURS.max) return { at: booking.nowMs, day };
  const morning = wallClockAt(booking.tz, day, Math.max(booking.runHour, PLAYBOOK_HOURS.min), 0);
  return booking.nowMs < morning && booking.startsAt - morning >= LATE_REMINDER_NOTICE_MS ? { at: morning, day } : null;
}

/** A visit marked kept as the rule reads it: its start, the moment of the word, and the thank-you step's own clock. */
interface KeptVisit {
  /** The visit's start, epoch ms. */
  startsAt: number;
  /** The business's zone. */
  tz: string;
  /** When a member said it was kept. */
  nowMs: number;
  /** The thank-you step's hour, and the last day it ran (sequence_steps.run_hour, last_run_for). */
  runHour: number;
  lastRunFor: string | null;
}

/**
 * When a visit marked kept is thanked (epoch ms), the day of the visit, and whether the day's look can no longer send it
 * (`late`), by the business's clock (decision 0122); null where no thank-you is owed. Its words say "yesterday", so it is
 * owed on the day after the visit and no other. Marked on the visit's own day, tomorrow's look names it; marked the day
 * after before that day's look, the look names it, now that the record says kept; marked after the look, it goes now
 * on its own, while the day's sending hours last; marked later still, its words would be a day old, and nothing goes.
 * THE reading: the edge's late thank-you asks it (one that is `late` is its to send), and the door that takes the
 * word says it (Today's row).
 */
export function keptThanksAt(kept: KeptVisit): { at: number; day: string; late: boolean } | null {
  const now = new Date(kept.nowMs);
  const today = localDate(kept.tz, now);
  const day = localDate(kept.tz, new Date(kept.startsAt));
  const next = shiftKey(day, 1);
  const look = (on: string) =>
    wallClockAt(kept.tz, on, Math.min(Math.max(kept.runHour, PLAYBOOK_HOURS.min), PLAYBOOK_HOURS.max), 0);
  if (today === day) return { at: look(next), day, late: false };
  if (today !== next || localHour(kept.tz, now) > PLAYBOOK_HOURS.max) return null;
  // A look still to come today names the visit itself.
  if (kept.lastRunFor !== today) return { at: Math.max(look(today), kept.nowMs), day, late: false };
  return { at: kept.nowMs, day, late: true };
}

/**
 * What a late Kept's thank-you came to (the edge's, decision 0122): one that goes at its time, or waits for the owner's
 * OK; or none, and why: no running step on the day after a visit, the workspace or its step paused, the appointment
 * gone or not kept, nobody it is for, a visit the day's look names or one thanked for no longer, one thanked already,
 * or a run that was off (its reason the detail).
 */
export type LateThanks =
  | { thanked: true; at: string | null; waits: boolean }
  | {
      thanked: false;
      why: "no_step" | "paused" | "gone" | "nobody" | "not_late" | "already" | "off";
      detail?: string;
    };

/**
 * What a late booking's reminder came to (the edge's, decision 0118): a reminder that goes at its time, or waits for the
 * owner's OK; or none, and why: no running step on `visit_tomorrow`, the workspace or its step paused, the appointment
 * gone from the record, nobody it is for, a visit the daily look still names, one reminded already, or a run that was off
 * (its reason the detail).
 */
export type LateReminder =
  | { reminded: true; at: string | null; waits: boolean }
  | {
      reminded: false;
      why: "no_step" | "paused" | "gone" | "nobody" | "not_late" | "already" | "off";
      detail?: string;
    };
