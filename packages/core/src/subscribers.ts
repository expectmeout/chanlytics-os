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
 *   reach_out_booked  an appointment added, confirmed or moved on the record (appointment.changed, 00389) is handed
 *                     to the booking door, so the lead a reach-out wrote to is booked however the booking arrived: a
 *                     booking tool's notice by email never reached it. The feed's own changes (00348) are passed: the
 *                     hourly sweep hands the door the feed's items itself. The door stamps a lead once, so a second
 *                     run moves nothing.
 *   owner_notice      a thread handed to a person (escalation.opened, or an open hold taking another reason:
 *                     escalation.changed; 00388, 00396) is told to its workspace once, from its rows (decision 0043):
 *                     the hold read again, so one answered since tells nobody; the notice keeps its event, so a second
 *                     run, or a notice an edge from before told inline, sends nothing again.
 */
import { holdNotice, type EventSubscriber, type HoldFacts, type JobNews } from "@chanlytics/contracts";
import type { DeliveredEvent } from "@chanlytics/db";

/** What a subscriber acts through: the job's own database, behind the verbs it needs. */
export interface SubscriberPorts {
  /** The booking door over one appointment of the record (00389 reach_out_booked_from): how many leads moved. */
  bookedFromAppointment(tenantId: string, appointmentId: string): Promise<number>;
  /** A hold's notice as its rows say it (packages/db holdFactsOf), or null when the thread no longer waits for a person. */
  holdFacts(tenantId: string, ref: { conversationId: string } | { escalationId: string }): Promise<HoldFacts | null>;
  /** Whether the workspace was told of this hold already: this event's notice, or an inline one about the thread. */
  holdTold(tenantId: string, p: { eventId: string; conversationId: string; at: string }): Promise<boolean>;
  /**
   * Tell the workspace: the bell, the email its settings allow, the phones each member allows (decision 0040), exactly
   * once for the event the news names. Throws when it could not, so the delivery tries again.
   */
  tell(news: JobNews): Promise<void>;
}

/** A subscriber: the event, once; nothing to return, a throw is a failed delivery. */
export type Subscriber = (event: DeliveredEvent, ports: SubscriberPorts) => Promise<void>;

/**
 * Whether a hold's write landed, so its event tells the owner (owner_notice, once, after the commit). Anything else, a
 * write the database refused or one never answered, is told where the hold was decided, so a database that refuses the
 * hold never silences it (decision 0043, step 3).
 */
export function toldFromItsEvent(written: string | null | undefined): boolean {
  return written === "opened" || written === "changed" || written === "refreshed";
}

/** Which hold an escalation event names: an opened one by its thread, a change by the hold's own id. */
function holdOfEvent(event: DeliveredEvent): { conversationId: string } | { escalationId: string } | null {
  if (!event.subject_id) return null;
  if (event.kind === "escalation.opened" && event.subject_type === "conversation")
    return { conversationId: event.subject_id };
  if (event.kind === "escalation.changed") return { escalationId: event.subject_id };
  return null;
}

/** The reason a hold's event says it holds for: an opened hold's, or the one a change moved it to. */
function reasonOfEvent(event: DeliveredEvent): unknown {
  const data = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : {};
  return (data as Record<string, unknown>)[event.kind === "escalation.changed" ? "to" : "reason"];
}

/**
 * An email's hold is told where it is taken in, never here: by the intake, in its job, naming the sender and the subject
 * (core email-ingest.ts); by its reading, for a reach-out's reply (reply-read.ts); or by the failure notice of a job
 * that died taking it in (jobs settle.ts). Told here as well, the owner would hear of one email twice.
 */
const TOLD_WHERE_TAKEN_IN = "email_review";

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
  owner_notice: async (event, ports) => {
    const ref = holdOfEvent(event);
    if (!ref || reasonOfEvent(event) === TOLD_WHERE_TAKEN_IN) return;
    const facts = await ports.holdFacts(event.tenant_id, ref);
    if (!facts || facts.reason === TOLD_WHERE_TAKEN_IN) return;
    // A hold that has taken another reason since this event is told by the event that gave it that reason, so two
    // deliveries out of order tell the hold once, as it stands.
    if (reasonOfEvent(event) !== facts.reason) return;
    const told = await ports.holdTold(event.tenant_id, {
      eventId: event.id,
      conversationId: facts.conversationId,
      at: event.created_at,
    });
    if (told) return;
    await ports.tell({ ...holdNotice(facts), sourceEvent: event.id });
  },
};
