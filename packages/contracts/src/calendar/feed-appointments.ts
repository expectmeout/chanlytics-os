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
import { appointmentKeyOf } from "./appointment-key";
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
 * and whether it is a consultation (0004's one predicate, isConsultationTitle), decided once when the row is written. The
 * title itself is read and left (FeedAppointmentRow).
 */
export function feedAppointmentRows(
  items: readonly FeedItem[],
  o: {
    people: PersonLike[];
    own: OwnAddresses;
    services: readonly { name: string }[] | undefined;
    rules: ConsultRules | null | undefined;
    window: { from: number; to: number };
  },
): FeedAppointmentRow[] {
  const out = new Map<string, FeedAppointmentRow>();
  for (const it of items) {
    if (it.start < o.window.from || it.start > o.window.to) continue;
    const key = appointmentKeyOf(it);
    if (key.length > APPOINTMENT_KEY_MAX || out.has(key)) continue;
    const title = it.title.trim() || null;
    out.set(key, {
      external_id: key,
      starts_at: new Date(it.start).toISOString(),
      ends_at: new Date(it.end).toISOString(),
      all_day: it.allDay,
      service: serviceNamedIn(title, o.services),
      consultation: isConsultationTitle(title, o.services, o.rules),
      contact_id: matchPerson(it, o.people, o.own)?.id ?? null,
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
