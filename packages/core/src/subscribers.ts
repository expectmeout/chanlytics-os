/**
 * The subscribers a delivery can name (contracts EVENT_SUBSCRIBERS; decision 0032, 00334): each a verb over the event
 * it is handed and the ports it acts through, run by the event_deliver job (packages/jobs handlers.ts) after the relay
 * wrote its delivery row.
 *
 * Every one may see the same delivery twice and must leave the same rows: a lease that ran out, a re-drive, a second
 * relay of a late commit are all second runs, and the ledger's rule below the commit line is at least once
 * (0031, invariant 3). The harness in tooling/scripts/tests/events runs each subscriber twice on one delivery.
 *
 *   reach_out_booked  an appointment added, confirmed or moved on the record (appointment.changed, 00389) is handed
 *                     to the booking door, so the lead a reach-out wrote to is booked however the booking arrived: a
 *                     booking tool's notice by email never reached it. The feed's own changes (00348) are passed: the
 *                     hourly sweep hands the door the feed's items itself. The door stamps a lead once, so a second
 *                     run moves nothing.
 *   owner_notice      a thread handed to a person (escalation.opened, or an open hold taking another reason:
 *                     escalation.changed; 00388, 00396) is told to its workspace once, from its rows (decision 0043):
 *                     the hold read again, so one answered since tells nobody; the notice keeps its event, so a second
 *                     run, or a notice an edge from before told inline, sends nothing again. A hold that waits on
 *                     nobody (an `opt_out` an edge from before opened) is not told here: consent_notice tells it.
 *   consent_notice    a customer's no (contact.consent_changed, whichever door wrote it: a typed STOP, the unsubscribe
 *                     link, a complaint, a carrier's report) is told to its workspace once on the bell, in the Inbox's
 *                     words (decision 0048, 00409). News and no wait: no hold is opened for it, and the mail follows
 *                     only as the business chose. A no a member recorded, and every yes, tell nobody.
 *   visit_notice      a booking that arrived (appointment.changed, a visit added or a hold confirmed, by a booking tool or the
 *                     owner's calendar feed: 00410, S1-01) is told once on the bell, opening the visit on its day. The
 *                     visits one read of the calendar added together are one line, told by the first of their events, and
 *                     a read that adds more than a customer could book in an hour (a calendar newly connected) tells
 *                     nobody. A visit withdrawn or already past by the time the delivery runs is not news. A booking the
 *                     customer cancelled or moved through their booking tool (by the service, 00436: never a member's own
 *                     word) is told once too, while the visit is still ahead (R11 S6-6, contracts bookingChanged), and a
 *                     cancellation's news says what the offer of its time came to (decision 0082), asked of the offer
 *                     itself, so the bell and the batch never disagree.
 *   team_notice       a teammate who accepted an invitation and joined (member.joined: 00410, S1-19) is told once on the
 *                     bell, opening Settings > Team; so is one who left, by their own hand or with their account
 *                     (member.left: 00437, R11 W-channel-team-plus-5).
 *   freed_time_offer  the time an appointment's change freed (the service's cancel or move, the feed's vanished entry:
 *                     appointment.changed) is decided by the one rule (contracts freedTimeOf) over the record and the
 *                     receptionist's calendar, and offered through the edge's door, which runs the workspace's step on
 *                     slot_opened (decision 0082, 00498). Each change that offers nothing says why in one log line. The
 *                     offer is once per appointment (sequence_batches_offered_once), so a second run makes nothing new.
 */
import {
  bookingArriving,
  bookingChanged,
  CATCH_UP_VISITS,
  changeFreesATime,
  feedAdditionIsBooking,
  freedTimeOf,
  holdNotice,
  memberJoinedBy,
  memberJoinedNotice,
  memberLeftBy,
  memberLeftNotice,
  optOutNotice,
  optOutOf,
  visitChangeNews,
  visitNews,
  waitsOnAPerson,
  type BookedVisit,
  type EventSubscriber,
  type FreedTimeCalendar,
  type FreedTimeEvent,
  type FreedTimeOffer,
  type FreedTimeRefusal,
  type FreedTimeRow,
  type HoldFacts,
  type JobNews,
  type MemberJoined,
  type OptOutPerson,
} from "@chanlytics/contracts";
import { errField, logger } from "@chanlytics/channels";
import type { DeliveredEvent } from "@chanlytics/db";
import type { FreedTimeRun } from "./campaigns/ports";

/** What a subscriber acts through: the job's own database, behind the verbs it needs. */
export interface SubscriberPorts {
  /** The booking door over one appointment of the record (00389 reach_out_booked_from): how many leads moved. */
  bookedFromAppointment(tenantId: string, appointmentId: string): Promise<number>;
  /** A hold's notice as its rows say it (packages/db holdFactsOf), or null when the thread no longer waits for a person. */
  holdFacts(tenantId: string, ref: { conversationId: string } | { escalationId: string }): Promise<HoldFacts | null>;
  /**
   * Whether the workspace was told of this hold in full already: this event's notice with nothing owed, or an inline one
   * about the thread. A notice kept whose mail is still owed (the mail failed after the row and the phones went) is not
   * told yet: `tell` then sends the mail alone, and the row is never kept twice.
   */
  holdTold(tenantId: string, p: { eventId: string; conversationId: string; at: string }): Promise<boolean>;
  /** The person a consent change is about, as their record says it (packages/db personFactsOf); null when there is no such person. */
  optOutPerson(tenantId: string, contactId: string): Promise<OptOutPerson | null>;
  /**
   * Whether the workspace was told of this no already in full: this event's notice with nothing owed, or another door's
   * notice for the same person within the minute (an unsubscribe page's "Stop all messages" writes two events for one
   * press).
   */
  optOutTold(tenantId: string, p: { eventId: string; contactId: string; at: string }): Promise<boolean>;
  /**
   * Whether the workspace was told of this event in full already: a notice answering it, with nothing owed (news that has no
   * twin to look for but its own earlier delivery).
   */
  eventTold(tenantId: string, eventId: string): Promise<boolean>;
  /**
   * The visits of the record that are booked and still ahead among these, as the record says them now, with who booked
   * (packages/db bookedVisitsOf). A visit cancelled, vanished from the feed, past, or a member's own entry is not among them;
   * with `status` "cancelled", the cancelled ones still ahead instead.
   */
  bookedVisits(
    tenantId: string,
    ids: readonly string[],
    nowMs: number,
    status?: "booked" | "cancelled",
  ): Promise<BookedVisit[]>;
  /**
   * The calendar's additions one read of the feed wrote in the same transaction as this event, by event id (packages/db
   * feedAdditionsWith): at most CATCH_UP_VISITS + 1, so a read that added more is seen as more without reading all of it.
   */
  feedAdditionsWith(
    tenantId: string,
    event: { id: string; at: string },
  ): Promise<Array<{ eventId: string; appointmentId: string; data: unknown }>>;
  /**
   * Whether this visit was told already as its other sighting (packages/db twinTold): a booking's row and the calendar's
   * copy of it, whichever arrived first, the other's arrival answered by the bell.
   */
  twinTold(tenantId: string, appointmentId: string): Promise<boolean>;
  /** The invitation a member.joined event is about: who accepted it and as what (packages/db memberJoinedOf); null when it is gone. */
  memberJoined(tenantId: string, invitationId: string): Promise<MemberJoined | null>;
  /**
   * Whether the workspace was told of this invitation's acceptance already, by whichever event: a read that took the seat
   * twice (two tabs at once) writes two member.joined events, and the owner is told of one arrival once.
   */
  memberTold(tenantId: string, invitationId: string): Promise<boolean>;
  /** The address of a person who left, from the identity store (packages/db memberEmailOf); null for an account that is gone. */
  memberEmail(userId: string): Promise<string | null>;
  /**
   * The appointment an event is about and the calendar the receptionist reads over it (packages/db freedTimeFactsOf), or
   * null when the record no longer holds the row.
   */
  freedTimeFacts(
    tenantId: string,
    appointmentId: string,
    nowMs: number,
  ): Promise<{ row: FreedTimeRow; calendar: FreedTimeCalendar } | null>;
  /**
   * The edge's offer of a freed time (decision 0082): the workspace's running step on `slot_opened` runs for it, once per
   * appointment, and a second ask answers the batch the first made. Throws when it could not be asked, so the delivery
   * tries again.
   */
  offerFreedTime(tenantId: string, freed: FreedTimeRun): Promise<FreedTimeOffer>;
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

/** What an event's freed time came to: the offer's answer, or why none was asked (the rule's refusal, or the row gone). */
type FreedTimeAsked = FreedTimeOffer | { offered: false; why: FreedTimeRefusal | "gone" };

/** What an `appointment.changed` event says, as a freed time reads it; null where it names no change. */
function freedTimeEventOf(data: unknown): FreedTimeEvent | null {
  const d = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  if (typeof d.change !== "string") return null;
  const text = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return { change: d.change, by: text(d.by), source: text(d.source), was_at: text(d.was_at) };
}

/**
 * The time an appointment's change freed, offered (decision 0082), or why not; null for an event that frees no time (a
 * booking added or confirmed), which is nobody's refusal. The one path `freed_time_offer` takes and `visit_notice` asks
 * for its clause: the offer is once per appointment (the edge's, over sequence_batches_offered_once), so whichever
 * delivery asks first makes it and the other hears the batch it made.
 */
async function freedTimeAsked(
  event: DeliveredEvent,
  ports: SubscriberPorts,
  nowMs: number,
): Promise<FreedTimeAsked | null> {
  if (event.kind !== "appointment.changed" || event.subject_type !== "appointment" || !event.subject_id) return null;
  const said = freedTimeEventOf(event.data);
  if (!said || !changeFreesATime(said.change)) return null;
  const facts = await ports.freedTimeFacts(event.tenant_id, event.subject_id, nowMs);
  if (!facts) return { offered: false, why: "gone" };
  const verdict = freedTimeOf(said, facts.row, facts.calendar, new Date(nowMs));
  if (!verdict.ok) return { offered: false, why: verdict.why };
  return ports.offerFreedTime(event.tenant_id, { from: event.subject_id, start: verdict.start, end: verdict.end });
}

/**
 * What a cancellation's news says its offer came to: a batch, or nobody to offer it to; null where the workspace offers
 * no freed time or the time was not offered. An offer that could not be asked is left out and said in the log: the
 * subscriber's own delivery asks again, and the news never waits on it.
 */
async function offerForNews(
  event: DeliveredEvent,
  ports: SubscriberPorts,
  nowMs: number,
): Promise<FreedTimeOffer | null> {
  try {
    const asked = await freedTimeAsked(event, ports, nowMs);
    if (!asked) return null;
    if (asked.offered) return asked;
    return asked.why === "nobody" ? { offered: false, why: "nobody" } : null;
  } catch (e) {
    logger().warn("freed_time_offer_unasked", { tenant_id: event.tenant_id, event_id: event.id, error: errField(e) });
    return null;
  }
}

export const SUBSCRIBERS: Readonly<Record<EventSubscriber, Subscriber>> = {
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
    // A hold that waits on nobody is news, not a wait (decision 0048): a customer's STOP is told from its consent event
    // (consent_notice). An edge from before still opens one; it is not told twice, and not as "needs a person".
    if (!waitsOnAPerson(facts.reason)) return;
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
  consent_notice: async (event, ports) => {
    if (event.kind !== "contact.consent_changed" || event.subject_type !== "contact" || !event.subject_id) return;
    // Only a no the customer or a provider gave: a yes, a member's own record and a merge are news to nobody.
    const said = optOutOf(event.data);
    if (!said) return;
    const person = await ports.optOutPerson(event.tenant_id, event.subject_id);
    if (!person) return;
    const told = await ports.optOutTold(event.tenant_id, {
      eventId: event.id,
      contactId: event.subject_id,
      at: event.created_at,
    });
    if (told) return;
    await ports.tell({ ...optOutNotice({ ...person, ...said, contactId: event.subject_id }), sourceEvent: event.id });
  },
  visit_notice: async (event, ports) => {
    // A booking the customer cancelled or moved: one visit, told by its own event, while it is still ahead.
    const changed = bookingChanged(event);
    if (changed) {
      if (await ports.eventTold(event.tenant_id, event.id)) return;
      const nowMs = Date.now();
      const status = changed.change === "cancelled" ? "cancelled" : "booked";
      const visit = (await ports.bookedVisits(event.tenant_id, [changed.appointmentId], nowMs, status)).at(0);
      if (!visit) return;
      const offer = changed.change === "cancelled" ? await offerForNews(event, ports, nowMs) : null;
      await ports.tell({ ...visitChangeNews(visit, changed.change, nowMs, offer), sourceEvent: event.id });
      return;
    }
    const arriving = bookingArriving(event);
    if (!arriving) return;
    let ids = [arriving.appointmentId];
    if (arriving.via === "calendar_feed") {
      // One read of the owner's calendar adds its visits in one transaction, and each is an event of its own. A read that
      // adds more than customers book in an hour, whatever it adds, is a calendar rebuilt or swapped: not news. Of the
      // rest, the read's bookings are one line, told by the first of them (00419's facts, the one predicate): the owner's
      // own entries, a series' next occurrence and a booking's copy neither lead the line nor join it.
      const together = await ports.feedAdditionsWith(event.tenant_id, { id: event.id, at: event.created_at });
      if (together.length > CATCH_UP_VISITS) return;
      const booked = together.filter((t) => feedAdditionIsBooking(t.data));
      const lead = booked.at(0);
      if (lead && lead.eventId !== event.id) return;
      if (lead) ids = booked.map((t) => t.appointmentId);
    }
    if (await ports.eventTold(event.tenant_id, event.id)) return;
    // A visit told already as its other sighting (a booking's row, the calendar's copy) is told once.
    const fresh: string[] = [];
    for (const id of ids) if (!(await ports.twinTold(event.tenant_id, id))) fresh.push(id);
    if (fresh.length === 0) return;
    ids = fresh;
    const nowMs = Date.now();
    const visits = await ports.bookedVisits(event.tenant_id, ids, nowMs);
    if (visits.length === 0) return;
    await ports.tell({ ...visitNews(visits, nowMs), sourceEvent: event.id });
  },
  team_notice: async (event, ports) => {
    // A teammate who left: told once by its own event, named while their account stands.
    const left = memberLeftBy(event);
    if (left) {
      if (await ports.eventTold(event.tenant_id, event.id)) return;
      const email = left.how === "left" ? await ports.memberEmail(left.by) : null;
      await ports.tell({ ...memberLeftNotice({ email, how: left.how, hadRole: left.hadRole }), sourceEvent: event.id });
      return;
    }
    const invitationId = memberJoinedBy(event);
    if (!invitationId) return;
    if (await ports.memberTold(event.tenant_id, invitationId)) return;
    const member = await ports.memberJoined(event.tenant_id, invitationId);
    if (!member) return;
    await ports.tell({ ...memberJoinedNotice(member), sourceEvent: event.id });
  },
  freed_time_offer: async (event, ports) => {
    const asked = await freedTimeAsked(event, ports, Date.now());
    if (!asked) return;
    const about = { tenant_id: event.tenant_id, appointment: event.subject_id, event_id: event.id };
    if (asked.offered) {
      logger().info("freed_time_offered", { ...about, people: asked.people, waits: asked.waits });
      return;
    }
    const detail = "detail" in asked && asked.detail ? { detail: asked.detail } : {};
    logger().info("freed_time_not_offered", { ...about, why: asked.why, ...detail });
  },
};
