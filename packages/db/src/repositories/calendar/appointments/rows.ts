/** Appointments: rows. */

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../types";
import { readAllRows } from "../../../shared/paged";
import type { TenantId, ContactId } from "@chanlytics/contracts";
import { z } from "zod";
import { readAnswer } from "../../../shared/read-json";
import { DbFailure } from "@chanlytics/contracts";

/** What booking_request_open answers: a refusal, or the hold it opened and the appointment held. */
const BookingRequestOpened = z
  .object({
    error: z.string(),
    hold: z.enum(["opened", "changed", "refreshed"]),
    appointment: z.object({ id: z.string() }).partial(),
  })
  .partial();

export type Db = SupabaseClient<Database>;

export type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];

export type AppointmentInsert = Database["public"]["Tables"]["appointments"]["Insert"];

export type AppointmentUpdate = Database["public"]["Tables"]["appointments"]["Update"];

/** The statuses a visit may still move from: a hold, or a booking ahead. */
const LIVE_STATUSES = ["proposed", "booked"] as const;

/**
 * A row that still stands at the read's clock: a request the receptionist took stops taking its slot, and leaves the
 * board, once its expiry has passed (00443, decision 0061); every other row has none and always stands.
 */
const unexpired = (now = new Date()): string => `expires_at.is.null,expires_at.gt.${now.toISOString()}`;

/** The most rows a span's read carries: a salon's quarter, not a shared calendar's. */
const SPAN_MAX = 2000;

/** The PostgREST `or` that names a client by their number, their address, or both; null when they have neither. */
export function clientFilter(client: { phone: string | null; email: string | null }): string | null {
  const parts = [
    client.phone ? `client_phone.eq.${client.phone}` : "",
    client.email ? `client_email.eq.${client.email}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(",") : null;
}

/* ------------------------------------------------------------------ one visit */

export async function findAppointmentByKey(
  db: Db,
  tenantId: TenantId,
  source: AppointmentRow["source"],
  externalId: string,
): Promise<AppointmentRow | null> {
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "appointment_by_key");
  return data;
}

/**
 * The live row one source wrote for this client under one tool that starts within `withinMs` of `startMs`, the nearest
 * first. Null when the client is named by neither a number nor an address, or holds none there. A row is its source's
 * word: a booking tool's notice that missed its key finds its own visit by client and time, never a request the
 * receptionist took (decision 0061, the owner's to book) or another tool's visit, which it would otherwise move, rename
 * and book. Every row a notice writes names its tool (booking_read), so a row that names none is no notice's.
 */
export async function findAppointmentByClientStart(
  db: Db,
  tenantId: TenantId,
  near: {
    source: AppointmentRow["source"];
    tool: string;
    client: { phone: string | null; email: string | null };
    startMs: number;
    withinMs: number;
  },
): Promise<AppointmentRow | null> {
  const { source, tool, client, startMs, withinMs } = near;
  const otherClientFilter = clientFilter(client);
  if (!otherClientFilter) return null;
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("source", source)
    .eq("tool", tool)
    .in("status", [...LIVE_STATUSES])
    .gte("starts_at", new Date(startMs - withinMs).toISOString())
    .lte("starts_at", new Date(startMs + withinMs).toISOString())
    .or(otherClientFilter)
    .order("starts_at", { ascending: true })
    .limit(10);
  if (error) throw new DbFailure(error, "appointment_by_client_start");
  const rows = data ?? [];
  rows.sort((a, b) => Math.abs(Date.parse(a.starts_at) - startMs) - Math.abs(Date.parse(b.starts_at) - startMs));
  return rows[0] ?? null;
}

/**
 * A visit written. A failure throws with the database's own code on it (`code`): 23514 is a row one of the table's
 * checks refuses, which no second try will write, where anything else may be a bad minute.
 */
export async function insertAppointment(db: Db, row: AppointmentInsert): Promise<{ id: string }> {
  const { data, error } = await db.from("appointments").insert(row).select("id").single();
  if (error || !data) throw new DbFailure(error ?? { message: "no row" }, "appointment_insert");
  return { id: data.id };
}

/**
 * A row restated or moved. "refused" is the guard's word (appointments_guard raises check_violation): a visit that
 * happened, was missed or was already withdrawn is not moved by a later notice.
 */
export async function updateAppointment(
  db: Db,
  tenantId: TenantId,
  id: string,
  patch: AppointmentUpdate,
): Promise<"updated" | "refused"> {
  const { error } = await db.from("appointments").update(patch).eq("tenant_id", tenantId).eq("id", id);
  if (!error) return "updated";
  if (error.code === "23514") return "refused";
  throw new DbFailure(error, "appointment_update");
}

/* ------------------------------------------------------- a booking the receptionist asks for (00443) */

/** A booking the receptionist asks for (decision 0061), as booking_request_open takes it. */
export interface BookingRequestOpen {
  tenantId: TenantId;
  conversationId: string;
  contactId: ContactId;
  startsAt: string;
  endsAt: string;
  service: string | null;
  timezone: string;
  /** The hold's line (contracts BOOKING_REQUEST_WORDS.hold). */
  words: string;
}

/**
 * A request and its thread's hold, opened together (00443 booking_request_open, the service role's), the person's open
 * request before it cancelled: how the hold landed, as escalation_open answers it, or `too_soon` for a slot an hour
 * away or less. A failure throws, and then nothing moved.
 */
export async function openBookingRequest(
  db: Db,
  bookingRequestOpen: BookingRequestOpen,
): Promise<{ hold: "opened" | "changed" | "refreshed"; appointmentId: string } | { error: "too_soon" }> {
  const { data, error } = await db.rpc("booking_request_open", {
    p_tenant_id: bookingRequestOpen.tenantId,
    p_conversation_id: bookingRequestOpen.conversationId,
    p_contact_id: bookingRequestOpen.contactId,
    p_starts_at: bookingRequestOpen.startsAt,
    p_ends_at: bookingRequestOpen.endsAt,
    p_service: bookingRequestOpen.service ?? "",
    p_timezone: bookingRequestOpen.timezone,
    p_words: bookingRequestOpen.words,
  });
  if (error) throw new DbFailure(error, "booking_request_open");
  const answer = readAnswer("booking_request_open", BookingRequestOpened, data ?? {});
  if (answer.error === "too_soon") return { error: "too_soon" };
  const hold = answer.hold;
  const id = answer.appointment?.id;
  if ((hold !== "opened" && hold !== "changed" && hold !== "refreshed") || typeof id !== "string")
    throw new Error(`booking_request_open: the door answered ${JSON.stringify(data)}`);
  return { hold, appointmentId: id };
}

/**
 * A member answers a booking the receptionist asked for (00443 booking_request_answer), on their own session: booked,
 * which resolves its hold, or not, which cancels it and leaves the thread waiting on a reply (`replyWords` its line).
 * The door's answer as it gave it (a refusal is `{ error }`: not_a_request, answered), and the database's error for one
 * it threw (not found, not signed in).
 */
export async function answerBookingRequest(
  db: Db,
  params: { appointmentId: string; booked: boolean; via: string | null; replyWords: string | null },
): Promise<{ data: Json | null; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("booking_request_answer", {
    p_appointment_id: params.appointmentId,
    p_booked: params.booked,
    ...(params.via ? { p_via: params.via } : {}),
    ...(params.replyWords ? { p_reply_words: params.replyWords } : {}),
  });
  return { data, error };
}

/**
 * The request the receptionist took in a thread that nobody has answered (00443, decision 0061), as the caller may see
 * it: what a member's Booked it or Can't answers, on Today, in the Inbox and on the Calendar alike. Null for none.
 */
export async function openRequestOfThread(db: Db, conversationId: string): Promise<AppointmentRow | null> {
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("source", "receptionist")
    .eq("status", "proposed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "open_request_of_thread");
  return data ?? null;
}

/** A request the receptionist took, as a thread's hold says its time (the Inbox's request card). */
export type OpenRequestRow = Pick<
  AppointmentRow,
  "id" | "conversation_id" | "starts_at" | "ends_at" | "service" | "expires_at" | "created_at"
>;

/**
 * The requests nobody has answered in these threads (00443, decision 0061), as the caller may see them: what the Inbox's
 * hold draws its time from beside Booked it and Can't. Newest first, so a thread's first is its own.
 */
export async function openRequestsOfThreads(
  db: Db,
  tenantId: TenantId,
  conversationIds: readonly string[],
): Promise<OpenRequestRow[]> {
  if (!conversationIds.length) return [];
  const { data, error } = await db
    .from("appointments")
    .select("id, conversation_id, starts_at, ends_at, service, expires_at, created_at")
    .eq("tenant_id", tenantId)
    .in("conversation_id", [...conversationIds])
    .eq("source", "receptionist")
    .eq("status", "proposed")
    .order("created_at", { ascending: false });
  if (error) throw new DbFailure(error, "open_requests_of_threads");
  return data ?? [];
}

/* ------------------------------------------------------------------ the board */

/**
 * The live rows over a span: those that end after `fromIso` and start before `toIso`, by start. The calendar feed's own
 * rows are left out: the board and the receptionist's openings read the feed itself, so a row kept from it would be the
 * same visit twice.
 */
export async function listAppointmentsBetween(
  db: Db,
  tenantId: TenantId,
  fromIso: string,
  toIso: string,
): Promise<AppointmentRow[]> {
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", [...LIVE_STATUSES])
    .neq("source", "calendar_feed")
    .or(unexpired())
    .gt("ends_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(SPAN_MAX);
  if (error) throw new DbFailure(error, "appointments_between");
  return data ?? [];
}

/**
 * The record over a span, as the board says what became of each visit (00397), in two reads, each read whole and in a
 * stable order (paged.ts: a select answers a thousand rows at most, silently, and a `.limit` only lowers that): a
 * booking's rows however they stand (a cancelled one is drawn struck, and leaves the feed's copy of it out), and the
 * feed's rows the feed still names, as their ids and statuses by key (the board draws the feed itself, which is why
 * listAppointmentsBetween leaves them out). It read each under one select's cap, so on a busy calendar's nine weeks the
 * marks past the thousandth row were dropped and their visits read as nobody's word.
 */
export async function findVisitsOver(
  db: Db,
  tenantId: TenantId,
  fromIso: string,
  toIso: string,
): Promise<{
  noted: AppointmentRow[];
  feed: Array<{ id: string; status: string; external_id: string | null; starts_at: string; lead_id: string | null }>;
}> {
  const [noted, feed] = await Promise.all([
    readAllRows<AppointmentRow>("visits_over_noted", (from, to) =>
      db
        .from("appointments")
        .select("*")
        .eq("tenant_id", tenantId)
        .neq("source", "calendar_feed")
        .or(unexpired())
        .gt("ends_at", fromIso)
        .lt("starts_at", toIso)
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAllRows<FeedRowWord & Pick<AppointmentRow, "lead_id">>("visits_over_feed", (from, to) =>
      db
        .from("appointments")
        .select("id, status, external_id, starts_at, lead_id")
        .eq("tenant_id", tenantId)
        .eq("source", "calendar_feed")
        .is("vanished_at", null)
        .gt("ends_at", fromIso)
        .lt("starts_at", toIso)
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  return { noted, feed };
}

/** A visit's person found as a lead (00426): the lead by its business's name, and the sequence that took it in last. */
export interface VisitOriginRow {
  lead_id: string;
  lead_name: string;
  sequence_id: string | null;
  sequence_name: string | null;
}

/**
 * Where the people of a board's visits came from (00426: a visit names the lead its person was found as): each lead
 * that still stands (not erased, not blanked), by its business's name, with the sequence whose enrollment of it is the
 * newest, or none. Three reads, the second beside the first, for the leads named alone. Throws with its read's name.
 */
export async function listVisitOrigins(
  db: Db,
  tenantId: TenantId,
  leadIds: readonly string[],
): Promise<VisitOriginRow[]> {
  const ids = [...new Set(leadIds)];
  if (!ids.length) return [];
  const [leads, enrolled] = await Promise.all([
    db
      .from("leads")
      .select("id, business_name")
      .eq("tenant_id", tenantId)
      .in("id", ids)
      .is("erased_at", null)
      .is("blanked_at", null),
    db
      .from("sequence_enrollments")
      .select("lead_id, sequence_id, entered_at")
      .eq("tenant_id", tenantId)
      .in("lead_id", ids)
      .order("entered_at", { ascending: false }),
  ]);
  if (leads.error) throw new DbFailure(leads.error, "visit_origins_leads");
  if (enrolled.error) throw new DbFailure(enrolled.error, "visit_origins_enrolled");
  const newest = new Map<string, string>();
  for (const e of enrolled.data ?? []) if (e.lead_id && !newest.has(e.lead_id)) newest.set(e.lead_id, e.sequence_id);
  const sequenceIds = [...new Set(newest.values())];
  const named = new Map<string, string>();
  if (sequenceIds.length) {
    const seqs = await db.from("sequences").select("id, name").eq("tenant_id", tenantId).in("id", sequenceIds);
    if (seqs.error) throw new DbFailure(seqs.error, "visit_origins_sequences");
    for (const q of seqs.data ?? []) named.set(q.id, q.name);
  }
  return (leads.data ?? [])
    .filter((l) => l.business_name.trim())
    .map((l) => {
      const sequence = newest.get(l.id) ?? null;
      const name = sequence ? (named.get(sequence) ?? null) : null;
      return {
        lead_id: l.id,
        lead_name: l.business_name.trim(),
        sequence_id: name ? sequence : null,
        sequence_name: name,
      };
    });
}

/** The words a member says of a feed's visit (00397): what a reader lays on its event. A booked row says nothing. */
const SAID_STATUSES = ["kept", "missed", "cancelled"] as const;

/** A feed row as a reader lays it on its event: its id, its word, its key, and the start the word was said of. */
type FeedRowWord = Pick<AppointmentRow, "id" | "status" | "external_id" | "starts_at">;

/**
 * The feed's rows over a span a member said a word of and the calendar still names, read whole: a select answers a
 * thousand rows at most (paged.ts), and a season of a busy calendar is more. What a reader of the feed lays on it.
 */
export async function listFeedWordsOver(
  db: Db,
  tenantId: TenantId,
  fromIso: string,
  toIso: string,
): Promise<FeedRowWord[]> {
  return readAllRows<FeedRowWord>("appointments_feed_words", (from, to) =>
    db
      .from("appointments")
      .select("id, status, external_id, starts_at")
      .eq("tenant_id", tenantId)
      .eq("source", "calendar_feed")
      .is("vanished_at", null)
      .in("status", [...SAID_STATUSES])
      .gt("ends_at", fromIso)
      .lt("starts_at", toIso)
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/**
 * The record over a feed's season, as a pool joins it to the feed (contracts feedWithRecord; 0002's readers): a
 * booking's rows however they stand, and the feed's rows a member said a word of. Each read whole, past the thousand
 * rows one select answers, so the furthest bookings of a busy season are never the ones dropped. A failure throws.
 */
export async function recordOver(
  db: Db,
  tenantId: TenantId,
  fromIso: string,
  toIso: string,
): Promise<{ noted: AppointmentRow[]; feed: FeedRowWord[] }> {
  const [noted, feed] = await Promise.all([
    listNotedOver(db, tenantId, fromIso, toIso),
    listFeedWordsOver(db, tenantId, fromIso, toIso),
  ]);
  return { noted, feed };
}

/**
 * A booking's rows over a span, however they stand, read whole: every row that is not the feed's own (a booking's
 * notice, its tool, a person). What a pool joins to the feed (recordOver), and what the hourly sweep tells the feed's
 * copies of a booking by (contracts booking-notice.ts bookingCopyTest). A failure throws.
 */
export async function listNotedOver(
  db: Db,
  tenantId: TenantId,
  fromIso: string,
  toIso: string,
): Promise<AppointmentRow[]> {
  return readAllRows<AppointmentRow>("appointments_noted", (from, to) =>
    db
      .from("appointments")
      .select("*")
      .eq("tenant_id", tenantId)
      .neq("source", "calendar_feed")
      .or(unexpired())
      .gt("ends_at", fromIso)
      .lt("starts_at", toIso)
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}
