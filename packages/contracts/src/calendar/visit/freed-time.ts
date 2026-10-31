/**
 * A freed time (decision 0082): the time a client's cancellation, a move or a vanished calendar entry freed, as the
 * receptionist would offer it to a caller now, or why there is none. One rule, over the receptionist's own open windows
 * (availability.ts freeWindows: the hours, the closures, the least notice, the booking window and the buffer around what
 * stands), so a freed time is never a time the receptionist would not offer: the part of the freed span that is open now, at
 * least one slot long, the longest where it falls in two. And the words a message says it in.
 *
 * Who decides the time was freed: the service, never a member's own word. A booking tool's email or door says `by`
 * "service" (00436), and the feed's read is the service by its nature (its events say the source, `calendar_feed`). A
 * member who marks a visit cancelled has their own reason, and nothing is offered on it.
 *
 * Pure: the caller reads the row, the calendar's facts and what stands on the record now, and hands the clock.
 */
import type { Closure, Hours } from "../../config/workspace-config/business-profile";
import { campaignRunsOn } from "../../playbooks/playbook-schedule";
import { clockDate, clockTime, localDaysBetween } from "../../shared/clock";
import { dateFormat } from "../../shared/time";
import { plural } from "../../shared/words";
import { BOOKING_DEFAULTS, freeWindows, hasHours, openAt, type BookingRulesLike } from "../availability";
import { sameVisitStart } from "../calendar-people";
import type { BusyBlock } from "../feed";
import { clockInZone, dayInZone } from "../zone-math";

/** The changes of an appointment that free its time: the record's and the feed's words (00419, 00436). */
const FREEING_CHANGES: ReadonlySet<string> = new Set(["cancelled", "moved", "vanished"]);

/** Whether an appointment's change may free a time (a cancel, a move, a vanish): the rest are never read for one. */
export const changeFreesATime = (change: string): boolean => FREEING_CHANGES.has(change);

/** Why a change offers no time: the subscriber's log line says it, one of these. */
export const FREED_TIME_REFUSALS = [
  "not_a_service_change",
  "no_person",
  "all_day",
  "no_was_at",
  "no_hours",
  "too_soon",
  "past_window",
  "closed",
  "not_free",
  "too_short",
] as const;
export type FreedTimeRefusal = (typeof FREED_TIME_REFUSALS)[number];

/** What an `appointment.changed` event says, as far as a freed time reads it. */
export interface FreedTimeEvent {
  change: string;
  /** Whose word it was (00436): "service" or "member"; absent on the feed's own events. */
  by?: string | null;
  source?: string | null;
  /** The time a moved appointment left (00498); absent on an event from before it. */
  was_at?: string | null;
}

/** The appointment the event is about, as the record holds it now. */
export interface FreedTimeRow {
  id: string;
  contactId: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}

/** A time that stands on the record: its span, the row, and whose visit it is. */
export interface StandingTime extends BusyBlock {
  id?: string;
  contactId?: string | null;
}

/** The calendar as the receptionist reads it: the business's hours and rules, and what stands on the record now. */
export interface FreedTimeCalendar {
  tz: string;
  hours: Record<string, Hours | undefined> | undefined;
  closures: Closure[] | undefined;
  /**
   * The record's standing appointments (proposed or booked, not vanished, not expired). A cancelled or vanished row is
   * not among them by its own status; a moved row stands at its new time.
   */
  standing: readonly StandingTime[];
  rules: BookingRulesLike | null | undefined;
}

/**
 * What a freed time's offer came to (the edge's, decision 0082): a batch and its people, and whether it waits for the
 * owner's OK; or none, and why: no running step on `slot_opened`, the workspace or its step paused, nobody to offer it
 * to, or a run that was off (its reason the detail).
 */
export type FreedTimeOffer =
  | { offered: true; people: number; waits: boolean }
  | { offered: false; why: "no_step" | "paused" | "nobody" | "off"; detail?: string };

export type FreedTimeVerdict = { ok: true; start: number; end: number } | { ok: false; why: FreedTimeRefusal };

const no = (why: FreedTimeRefusal): FreedTimeVerdict => ({ ok: false, why });

/** The quarter hours a span is looked at by, for whether any part of it is open. */
const LOOK_STEP_MS = 15 * 60_000;

/** The time the change freed: the row's own span, or for a move the span it left, as long as the row is. */
function freedSpan(event: FreedTimeEvent, row: FreedTimeRow): { start: number; end: number } | null {
  const start = Date.parse(row.startsAt);
  const length = Date.parse(row.endsAt) - start;
  if (event.change !== "moved") return { start, end: start + length };
  const was = event.was_at ? Date.parse(event.was_at) : Number.NaN;
  return Number.isFinite(was) ? { start: was, end: was + length } : null;
}

/** Whether any quarter hour of a span is inside the business's hours, by its own clock and closures. */
function anyOpen(cal: FreedTimeCalendar, start: number, end: number): boolean {
  for (let at = start; at < end; at += LOOK_STEP_MS) {
    const { hh, mm } = clockInZone(cal.tz, at);
    if (openAt(cal.hours, cal.closures, dayInZone(cal.tz, at).key, hh * 60 + mm)) return true;
  }
  return false;
}

/**
 * Whether a standing time is the freed visit's other sighting: the calendar's copy of a booking (the same person,
 * starting as the visit did, at one of `starts`) is that visit, cancelled or moved with it, until the feed's next read
 * says so. The row itself is never one: a moved row stands at its new time.
 */
function sightingOf(b: StandingTime, row: FreedTimeRow, starts: readonly number[]): boolean {
  return (
    !!row.contactId &&
    b.id !== row.id &&
    b.contactId === row.contactId &&
    starts.some((start) => sameVisitStart(b.start, start))
  );
}

/** What stands over a freed span, the freed visit's other sightings left out. */
function standingBesides(cal: FreedTimeCalendar, row: FreedTimeRow, spanStart: number): readonly StandingTime[] {
  return cal.standing.filter((b) => !sightingOf(b, row, [spanStart]));
}

/**
 * Whether a time a batch offers was taken since (decision 0082): something stands over it on the record now, the freed
 * visit's own sightings aside (at its start, or at the time offered, which a move's sighting starts at). Asked before the
 * batch's first send, so a time booked meanwhile is offered to nobody.
 */
export function freedTimeTaken(
  offered: { start: number; end: number },
  row: FreedTimeRow,
  standing: readonly StandingTime[],
): boolean {
  const starts = [Date.parse(row.startsAt), offered.start];
  return standing.some((b) => !sightingOf(b, row, starts) && b.start < offered.end && b.end > offered.start);
}

/** How much of a span what stands leaves, each standing block widened by the buffer on both sides. */
function leftOf(standing: readonly BusyBlock[], bufferMs: number, start: number, end: number): number {
  const taken = standing
    .map((b) => ({ start: Math.max(start, b.start - bufferMs), end: Math.min(end, b.end + bufferMs) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  let left = 0;
  let at = start;
  for (const b of taken) {
    if (b.start > at) left += b.start - at;
    at = Math.max(at, b.end);
  }
  return left + Math.max(0, end - at);
}

/**
 * Why a freed span the open windows hold no slot of is not offered: the first reason that holds, in this order. Not free
 * is all of it taken on the record now; part of it taken, with less than a slot left, is too short.
 */
function whyNot(
  cal: FreedTimeCalendar,
  standing: readonly BusyBlock[],
  rules: Required<BookingRulesLike>,
  span: { start: number; end: number },
  now: Date,
): FreedTimeRefusal {
  const { start, end } = span;
  if (end <= now.getTime() + rules.lead_hours * 3_600_000) return "too_soon";
  if (localDaysBetween(now.getTime(), start, cal.tz) >= rules.max_days_ahead) return "past_window";
  if (!anyOpen(cal, start, end)) return "closed";
  return leftOf(standing, rules.buffer_min * 60_000, start, end) === 0 ? "not_free" : "too_short";
}

/**
 * The time an appointment's change freed, as the receptionist would offer it now: the longest part of the freed span
 * inside its open windows, at least one slot long. Refused where the change is not the service's cancel, move or vanish,
 * the appointment is nobody's or all day, a move says no time it left, or no part of it is open now (FREED_TIME_REFUSALS).
 */
export function freedTimeOf(
  event: FreedTimeEvent,
  row: FreedTimeRow,
  cal: FreedTimeCalendar,
  now: Date,
): FreedTimeVerdict {
  const theService = event.by === "service" || event.source === "calendar_feed";
  if (!changeFreesATime(event.change) || !theService) return no("not_a_service_change");
  if (!row.contactId) return no("no_person");
  if (row.allDay) return no("all_day");
  const span = freedSpan(event, row);
  if (!span) return no("no_was_at");
  if (!hasHours(cal.hours)) return no("no_hours");
  const rules = { ...BOOKING_DEFAULTS, ...(cal.rules ?? {}) };
  const slot = rules.slot_min * 60_000;
  const standing = standingBesides(cal, row, span.start);
  let best: { start: number; end: number } | null = null;
  const days = freeWindows({
    hours: cal.hours,
    closures: cal.closures,
    tz: cal.tz,
    busy: [...standing],
    rules,
    now,
  });
  for (const w of days.flatMap((d) => d.windows)) {
    const start = Math.max(w.start, span.start);
    const end = Math.min(w.end, span.end);
    if (end - start >= slot && (!best || end - start > best.end - best.start)) best = { start, end };
  }
  return best ? { ok: true, ...best } : no(whyNot(cal, standing, rules, span, now));
}

/**
 * The time as a message says it, read at the moment it goes (`sendAt`), by the business's clock: "today at 4:30 PM",
 * "tomorrow at 2:00 PM", "on Thursday at 3:00 PM" within the week, else "on Nov 3 at 10:00 AM", since a weekday a week
 * or more away names two days. A batch made at night goes at nine, so its words are read then.
 */
export function freedTimeWords(startMs: number, tz: string, sendAt: Date): string {
  const days = localDaysBetween(sendAt.getTime(), startMs, tz);
  const time = clockTime(startMs, tz);
  if (days <= 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days < 7)
    return `on ${dateFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date(startMs))} at ${time}`;
  return `on ${clockDate(startMs, tz, sendAt.getTime())} at ${time}`;
}

/** The fewest cancellations in a window worth Ask's notice: fewer is a week's chance, not a habit. */
const UNOFFERED_MIN = 3;

/**
 * Ask's notice of the times nothing offered (decision 0082): at least three appointments cancelled in the window, a
 * calendar connected (the moment is offered there), and no step on the moment running by the one rule (campaignRunsOn: a
 * paused step, or one past its last day, offers nothing). Null otherwise, and where the count could not be read.
 */
export function freedTimesUnoffered(input: {
  cancellations: number | null;
  calendar: string;
  steps: readonly { trigger: string; state: string; until?: string | null }[];
  tz: string;
  nowMs: number;
  days: number;
}): { says: string; next: string } | null {
  const { cancellations, steps } = input;
  if (cancellations === null || cancellations < UNOFFERED_MIN || input.calendar === "none") return null;
  const at = { tz: input.tz, now: new Date(input.nowMs) };
  if (steps.some((p) => p.trigger === "slot_opened" && campaignRunsOn(p, at))) return null;
  return {
    says: `${plural(cancellations, "appointment was", "appointments were")} cancelled in the last ${input.days} days and the time was offered to nobody.`,
    next: "propose_sequence with action moment on slot_opened (Fill a cancellation): each time a cancellation frees goes to the people who asked and never booked",
  };
}
