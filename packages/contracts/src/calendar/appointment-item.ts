/**
 * An appointment row as the board draws it (docs/plans/2026-10-07-bookings-arrive-by-email.md, step 4): the row a
 * booking notice became, beside the feed's events. The feed stays what it is; a row adds the visit the feed does not
 * carry, or says more about one it does (the client, the service, the staff). A visit both name is drawn once, from
 * the row, since the notice states what the event's title only hints at.
 *
 * Pure: the dashboard's week assembler (server/calendar/calendar-week.ts) hands the rows in and takes the items out.
 */
import type { CalendarItemDto, VisitMark } from "./calendar-dto";
import { APPOINTMENT_STATUSES, type AppointmentStatus } from "./feed-appointments";
import type { BusyBlock, FeedItem } from "./feed";
import { extractContacts, type OwnAddresses, type PersonLike, type PersonMatch } from "./calendar-people";
import { bookingToolName, SAME_VISIT_MS } from "./booking-notice";
import { shiftKey, zoneMidnight } from "./day-keys";

/** An appointment row as the board reads it: the columns a notice fills (packages/db appointments). */
export interface AppointmentLike {
  id: string;
  tool: string | null;
  status: string;
  /** ISO instants. */
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  title: string | null;
  service: string | null;
  staff: string | null;
  price: string | null;
  note: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  contact_id: string | null;
}

/** The words the block carries: the service and the client, as the notice gave them; the title the row kept; else this. */
const APPOINTMENT_UNTITLED = "Booked";

/** The block's title: "Balayage · Melissa J." as the notice said it; a kept title; else the one word. */
export function appointmentTitle(row: Pick<AppointmentLike, "title" | "service" | "client_name">): string {
  if (row.title?.trim()) return row.title.trim();
  const parts = [row.service, row.client_name].map((s) => s?.trim()).filter((s): s is string => !!s);
  return parts.length ? parts.join(" · ") : APPOINTMENT_UNTITLED;
}

/**
 * The record's rows as taken time, beside the feed's busy blocks: a booking that arrived by email took its slot even
 * where the tool writes no calendar. One rule for every reader that names an open time (the board, Ask, the prompt's
 * preview and the receptionist), so none offers a time another draws as taken. Subtracting only ever removes a time.
 */
export function busyOfAppointments(rows: ReadonlyArray<Pick<AppointmentLike, "starts_at" | "ends_at">>): BusyBlock[] {
  return rows.map((r) => ({ start: Date.parse(r.starts_at), end: Date.parse(r.ends_at) }));
}

/** The row with the feed's words, as the visits index reads an event: whose visit it is, and when. */
export function feedItemOfAppointment(row: AppointmentLike): FeedItem {
  return {
    start: Date.parse(row.starts_at),
    end: Date.parse(row.ends_at),
    title: appointmentTitle(row),
    allDay: row.all_day,
    uid: `appt:${row.id}`,
    description: row.note,
    location: null,
    // The client as a guest, so the one visits index (indexFeed) finds the row by their address as it finds an event.
    attendees: row.client_email ? [{ name: row.client_name, email: row.client_email }] : [],
    organizer: null,
  };
}

/** The person a row is for: by the contact the read linked, else by the number, else by the address. Never by name. */
export function personOfAppointment(row: AppointmentLike, people: PersonLike[]): PersonMatch | null {
  const found =
    (row.contact_id && people.find((p) => p.id === row.contact_id)) ||
    (row.client_phone && people.find((p) => p.phone === row.client_phone)) ||
    (row.client_email && people.find((p) => p.email === row.client_email));
  if (!found) return null;
  const via = found.phone && found.phone === row.client_phone ? "phone" : found.email ? "email" : "phone";
  return {
    id: found.id,
    name: found.name || row.client_name || "",
    via,
    ...(found.thread !== undefined ? { thread: found.thread, wa_inbound_at: found.waInboundAt ?? null } : {}),
  };
}

/** The row's id and status as the board carries them: null for a status the record does not hold. */
function visitMarkOf(row: Pick<AppointmentLike, "id" | "status">): VisitMark | null {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(row.status)
    ? { id: row.id, status: row.status as AppointmentStatus }
    : null;
}

/**
 * The feed's rows by their key, with how each stands: what a feed event the board draws finds its record's row by
 * (appointmentKeyOf), so a member's word on it is said there. Pure.
 */
export function feedMarksOf(
  rows: ReadonlyArray<{ id: string; status: string; external_id: string | null }>,
): Map<string, VisitMark> {
  const marks = new Map<string, VisitMark>();
  for (const r of rows) {
    const mark = visitMarkOf(r);
    if (mark && r.external_id) marks.set(r.external_id, mark);
  }
  return marks;
}

/** The board's row for an appointment: the item the day draws, with what the notice stated. */
export function itemOfAppointment(row: AppointmentLike, people: PersonLike[]): CalendarItemDto {
  return {
    id: `appt:${row.id}`,
    start: new Date(Date.parse(row.starts_at)).toISOString(),
    end: new Date(Date.parse(row.ends_at)).toISOString(),
    title: appointmentTitle(row),
    all_day: row.all_day,
    person: personOfAppointment(row, people),
    description: row.note,
    location: null,
    contacts: {
      phones: row.client_phone ? [row.client_phone] : [],
      emails: row.client_email ? [row.client_email] : [],
    },
    guess: row.client_name,
    source: "notice",
    tool: bookingToolName(row.tool),
    service: row.service,
    staff: row.staff,
    price: row.price,
    visit: visitMarkOf(row),
  };
}

/**
 * The feed's events with those a row already draws left out: an event is a row's visit when it carries the row's
 * client (the number or the address the row names, found in the event the way the panel finds them) and starts within
 * SAME_VISIT_MS of it. A tool that both emails and writes a calendar then shows each visit once, from the notice.
 */
export function withoutVisitsRowsDraw(items: FeedItem[], rows: AppointmentLike[], own: OwnAddresses): FeedItem[] {
  if (!rows.length) return items;
  const byPhone = new Map<string, number[]>();
  const byEmail = new Map<string, number[]>();
  for (const r of rows) {
    const at = Date.parse(r.starts_at);
    if (r.client_phone) byPhone.set(r.client_phone, [...(byPhone.get(r.client_phone) ?? []), at]);
    if (r.client_email) byEmail.set(r.client_email.toLowerCase(), [...(byEmail.get(r.client_email) ?? []), at]);
  }
  if (!byPhone.size && !byEmail.size) return items;
  const near = (starts: number[] | undefined, at: number) => !!starts?.some((s) => Math.abs(s - at) <= SAME_VISIT_MS);
  return items.filter((it) => {
    const c = extractContacts(it, own);
    const same =
      c.phones.some((p) => near(byPhone.get(p), it.start)) ||
      c.emails.some((e) => near(byEmail.get(e.toLowerCase()), it.start));
    return !same;
  });
}

/**
 * The days with the rows drawn into them: a row lands on every day of the span it touches, by the business's clock,
 * as a feed's event does (itemsToDays), and each day's items are kept in start order. Days are the span's own, so a
 * row outside it is not drawn. Nothing it is handed is changed.
 */
export function daysWithAppointments<D extends { key: string; items: CalendarItemDto[] }>(
  days: D[],
  rows: AppointmentLike[],
  tz: string,
  people: PersonLike[],
): D[] {
  if (!rows.length) return days;
  const items = rows.map((r) => ({
    at: { start: Date.parse(r.starts_at), end: Date.parse(r.ends_at) },
    item: itemOfAppointment(r, people),
  }));
  return days.map((d) => {
    const dayStart = zoneMidnight(tz, d.key);
    const dayEnd = zoneMidnight(tz, shiftKey(d.key, 1));
    const here = items.filter(({ at }) => at.end > dayStart && at.start < dayEnd).map(({ item }) => item);
    if (!here.length) return d;
    const merged = [...d.items, ...here].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return { ...d, items: merged };
  });
}
