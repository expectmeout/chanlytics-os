/**
 * The calendar feed kept on the appointments record (decision 0002; the record is 00345's, a booking notice its first
 * source): what the hourly sweep keeps of each event on the owner's calendar, and what a reminder asks again when it
 * goes. The product never makes one on its own initiative: the calendar feed, a booking tool's notice or its webhook,
 * and a person are its only sources, and the receptionist is none of them.
 *
 * Pure: the rows a feed's events become (feedAppointmentRows), and whether the appointment a send was drawn for still
 * stands (appointmentHolds). The sync door is 00348's; the sweep that writes through it is the edge's
 * (apps/edge/lib/calendar/calendar-appointments.ts).
 */
import type { FeedItem } from "./feed";
import { serviceNamedIn, type ConsultRules } from "./service-offer";
import { matchPerson, type OwnAddresses, type PersonLike } from "./calendar-people";
import { bookingCopyTest, type BookingSighting } from "./booking-notice";
import { appointmentKeyOf, recordIdOf } from "./appointment-key";
import { isConsultationTitle } from "../deals/deal-consultations";

/** Who wrote the row: the hourly read of the feed, a booking tool's notice or its webhook, or a person. Never the receptionist. */
export const APPOINTMENT_SOURCES = ["calendar_feed", "booking_email", "booking_tool", "person"] as const;
export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number];

/**
 * Where it stands. A feed says only booked; kept, missed and cancelled are a person's or a booking tool's word (decision
 * 0002 step 8 adds the sweep that infers kept from time, with the routes that let a person say missed). The guard (00345)
 * holds the moves: proposed to booked or cancelled, booked to kept, missed or cancelled, the last three final.
 */
export const APPOINTMENT_STATUSES = ["proposed", "booked", "kept", "missed", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * What a send asks of the row again: how it stands, when it starts, whether the feed still names it, and when the row
 * last changed, which says whether the row or the run read the calendar later.
 */
export interface AppointmentState {
  status: AppointmentStatus;
  starts_at: string;
  vanished_at: string | null;
  updated_at: string;
}

/**
 * One event of the feed as the sync door takes it (appointments_feed_sync). Never its title: the owner's words about a
 * visit name the person, the board reads them from the feed itself, and a title kept here would come back on the next
 * read after an erasure took it (appointments_scrub), linked to nobody the scrub could find.
 */
export interface FeedAppointmentRow {
  external_id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  service: string | null;
  consultation: boolean;
  contact_id: string | null;
  /**
   * One occurrence of a repeating event (FeedItem.occurrence): the next of a series coming into the window as the days
   * pass is no booking, and the bell says nothing of it (contracts visit-news.ts bookingArriving).
   */
  series: boolean;
  /**
   * The calendar's copy of a booking the record already holds from its tool's email or its tool (booking-notice.ts bookingCopyTest): the
   * visit was told when the booking arrived, and its copy is not told again.
   */
  twin: boolean;
}

/**
 * The longest key the record keeps (characters). A calendar's UID has no limit, the record's unique index has one, and a
 * key cut short would never be found again under the key a reminder carries: an event keyed longer is not kept, and its
 * reminder goes as it would for one the sync has not written.
 */
const APPOINTMENT_KEY_MAX = 512;

/**
 * The rows a feed's events become, inside the window the sync covers: each keyed as appointment-key.ts keys it (the
 * first of two events under one key wins; one keyed past APPOINTMENT_KEY_MAX is left out), the person it is for by the match the board makes (calendar-people.ts
 * matchPerson: a number in the event, then an address, then a whole name), the service its title names (serviceNamedIn),
 * and whether it is a consultation (0004's one predicate, isConsultationTitle), decided once when the row is written; and
 * what the bell asks of an addition (00419): whether it is one occurrence of a repeating event, and whether it is the copy
 * of one of `bookings`, the workspace's rows that are not the feed's (booking-notice.ts bookingCopyTest). The title itself is read and left
 * (FeedAppointmentRow).
 */
export function feedAppointmentRows(
  items: readonly FeedItem[],
  o: {
    people: PersonLike[];
    own: OwnAddresses;
    services: readonly { name: string }[] | undefined;
    rules: ConsultRules | null | undefined;
    window: { from: number; to: number };
    bookings?: readonly BookingSighting[];
  },
): FeedAppointmentRow[] {
  const out = new Map<string, FeedAppointmentRow>();
  const copy = bookingCopyTest(o.bookings ?? [], o.own);
  for (const it of items) {
    if (it.start < o.window.from || it.start > o.window.to) continue;
    const key = appointmentKeyOf(it);
    if (key.length > APPOINTMENT_KEY_MAX || out.has(key)) continue;
    const title = it.title.trim() || null;
    const contactId = matchPerson(it, o.people, o.own)?.id ?? null;
    out.set(key, {
      external_id: key,
      starts_at: new Date(it.start).toISOString(),
      ends_at: new Date(it.end).toISOString(),
      all_day: it.allDay,
      service: serviceNamedIn(title, o.services),
      consultation: isConsultationTitle(title, o.services, o.rules),
      contact_id: contactId,
      series: it.occurrence !== undefined,
      twin: copy ? copy(it, contactId) : false,
    });
  }
  return [...out.values()];
}

/** A person's or a booking tool's word that the appointment will not happen: a reminder never goes for it. */
const OFF: ReadonlySet<AppointmentStatus> = new Set(["missed", "cancelled"]);

/**
 * Whether the appointment a recipient's words were drawn for still stands as it was drawn (decision 0002): kept on their
 * row as `appointment` (its key), `visit_start`, and `appointment_read_at` (when the run read the calendar), and asked at
 * the send against the row the hourly sync keeps.
 *
 * The row is the later word only where it changed after the run read the calendar: a row the sync wrote before the run
 * is older than what the run saw, and an appointment moved, or put back on the calendar, between the sync and the run
 * goes as the run drew it. So one cancelled or marked missed is held whenever that was said; one the feed stopped naming,
 * or that starts at another time, is held when the row says so from a read after the run's. A recipient drawn with no
 * key (a run made before the record), or whose appointment the sync has not written, goes as before; one drawn with no
 * read time is held only for a cancellation or a missed visit.
 */
export function appointmentHolds(rows: ReadonlyMap<string, AppointmentState>, facts: Record<string, unknown>): boolean {
  const key = typeof facts.appointment === "string" ? facts.appointment : null;
  const start = typeof facts.visit_start === "string" ? Date.parse(facts.visit_start) : NaN;
  const row = key ? rows.get(key) : undefined;
  if (!row || !Number.isFinite(start)) return true;
  if (OFF.has(row.status)) return false;
  const read = typeof facts.appointment_read_at === "string" ? Date.parse(facts.appointment_read_at) : NaN;
  if (!Number.isFinite(read)) return true;
  if (row.vanished_at !== null && Date.parse(row.vanished_at) > read) return false;
  return Date.parse(row.starts_at) === start || !(Date.parse(row.updated_at) > read);
}

/**
 * What the owner's calendar feed names NOW (the edge's feed, kept five minutes), asked by a send beside the record: the
 * record is only as new as the hourly sweep, so a visit cancelled in the owner's calendar and nowhere else is still
 * `booked` on it until the sweep marks it vanished, and a reminder that goes within that hour would still go. The feed
 * drops a cancelled event at once (the parser skips STATUS:CANCELLED), so a key it no longer names is a visit that is gone.
 */
export interface FeedNames {
  /** The keys of the events the feed names, as the record keeps them (appointmentKeyOf). */
  keys: ReadonlySet<string>;
  /** The span the feed was read over (seasonHorizon), in epoch ms: an event outside it is not named because it is not looked for. */
  from: number;
  to: number;
}

/** The names a feed's items carry, over the span they were read for. */
export function feedNamesOf(
  items: readonly Pick<FeedItem, "uid" | "start" | "occurrence">[],
  span: { from: number; to: number },
): FeedNames {
  return { keys: new Set(items.map(appointmentKeyOf)), from: span.from, to: span.to };
}

/**
 * The calendar event a recipient's words were drawn for, by the key kept on their row, when the feed can say whether it is
 * still there: a visit with its start, whose key is a calendar event's. A booking from the record (recordKeyOf) is no
 * event of the feed and has none.
 */
function feedKeyOf(facts: Record<string, unknown>): string | null {
  const key = typeof facts.appointment === "string" && facts.appointment ? facts.appointment : null;
  const start = typeof facts.visit_start === "string" ? Date.parse(facts.visit_start) : NaN;
  return key && recordIdOf(key) === null && Number.isFinite(start) ? key : null;
}

/** Whether the send must ask the feed about this recipient: a reminder drawn for a calendar event. */
export function asksTheFeed(facts: Record<string, unknown>): boolean {
  return feedKeyOf(facts) !== null;
}

/**
 * Whether the calendar feed still names the visit a recipient's words were drawn for (S1-05, decision 0002 beside
 * appointmentHolds): false only for a calendar event the feed, read now over a span that holds the visit, no longer
 * names. A recipient drawn for no calendar event (a run made before the record, a booking from the record), or for a visit
 * outside the span the feed was read over, goes on what the record says.
 */
export function feedStillNames(feed: FeedNames, facts: Record<string, unknown>): boolean {
  const key = feedKeyOf(facts);
  if (key === null) return true;
  const start = Date.parse(String(facts.visit_start));
  if (start < feed.from || start > feed.to) return true;
  return feed.keys.has(key);
}

/** The keys a batch's recipients were drawn for: what the send reads the rows of, once. */
export function appointmentKeysOf(rows: readonly { facts: unknown }[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    const f = r.facts;
    if (f && typeof f === "object" && !Array.isArray(f)) {
      const k = (f as Record<string, unknown>).appointment;
      if (typeof k === "string" && k) keys.add(k);
    }
  }
  return [...keys];
}
