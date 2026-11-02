/**
 * The appointments record (00345, decision 0002; docs/plans/2026-10-07-bookings-arrive-by-email.md): one visit as a
 * source stated it. Groups, top to bottom:
 *
 *   one visit           appointmentByKey (the row under a source's key), appointmentByClientStart (the live row a
 *                       source wrote for a client near an instant), insertAppointment, updateAppointment ("refused"
 *                       when the row's guard will not take the move: a finished visit cancelled).
 *   the board           appointmentsBetween (the live rows over a span the feed does not already draw), appointmentsForClient
 *                       (one person's, by their number or address, from an instant on), earlierVisitRows (one person's
 *                       from before a season, said or standing booked), visitsOver (a span's rows, and
 *                       the feed's by key, with what a member said of each).
 *   the pools           recordOver (a season's bookings and the feed's said rows, paged whole), feedWordsOver (the said
 *                       rows alone): what People, Reports, the playbooks and a caller's visits join to the feed.
 *   the feed            syncFeedAppointments (one read of the calendar feed kept through appointments_feed_sync, 00348),
 *                       appointmentStates (how the appointments a reminder batch was drawn for stand now, by key).
 *   an erasure's hand   appointmentsScrub (appointments_scrub: the person taken out of their visits and the notices).
 *   the person          contactIdByPhone, contactIdByEmail: the one row a number or an address names in People.
 *
 * Written by the booking_read job and the calendar sweep on the service role; read by the dashboard on the member's
 * client, where RLS decides, by the edge for a caller's own visits, and by a reminder's send. A failed read or write
 * throws, so the caller's retry meets it.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  APPOINTMENT_STATUSES,
  recordIdOf,
  recordKeyOf,
  type AppointmentState,
  type AppointmentStatus,
  type FeedAppointmentRow,
} from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";
import { readAllRows } from "../../paged";

type Db = SupabaseClient<Database>;
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
function clientFilter(client: { phone: string | null; email: string | null }): string | null {
  const parts = [
    client.phone ? `client_phone.eq.${client.phone}` : "",
    client.email ? `client_email.eq.${client.email}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(",") : null;
}

/* ------------------------------------------------------------------ one visit */

export async function appointmentByKey(
  db: Db,
  tenantId: string,
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
  if (error) throw new Error(`appointment_by_key: ${error.message}`);
  return data;
}

/**
 * The live row one source wrote for this client under one tool that starts within `withinMs` of `startMs`, the nearest
 * first. Null when the client is named by neither a number nor an address, or holds none there. A row is its source's
 * word: a booking tool's notice that missed its key finds its own visit by client and time, never a request the
 * receptionist took (decision 0061, the owner's to book) or another tool's visit, which it would otherwise move, rename
 * and book. Every row a notice writes names its tool (booking_read), so a row that names none is no notice's.
 */
export async function appointmentByClientStart(
  db: Db,
  tenantId: string,
  near: {
    source: AppointmentRow["source"];
    tool: string;
    client: { phone: string | null; email: string | null };
    startMs: number;
    withinMs: number;
  },
): Promise<AppointmentRow | null> {
  const { source, tool, client, startMs, withinMs } = near;
  const who = clientFilter(client);
  if (!who) return null;
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("source", source)
    .eq("tool", tool)
    .in("status", [...LIVE_STATUSES])
    .gte("starts_at", new Date(startMs - withinMs).toISOString())
    .lte("starts_at", new Date(startMs + withinMs).toISOString())
    .or(who)
    .order("starts_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(`appointment_by_client_start: ${error.message}`);
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
  if (error || !data)
    throw Object.assign(new Error(`appointment_insert: ${error?.message ?? "no row"}`), { code: error?.code ?? null });
  return { id: data.id };
}

/**
 * A row restated or moved. "refused" is the guard's word (appointments_guard raises check_violation): a visit that
 * happened, was missed or was already withdrawn is not moved by a later notice.
 */
export async function updateAppointment(
  db: Db,
  tenantId: string,
  id: string,
  patch: AppointmentUpdate,
): Promise<"updated" | "refused"> {
  const { error } = await db.from("appointments").update(patch).eq("tenant_id", tenantId).eq("id", id);
  if (!error) return "updated";
  if (error.code === "23514") return "refused";
  throw new Error(`appointment_update: ${error.message}`);
}

/* ------------------------------------------------------- a booking the receptionist asks for (00443) */

/** A booking the receptionist asks for (decision 0061), as booking_request_open takes it. */
export interface BookingRequestOpen {
  tenantId: string;
  conversationId: string;
  contactId: string;
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
  p: BookingRequestOpen,
): Promise<{ hold: "opened" | "changed" | "refreshed"; appointmentId: string } | { error: "too_soon" }> {
  const { data, error } = await db.rpc("booking_request_open", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_contact_id: p.contactId,
    p_starts_at: p.startsAt,
    p_ends_at: p.endsAt,
    p_service: p.service ?? "",
    p_timezone: p.timezone,
    p_words: p.words,
  });
  if (error) throw new Error(`booking_request_open: ${error.message}`);
  const said = (data ?? {}) as { error?: unknown; hold?: unknown; appointment?: { id?: unknown } };
  if (said.error === "too_soon") return { error: "too_soon" };
  const hold = said.hold;
  const id = said.appointment?.id;
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
  p: { appointmentId: string; booked: boolean; via: string | null; replyWords: string | null },
): Promise<{ data: Json | null; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("booking_request_answer", {
    p_appointment_id: p.appointmentId,
    p_booked: p.booked,
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.replyWords ? { p_reply_words: p.replyWords } : {}),
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
  if (error) throw new Error(`open_request_of_thread: ${error.message}`);
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
  tenantId: string,
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
  if (error) throw new Error(`open_requests_of_threads: ${error.message}`);
  return data ?? [];
}

/* ------------------------------------------------------------------ the board */

/**
 * The live rows over a span: those that end after `fromIso` and start before `toIso`, by start. The calendar feed's own
 * rows are left out: the board and the receptionist's openings read the feed itself, so a row kept from it would be the
 * same visit twice.
 */
export async function appointmentsBetween(
  db: Db,
  tenantId: string,
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
  if (error) throw new Error(`appointments_between: ${error.message}`);
  return data ?? [];
}

/**
 * The record over a span, as the board says what became of each visit (00397), in two reads, each read whole and in a
 * stable order (paged.ts: a select answers a thousand rows at most, silently, and a `.limit` only lowers that): a
 * booking's rows however they stand (a cancelled one is drawn struck, and leaves the feed's copy of it out), and the
 * feed's rows the feed still names, as their ids and statuses by key (the board draws the feed itself, which is why
 * appointmentsBetween leaves them out). It read each under one select's cap, so on a busy calendar's nine weeks the
 * marks past the thousandth row were dropped and their visits read as nobody's word.
 */
export async function visitsOver(
  db: Db,
  tenantId: string,
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
export async function visitOrigins(db: Db, tenantId: string, leadIds: readonly string[]): Promise<VisitOriginRow[]> {
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
  if (leads.error) throw new Error(`visit_origins_leads: ${leads.error.message}`);
  if (enrolled.error) throw new Error(`visit_origins_enrolled: ${enrolled.error.message}`);
  const newest = new Map<string, string>();
  for (const e of enrolled.data ?? []) if (e.lead_id && !newest.has(e.lead_id)) newest.set(e.lead_id, e.sequence_id);
  const sequenceIds = [...new Set(newest.values())];
  const named = new Map<string, string>();
  if (sequenceIds.length) {
    const seqs = await db.from("sequences").select("id, name").eq("tenant_id", tenantId).in("id", sequenceIds);
    if (seqs.error) throw new Error(`visit_origins_sequences: ${seqs.error.message}`);
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
export async function feedWordsOver(db: Db, tenantId: string, fromIso: string, toIso: string): Promise<FeedRowWord[]> {
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
  tenantId: string,
  fromIso: string,
  toIso: string,
): Promise<{ noted: AppointmentRow[]; feed: FeedRowWord[] }> {
  const [noted, feed] = await Promise.all([
    notedOver(db, tenantId, fromIso, toIso),
    feedWordsOver(db, tenantId, fromIso, toIso),
  ]);
  return { noted, feed };
}

/**
 * A booking's rows over a span, however they stand, read whole: every row that is not the feed's own (a booking's
 * notice, its tool, a person). What a pool joins to the feed (recordOver), and what the hourly sweep tells the feed's
 * copies of a booking by (contracts booking-notice.ts bookingCopyTest). A failure throws.
 */
export async function notedOver(db: Db, tenantId: string, fromIso: string, toIso: string): Promise<AppointmentRow[]> {
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

/**
 * The workspace a visit belongs to, as the caller may see it: on a member's session RLS decides, so one they cannot see
 * is null. What a route about one visit is scoped by.
 */
export async function appointmentWorkspace(db: Db, id: string): Promise<{ id: string; tenant_id: string } | null> {
  const { data, error } = await db.from("appointments").select("id, tenant_id").eq("id", id).maybeSingle();
  if (error) throw new Error(`appointment_workspace: ${error.message}`);
  return data ?? null;
}

/**
 * A member says what became of a visit (00397 mark_visit), on their own session: kept, missed or cancelled, with the
 * decision theirs in the same transaction. The door's answer as it gave it (a refusal is `{ error }`), and the
 * database's error for one it threw (not found, not signed in).
 */
export async function markVisit(
  db: Db,
  p: { appointmentId: string; status: "kept" | "missed" | "cancelled"; via: string | null; undoOf: string | null },
): Promise<{ data: Json | null; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("mark_visit", {
    p_appointment_id: p.appointmentId,
    p_status: p.status,
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.undoOf ? { p_undo_of: p.undoOf } : {}),
  });
  return { data, error };
}

/**
 * One person's rows, by their number or their address, that end after `fromIso`: their next visit, and the ones since,
 * however each stands, so the reader joins them to the feed as the pools do (contracts feedWithRecord): a cancelled one
 * leaves its copy in the feed out, a request is no visit yet. A booking's rows; the feed's own carry no client.
 */
export async function appointmentsForClient(
  db: Db,
  tenantId: string,
  who: { phone: string | null; email: string | null },
  fromIso: string,
): Promise<AppointmentRow[]> {
  const or = clientFilter(who);
  if (!or) return [];
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .neq("source", "calendar_feed")
    .gt("ends_at", fromIso)
    .or(or)
    .order("starts_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`appointments_for_client: ${error.message}`);
  return data ?? [];
}

/** A page of PostgREST's thousand and no more: past it a person's earlier visits are not counted, never half-counted. */
const EARLIER_ROWS_MAX = 1000;

/** One of a person's earlier visits: its id, how it stands, and when it began. */
export type EarlierVisitRow = Pick<AppointmentRow, "id" | "status" | "starts_at">;

/**
 * One person's visits that ended at or before `beforeIso` (the season's start, so none is the season's too): the ones a
 * member said they kept or missed, and the ones that stand booked with nobody having said (the cadence's guard). Found
 * by the person the record linked (contact_id: the hourly sync's match, a notice's; a merge moves it) or by the number
 * or address a booking carries. A feed row the calendar stopped naming is left out, as feedWordsOver leaves it. Newest
 * first. `capped`: more matched than EARLIER_ROWS_MAX, so the rows are a part and must not be counted from.
 */
export async function earlierVisitRows(
  db: Db,
  tenantId: string,
  who: { id: string; phone: string | null; email: string | null },
  beforeIso: string,
): Promise<{ rows: EarlierVisitRow[]; capped: boolean }> {
  const or = [`contact_id.eq.${who.id}`, clientFilter(who)].filter(Boolean).join(",");
  let capped = false;
  const rows = await readAllRows<EarlierVisitRow>(
    "appointments_earlier",
    (from, to) =>
      db
        .from("appointments")
        .select("id, status, starts_at")
        .eq("tenant_id", tenantId)
        .in("status", ["kept", "missed", "booked"])
        .is("vanished_at", null)
        .lte("ends_at", beforeIso)
        .or(or)
        .order("starts_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    EARLIER_ROWS_MAX,
    () => {
      capped = true;
    },
  );
  return { rows, capped };
}

/* ------------------------------------------------------------------ an erasure's hand */

/**
 * An erasure's hand in the appointments (appointments_scrub, 00345; decision 0036): the person's visits, by their id or
 * by any of their numbers and addresses, keep their time and service and lose the client's name, number, address and
 * note; the notices that made them, and any whose subject names them, lose the name. Answers how many visits changed.
 * Service role only. Throws when the database refuses, so the erasure's caller sees the leg did not run.
 */
export async function appointmentsScrub(
  db: Db,
  p: { tenantId: string; contactId: string; needles: readonly string[] },
): Promise<number> {
  const { data, error } = await db.rpc("appointments_scrub", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_needles: [...p.needles],
  });
  if (error) throw new Error(`appointments_scrub: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/* ------------------------------------------------------------------ the person */

/** The one person in People this number names: not erased, not merged into another. */
export async function contactIdByPhone(db: Db, tenantId: string, phone: string): Promise<string | null> {
  const { data, error } = await db
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phone)
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`contact_by_phone: ${error.message}`);
  return data?.id ?? null;
}

/** The one person in People this address names, matched and never made from an address alone (00125). */
export async function contactIdByEmail(db: Db, tenantId: string, email: string): Promise<string | null> {
  const { data, error } = await db
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`contact_by_email: ${error.message}`);
  return data?.id ?? null;
}

/* ------------------------------------------------------------------ the feed */

/**
 * What one read of the feed changed: rows added, moved, back after vanishing, vanished; how many it named; and whether it
 * was refused as older than the read the workspace last had (1, nothing changed).
 */
export interface AppointmentSync {
  added: number;
  moved: number;
  back: number;
  vanished: number;
  seen: number;
  stale: number;
  /** Reads that were the workspace's first kept (00419): the sweep stamps tenant_config.calendar_feed_kept_at for each. */
  first: number;
}

const count = (o: Record<string, unknown>, k: keyof AppointmentSync): number => (typeof o[k] === "number" ? o[k] : 0);

export async function syncFeedAppointments(
  db: Db,
  p: {
    tenantId: string;
    timezone: string;
    rows: readonly FeedAppointmentRow[];
    window: { from: Date; to: Date };
    now?: Date;
  },
): Promise<AppointmentSync> {
  const { data, error } = await db.rpc("appointments_feed_sync", {
    p_tenant_id: p.tenantId,
    p_timezone: p.timezone,
    p_rows: p.rows.map((r) => ({
      external_id: r.external_id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      all_day: r.all_day,
      service: r.service,
      consultation: r.consultation,
      contact_id: r.contact_id,
      series: r.series,
      twin: r.twin,
    })),
    p_from: p.window.from.toISOString(),
    p_to: p.window.to.toISOString(),
    p_now: (p.now ?? new Date()).toISOString(),
  });
  if (error) throw Object.assign(new Error(`appointments_feed_sync: ${error.message}`), { code: error.code });
  const o = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
  return {
    added: count(o, "added"),
    moved: count(o, "moved"),
    back: count(o, "back"),
    vanished: count(o, "vanished"),
    seen: count(o, "seen"),
    stale: o.stale === true ? 1 : 0,
    first: o.first === true ? 1 : 0,
  };
}

/** Keys one read names: a key is the calendar's UID and a start, and a UID may run to hundreds of characters. */
const KEYS_PER_READ = 25;

const isStatus = (s: string): s is AppointmentStatus => (APPOINTMENT_STATUSES as readonly string[]).includes(s);

export async function appointmentStates(
  db: Db,
  tenantId: string,
  keys: readonly string[],
): Promise<Map<string, AppointmentState>> {
  const out = new Map<string, AppointmentState>();
  const put = (key: string | null, r: { status: string } & Omit<AppointmentState, "status">) => {
    if (key && isStatus(r.status))
      out.set(key, { status: r.status, starts_at: r.starts_at, vanished_at: r.vanished_at, updated_at: r.updated_at });
  };
  // A booking's row goes by its id (contracts recordKeyOf), since a run draws its visits from the record too (0002's
  // readers): a notice's booking cancelled or said missed holds its reminder as a feed event's does.
  const ids = keys.flatMap((k) => recordIdOf(k) ?? []);
  const feedKeys = keys.filter((k) => recordIdOf(k) === null);
  // `.in()` puts every key in the URL, and a calendar's UID can be long: a few keys a read.
  for (let i = 0; i < feedKeys.length; i += KEYS_PER_READ) {
    const { data, error } = await db
      .from("appointments")
      .select("external_id, status, starts_at, vanished_at, updated_at")
      .eq("tenant_id", tenantId)
      .eq("source", "calendar_feed")
      .in("external_id", feedKeys.slice(i, i + KEYS_PER_READ));
    if (error && (error.code === "PGRST205" || error.code === "42P01")) return out;
    if (error) throw new Error(`appointments: ${error.message}`);
    for (const r of data ?? []) put(r.external_id, r);
  }
  for (let i = 0; i < ids.length; i += KEYS_PER_READ) {
    const { data, error } = await db
      .from("appointments")
      .select("id, status, starts_at, vanished_at, updated_at")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + KEYS_PER_READ));
    if (error) throw new Error(`appointments: ${error.message}`);
    for (const r of data ?? []) put(recordKeyOf(r.id), r);
  }
  return out;
}

/**
 * The booking door over one appointment of the record (00389 reach_out_booked_from), the service role's: the lead a
 * reach-out wrote to, whose address or number the appointment or its person carries, booked after an email left, is
 * stamped and converted once. How many leads moved. A failure throws.
 */
export async function reachOutBookedFrom(db: Db, tenantId: string, appointmentId: string): Promise<number> {
  const { data, error } = await db.rpc("reach_out_booked_from", {
    p_tenant_id: tenantId,
    p_appointment_id: appointmentId,
  });
  if (error) throw new Error(`reach_out_booked_from: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
