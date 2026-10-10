/**
 * The subscribers a delivery can name (contracts EVENT_SUBSCRIBERS; decision 0032, 00334): each a verb over the event
 * it is handed and the ports it acts through, run by the event_deliver job (packages/jobs handlers.ts) after the relay
 * wrote its delivery row.
 *
 * Every one may see the same delivery twice and must leave the same rows: a lease that ran out, a re-drive, a second
 * relay of a late commit are all second runs, and the ledger's rule below the commit line is at least once
 * (0031, invariant 3). The harness in tooling/scripts/tests/events runs each subscriber twice on one delivery.
 *
 *   audit             settles and does nothing else: it measures the relay (0032, step 3).
 *   reach_out_booked  an appointment added, confirmed or moved on the record (appointment.changed, 00386) is handed
 *                     to the booking door, so the lead a reach-out wrote to is booked however the booking arrived: a
 *                     booking tool's notice by email never reached it. The feed's own changes (00348) are passed: the
 *                     hourly sweep hands the door the feed's items itself. The door stamps a lead once, so a second
 *                     run moves nothing.
 */
import type { EventSubscriber } from "@chanlytics/contracts";
import type { DeliveredEvent } from "@chanlytics/db";

/** What a subscriber acts through: the job's own database, behind the verbs it needs. */
export interface SubscriberPorts {
  /** The booking door over one appointment of the record (00386 reach_out_booked_from): how many leads moved. */
  bookedFromAppointment(tenantId: string, appointmentId: string): Promise<number>;
}

/** A subscriber: the event, once; nothing to return, a throw is a failed delivery. */
export type Subscriber = (event: DeliveredEvent, ports: SubscriberPorts) => Promise<void>;

/** The changes that may book a lead: an appointment that is there now (a cancelled one books nobody). */
const BOOKS = new Set(["added", "confirmed", "moved"]);

export const SUBSCRIBERS: Readonly<Record<EventSubscriber, Subscriber>> = {
  audit: async () => {},
  reach_out_booked: async (event, ports) => {
    if (event.kind !== "appointment.changed" || event.subject_type !== "appointment" || !event.subject_id) return;
    const data = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : {};
    const { change, source } = data as Record<string, unknown>;
    if (typeof change !== "string" || !BOOKS.has(change) || source === "calendar_feed") return;
    await ports.bookedFromAppointment(event.tenant_id, event.subject_id);
  },
};
