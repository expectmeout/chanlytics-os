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
import { visitStands } from "./calendar-words";
import { replyFactsOf, type MatchVia, type OwnAddresses, type PersonLike, type PersonMatch } from "./calendar-people";
import { bookingCopyTest, bookingToolName } from "./booking-notice";
import { appointmentKeyOf, recordKeyOf } from "./appointment-key";
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
  /** Where the row came from (00345, 00443); a request the receptionist took is 'receptionist'. Absent on an older read. */
  source?: string | null;
  /** The thread a request the receptionist took came from (00443): where it is answered. */
  conversation_id?: string | null;
  /** The lead its person was made from (00426). Absent on an older read. */
  lead_id?: string | null;
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
    uid: recordKeyOf(row.id),
    // The client's number where an event carries one, and their address as a guest, so the one visits index
    // (indexFeed) finds the row by either as it finds an event: a notice that gave a number alone is still theirs.
    description: [row.note, row.client_phone].filter(Boolean).join("\n") || null,
    location: null,
    attendees: row.client_email ? [{ name: row.client_name, email: row.client_email }] : [],
    organizer: null,
    recordId: row.id,
  };
}

/**
 * The person a row is for: by the contact the read linked (said as the booking's own link, `record`), else by the number,
 * else by the address. Never by name. How it was found is how it is said: a row linked by its contact said "matched by
 * email" of a person nothing on the board had matched.
 */
export function personOfAppointment(row: AppointmentLike, people: PersonLike[]): PersonMatch | null {
  const linked = row.contact_id ? people.find((p) => p.id === row.contact_id) : undefined;
  const byPhone = !linked && row.client_phone ? people.find((p) => p.phone === row.client_phone) : undefined;
  const byEmail =
    !linked && !byPhone && row.client_email ? people.find((p) => p.email === row.client_email) : undefined;
  const found = linked ?? byPhone ?? byEmail;
  if (!found) return null;
  const via: MatchVia = linked ? "record" : byPhone ? "phone" : "email";
  return {
    id: found.id,
    name: found.name || row.client_name || "",
    via,
    ...(found.thread !== undefined ? { thread: found.thread, wa_inbound_at: found.waInboundAt ?? null } : {}),
    ...replyFactsOf(found),
  };
}

/**
 * The row's id and status as the board carries them, and the lead its person was made from where there is one: null for
 * a status the record does not hold.
 */
function visitMarkOf(row: Pick<AppointmentLike, "id" | "status" | "lead_id">): VisitMark | null {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(row.status)
    ? { id: row.id, status: row.status as AppointmentStatus, ...(row.lead_id ? { lead_id: row.lead_id } : {}) }
    : null;
}

/** A feed row's word, with the start the row holds: the event's start when the word was said. */
export interface FeedMark extends VisitMark {
  start: number;
}

/**
 * The feed's rows by their key, with how each stands and when: what a feed event the board draws finds its record's
 * row by (appointmentKeyOf), so a member's word on it is said there. Pure.
 */
export function feedMarksOf(
  rows: ReadonlyArray<{
    id: string;
    status: string;
    external_id: string | null;
    starts_at: string;
    lead_id?: string | null;
  }>,
): Map<string, FeedMark> {
  const marks = new Map<string, FeedMark>();
  for (const r of rows) {
    const mark = visitMarkOf(r);
    if (mark && r.external_id) marks.set(r.external_id, { ...mark, start: Date.parse(r.starts_at) });
  }
  return marks;
}

/**
 * An event's row and its word, while the event stands where its row does. An event moved on the calendar since the
 * hourly sync last read it (00397 sets a said row aside and keeps a fresh one at the new time) carries no word, and no
 * row a member's word could go on, until the sync has: "missed" said of the 10th is not said of the 17th it moved to.
 */
export function markOn(
  marks: ReadonlyMap<string, FeedMark> | null | undefined,
  it: Pick<FeedItem, "uid" | "start" | "occurrence">,
): VisitMark | null {
  const m = marks?.get(appointmentKeyOf(it));
  return m && m.start === it.start
    ? { id: m.id, status: m.status, ...(m.lead_id ? { lead_id: m.lead_id } : {}) }
    : null;
}

/**
 * The record a reader joins to the feed (decision 0002, its readers): the rows that are not the feed's own, a booking's
 * from its notice, however they stand, and each feed row's word by its key (feedMarksOf).
 */
export interface PoolRecord {
  noted: readonly AppointmentLike[];
  marks: ReadonlyMap<string, FeedMark>;
}

/**
 * The feed with the record joined (0002's readers: People, Reports and the playbooks read them together): a visit a
 * notice states is the notice's (the feed's copy of it left out, withoutVisitsRowsDraw, as the board draws it once), a
 * booking that stands or was said kept or missed joins as an item (feedItemOfAppointment), a request is no visit yet,
 * and a cancelled visit is none, whoever cancelled it. Each item carries a member's kept or missed (FeedItem.said). The
 * feed's words stay the feed's: a feed event is the event, its row's word laid on it. Pure; by start.
 */
export function feedWithRecord(
  items: readonly FeedItem[],
  record: PoolRecord | null | undefined,
  own: OwnAddresses,
): FeedItem[] {
  if (!record) return [...items];
  const out: FeedItem[] = [];
  for (const it of withoutVisitsRowsDraw([...items], [...record.noted], own)) {
    const mark = markOn(record.marks, it);
    // One rule for a cancelled visit (visitStands): it is none, whoever cancelled it.
    if (!visitStands(mark)) continue;
    const said = mark?.status;
    const withRow = mark ? { recordId: mark.id } : {};
    out.push(said === "kept" || said === "missed" ? { ...it, ...withRow, said } : { ...it, ...withRow });
  }
  for (const r of record.noted) {
    if (r.status !== "booked" && r.status !== "kept" && r.status !== "missed") continue;
    const it = feedItemOfAppointment(r);
    out.push(r.status === "booked" ? it : { ...it, said: r.status });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The board's row for an appointment: the item the day draws, with what the notice stated. */
export function itemOfAppointment(row: AppointmentLike, people: PersonLike[]): CalendarItemDto {
  return {
    id: recordKeyOf(row.id),
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
    // A time a customer picked by text: answered in its thread, Booked it or Can't, while it is open (decision 0061).
    ...(row.source === "receptionist" && row.conversation_id
      ? { request: { thread_id: row.conversation_id, open: row.status === "proposed" } }
      : {}),
  };
}

/**
 * The feed's events with those a row already draws left out: an event is a row's visit when it carries the row's
 * client (the number or the address the row names, found in the event the way the panel finds them) and starts within
 * SAME_VISIT_MS of it (booking-notice.ts bookingCopyTest, the one rule). A tool that both emails and writes a calendar then shows each visit
 * once, from the notice.
 */
export function withoutVisitsRowsDraw(items: FeedItem[], rows: AppointmentLike[], own: OwnAddresses): FeedItem[] {
  const copy = bookingCopyTest(rows, own);
  return copy ? items.filter((it) => !copy(it)) : items;
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
