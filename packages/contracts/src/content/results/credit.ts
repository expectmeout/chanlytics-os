/**
 * What a booking is put down to: one rule for a post, an ad and a form (the content loop PRD's 9.3, Appendix A.6 and
 * A.7, calls 31 and 36), worked out when read and kept nowhere. It is handed a booking and the person's touches and
 * asks nothing of the database.
 *
 *   - It counts at all only for the same person, a visit neither proposed nor cancelled, made after the touch and
 *     within CREDIT_WINDOW_DAYS of it.
 *   - `direct` ("from this post") for the one thing the visit recorded it answered when it was asked for
 *     (appointments.through_type, through_id), where that touch counts.
 *   - `assisted` ("it helped") for every other thing a counted touch was of, once each.
 *   - `none` where nothing counts.
 *
 * When a visit was made (madeAtOf) is known for a time asked for here and confirmed (`receptionist`) and for a visit a
 * member added (`person`): the row's own time. A copy read in from a calendar, a booking email or a tool is not known
 * (whether its source's own time is kept is still to confirm, Appendix A.10), so nothing is credited with it.
 */
import type { AppointmentSource, AppointmentStatus } from "../../calendar/feed-appointments";
import { DAY_MS } from "../../shared/time";
import type { CreditClass, TouchSubjectType } from "./sets";

/** The days before a visit was made that a touch helps it (call 16), named on the page. */
export const CREDIT_WINDOW_DAYS = 14;

/** What a touch, or a visit's answer, is of. */
export interface CreditSubject {
  type: TouchSubjectType;
  id: string;
}

/** A visit, as the rule reads it: whose, how it stands, how it came, when its row was written, what it answered. */
export interface CreditVisit {
  contact_id: string | null;
  status: AppointmentStatus;
  source: AppointmentSource;
  created_at: string;
  through_type: TouchSubjectType | null;
  through_id: string | null;
}

/** A person's touch, as the rule reads it. */
export interface CreditTouch {
  subject: CreditSubject;
  contact_id: string | null;
  at: string;
}

/** What one visit is put down to: the one thing it came from, and the others that helped. */
export interface Credit {
  direct: CreditSubject | null;
  assisted: CreditSubject[];
}

/** The sources whose own row says when the visit was made: a time asked for here, and a visit a member added. */
const MADE_HERE: ReadonlySet<AppointmentSource> = new Set(["receptionist", "person"]);

/** When a visit was made, where that is known (A.6); null for a copy read in from outside. */
export function madeAtOf(visit: Pick<CreditVisit, "source" | "created_at">): string | null {
  return MADE_HERE.has(visit.source) ? visit.created_at : null;
}

const sameSubject = (one: CreditSubject, other: CreditSubject) => one.type === other.type && one.id === other.id;

/** Whether a touch counts for a visit: the same person, before the visit was made and within the window. */
function touchCounts(touch: CreditTouch, visit: CreditVisit, madeMs: number): boolean {
  if (!visit.contact_id || touch.contact_id !== visit.contact_id) return false;
  const atMs = Date.parse(touch.at);
  return Number.isFinite(atMs) && atMs <= madeMs && madeMs - atMs <= CREDIT_WINDOW_DAYS * DAY_MS;
}

/** What one visit is put down to, by the one rule. */
export function creditOf(visit: CreditVisit, touches: readonly CreditTouch[]): Credit {
  const madeAt = madeAtOf(visit);
  const madeMs = madeAt ? Date.parse(madeAt) : Number.NaN;
  if (visit.status === "proposed" || visit.status === "cancelled" || !Number.isFinite(madeMs))
    return { direct: null, assisted: [] };
  const counted: CreditSubject[] = [];
  for (const touch of touches)
    if (touchCounts(touch, visit, madeMs) && !counted.some((subject) => sameSubject(subject, touch.subject)))
      counted.push(touch.subject);
  const answered = visit.through_type && visit.through_id ? { type: visit.through_type, id: visit.through_id } : null;
  const direct = answered ? (counted.find((subject) => sameSubject(subject, answered)) ?? null) : null;
  return { direct, assisted: counted.filter((subject) => !direct || !sameSubject(subject, direct)) };
}

/** What a visit's credit says of one thing: from it, it helped, or nothing. */
export function creditFor(subject: CreditSubject, credit: Credit): CreditClass {
  if (credit.direct && sameSubject(credit.direct, subject)) return "direct";
  return credit.assisted.some((one) => sameSubject(one, subject)) ? "assisted" : "none";
}
