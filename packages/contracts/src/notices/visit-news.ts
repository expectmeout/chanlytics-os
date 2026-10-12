/**
 * A booking that arrives, told to the owner once on the bell (the wiring plan's task 2.4, S1-01): the pure half of core's
 * visit_notice subscriber. A customer's booking reached the Calendar and nothing else: the only bell row about the
 * calendar was "2 people added from your calendar", written by the hourly sweep alone and only when it made a person, so an
 * owner learned of a booking by looking. Every way a booking lands on the record writes an `appointment.changed` event in
 * the row's own transaction (the booking email's trigger, 00389; the calendar feed's door, 00348), so the notice is read
 * from that event, whichever door wrote it, and opens the visit on its day (visitRoute).
 *
 * `bookingArriving` reads the event: a visit ADDED, or a proposed one CONFIRMED, by a booking tool's email, a booking tool,
 * or the owner's calendar feed. A move, a cancellation, a visit that vanished from the feed or came back are not a booking,
 * and neither is a visit a member entered themselves (`person`): the owner did that. `visitNews` words it: one visit in
 * its own words, or the visits one read of the feed found together as one line, since the hourly sweep keeps everything
 * the calendar names and a calendar newly connected would otherwise ring once for each (CATCH_UP_VISITS).
 */
import type { JobNews } from "../today/notifications";
import { visitRoute } from "../calendar/appointment-key";
import { visitDateKey, visitLine } from "../calendar/calendar-people";

/** The changes of the record that are a booking arriving: a visit added, and a proposed one confirmed. */
const ARRIVES: ReadonlySet<string> = new Set(["added", "confirmed"]);

/** The sources a customer's booking comes by. A member's own entry (`person`) is the owner's, not news. */
export type BookingVia = "booking_email" | "booking_tool" | "calendar_feed";
const ARRIVES_BY: ReadonlySet<string> = new Set<BookingVia>(["booking_email", "booking_tool", "calendar_feed"]);

/**
 * How many visits one read of the owner's calendar may add before it is not news. The hourly sweep keeps every entry the
 * calendar names in its window (appointments_feed_sync), so the read that follows connecting a calendar, or rebuilding
 * one, adds them all at once: that is a calendar read, not customers booking. A read adding more than this says nothing.
 */
export const CATCH_UP_VISITS = 8;

/** How many visits one line of a group names before it says "and N more". */
const NAMED_IN_A_GROUP = 3;

/** What the event of a booking arriving says of it. */
interface ArrivingBooking {
  /** The appointment's id on the record. */
  appointmentId: string;
  via: BookingVia;
  /** Its start, as the event kept it, or null where the event did not say. */
  startsAt: string | null;
}

/** The slice of a delivered event the reading needs. */
interface EventLike {
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
  data: unknown;
}

/**
 * The booking an `appointment.changed` event says arrived, or null for every other event and every other change. The feed
 * adds visits ("added") and never confirms one; a booking tool's email adds ("added") or confirms a hold ("confirmed").
 */
export function bookingArriving(event: EventLike): ArrivingBooking | null {
  if (event.kind !== "appointment.changed" || event.subject_type !== "appointment" || !event.subject_id) return null;
  const data = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : null;
  if (!data) return null;
  const { change, source, starts_at: startsAt } = data as Record<string, unknown>;
  if (typeof change !== "string" || !ARRIVES.has(change)) return null;
  if (typeof source !== "string" || !ARRIVES_BY.has(source)) return null;
  if (source === "calendar_feed" && change !== "added") return null;
  return {
    appointmentId: event.subject_id,
    via: source as BookingVia,
    startsAt: typeof startsAt === "string" ? startsAt : null,
  };
}

/** A visit that arrived, as the record says it now. */
export interface BookedVisit {
  /** The appointment's id on the record. */
  id: string;
  /** ISO moments. */
  start: string;
  end: string;
  allDay: boolean;
  /** The zone the visit is kept in: its day is the business's, by this. */
  timezone: string;
  /** Who booked: the name the booking states, else the person the record links it to; null for nobody named, and for an erased person. */
  who: string | null;
  service: string | null;
  via: BookingVia;
}

const VIA_WORDS: Readonly<Record<BookingVia, string>> = {
  booking_email: "From your booking tool's email",
  booking_tool: "From your booking tool",
  calendar_feed: "From your calendar",
};

/** The day a visit is on, by its own zone: the key its address is written with. */
const visitDayOf = (v: BookedVisit): string => visitDateKey(v.start, v.timezone);

/** One booking as a line: who (or "Someone"), when, and what for. */
function bookedLineOf(v: BookedVisit, nowMs: number): string {
  const when = visitLine({ start: v.start, end: v.end, allDay: v.allDay }, v.timezone, nowMs);
  return [v.who ?? "Someone", when, v.service].filter(Boolean).join(" · ");
}

/**
 * The owner's notice of the visits that arrived: the earliest one's address opens, a line for each (three, then "and N
 * more"). One visit is told in its own words, who booked it and when; several, which only one read of the feed can bring
 * together, as a count. News, so a line on the bell and no mail, and nothing that waits on them. The platform's copy, for
 * a workspace nobody can be told in, says the fact and never a name.
 */
export function visitNews(visits: readonly BookedVisit[], nowMs: number): Omit<JobNews, "sourceEvent"> {
  const sorted = [...visits].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const first = sorted.at(0);
  if (!first) throw new Error("visitNews: nothing booked to tell");
  const route = visitRoute(first.id, visitDayOf(first));
  if (sorted.length === 1) {
    const when = visitLine({ start: first.start, end: first.end, allDay: first.allDay }, first.timezone, nowMs);
    return {
      kind: "booking",
      route,
      about: { type: "appointment", id: first.id },
      // Said without the workspace's word for an appointment, which core's subscriber does not read: a booking is the act.
      subject: (first.who ? `${first.who} booked with you` : "Someone booked with you").slice(0, 200),
      body: [when, ...(first.service ? [first.service] : []), "", VIA_WORDS[first.via]].join("\n"),
      redactedBody: "A booking arrived, and nobody could be told.",
    };
  }
  const named = sorted.slice(0, NAMED_IN_A_GROUP).map((v) => bookedLineOf(v, nowMs));
  const more = sorted.length - named.length;
  return {
    kind: "booking",
    route,
    about: null,
    subject: `${sorted.length} new bookings on your calendar`,
    body: [...named, ...(more > 0 ? [`and ${more} more`] : []), "", VIA_WORDS[first.via]].join("\n"),
    redactedBody: "New bookings arrived on a calendar, and nobody could be told.",
  };
}
