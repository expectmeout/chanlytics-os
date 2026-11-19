/**
 * Booked (an ad's), as one rule (decision 0049, call 6): a person counted for an ad is booked from it when the visits
 * record holds a visit of theirs that starts after their first touch and is not cancelled. A visit ahead, kept, missed,
 * or past and never marked all count: they booked. A request nobody confirmed (`proposed`) does not, and a later message
 * never un-books anyone.
 *
 * It is worked out when read and stored nowhere: a stored "booked at" would stay after the visit is cancelled. It answers
 * another question than Reports' booking line (`bookedAfterAsk`: on an ask, as of today), so the two never share a label.
 */
import type { AppointmentStatus } from "../calendar/feed-appointments";

/** A visit as the rule reads it: when it starts (ms, or the wire's ISO instant) and where it stands in the record. */
interface TouchVisit {
  start: number | string;
  status: AppointmentStatus;
}

const momentOf = (at: number | string): number => (typeof at === "number" ? at : Date.parse(at));

/**
 * Whether someone who first got in touch at `touchAt` has booked since, over every visit the record and the feed hold
 * for them. A first touch or a start that is not a time counts for nothing.
 */
export function bookedAfterTouch(touchAt: number | string, visits: readonly TouchVisit[]): boolean {
  const touchMs = momentOf(touchAt);
  if (!Number.isFinite(touchMs)) return false;
  return visits.some(
    (visit) => visit.status !== "cancelled" && visit.status !== "proposed" && momentOf(visit.start) > touchMs,
  );
}
