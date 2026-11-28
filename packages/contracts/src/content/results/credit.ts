/**
 * What a booking is put down to: one rule for a post, an ad and a form (the content loop PRD's 9.3, Appendix A.6 and
 * A.7, calls 31 and 36; 00732), worked out when read and kept nowhere. The rule itself is the database's
 * (`booking_sources`): every page and AI read its answer, so no page works it out a second way. Here is the shape that
 * answer takes on its way to a page, and the window as a page says it.
 *
 *   - A booking: a visit neither proposed nor cancelled, with a moment it was made that the record can prove (asked for
 *     here, added by a member, or arrived as a customer's booking).
 *   - A touch counts for the same person, before the booking was made, within CREDIT_WINDOW_DAYS of it.
 *   - `main`: the one source a booking is put down to: what it names itself (`tied`: the post or ad its conversation
 *     answered, the form its time was asked for on) or, where it names none, the first thing its person touched.
 *   - `helped`: every other source on the way, shown beside and never added in.
 */
import type { AppointmentStatus } from "../../calendar/feed-appointments";
import type { TouchSubjectType } from "./sets";

/** The days before a booking was made that a touch counts for it (call 16), named on the page: the database's own (credit_window_days). */
export const CREDIT_WINDOW_DAYS = 14;

/** What a touch, or a booking's source, is of. */
export interface CreditSubject {
  type: TouchSubjectType;
  id: string;
}

/** One source of one booking, as the rule answers it. */
export interface BookingSource {
  type: TouchSubjectType;
  /** The source's record; null for an ad Chanlytics holds no record of, told apart by `ref`. */
  id: string | null;
  /** An ad's own name at its platform ("meta:123"); null for every other source. */
  ref: string | null;
  /** When the person first touched it inside the window. */
  at: string;
  /** Where it stands for this booking: the one source it is put down to, or one that helped on the way. */
  standing: "main" | "helped";
  /** Whether the booking itself names it. */
  tied: boolean;
}

/** One booking with everything it is put down to: its main source first. */
export interface BookingWithSources {
  appointment_id: string;
  contact_id: string | null;
  made_at: string;
  starts_at: string;
  status: AppointmentStatus;
  sources: BookingSource[];
}
