/**
 * The appointments record (00345, decision 0002; docs/plans/2026-10-07-bookings-arrive-by-email.md): one visit as a
 * source stated it. Groups, top to bottom:
 *
 *   one visit           appointmentByKey (the row under a source's key), appointmentByClientStart (the live row a
 *                       client holds near an instant), insertAppointment, updateAppointment ("refused" when the row's
 *                       guard will not take the move: a finished visit cancelled).
 *   the board           appointmentsBetween (the live rows over a span the feed does not already draw), appointmentsForClient
 *                       (one person's, by their number or address, from an instant on).
 *   the feed            syncFeedAppointments (one read of the calendar feed kept through appointments_feed_sync, 00348),
 *                       appointmentStates (how the appointments a reminder batch was drawn for stand now, by key).
 *   an erasure's hand   appointmentsScrub (appointments_scrub: the person taken out of their visits and the notices).
 *   the person          contactIdByPhone, contactIdByEmail: the one row a number or an address names in People.
 *
 * Written by the booking_read job and the calendar sweep on the service role; read by the dashboard on the member's
 * client, where RLS decides, by the edge for a caller's own visits, and by a reminder's send. A failed read or write
 * throws, so the caller's retry meets it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APPOINTMENT_STATUSES,
  type AppointmentState,
  type AppointmentStatus,
  type FeedAppointmentRow,
} from "@chanlytics/contracts";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;
export type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
export type AppointmentInsert = Database["public"]["Tables"]["appointments"]["Insert"];
export type AppointmentUpdate = Database["public"]["Tables"]["appointments"]["Update"];

/** The statuses a visit may still move from: a hold, or a booking ahead. */
const LIVE_STATUSES = ["proposed", "booked"] as const;
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
 * The live row this client holds that starts within `withinMs` of `startMs`, the nearest first; null when the client
 * is named by neither a number nor an address, or holds none there.
 */
export async function appointmentByClientStart(
  db: Db,
  tenantId: string,
  client: { phone: string | null; email: string | null },
  startMs: number,
  withinMs: number,
): Promise<AppointmentRow | null> {
  const who = clientFilter(client);
  if (!who) return null;
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
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
    .gt("ends_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(SPAN_MAX);
  if (error) throw new Error(`appointments_between: ${error.message}`);
  return data ?? [];
}

/** One person's rows, by their number or their address, that end after `fromIso`: their next visit, and the ones since. */
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
    .in("status", [...LIVE_STATUSES])
    .gt("ends_at", fromIso)
    .or(or)
    .order("starts_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`appointments_for_client: ${error.message}`);
  return data ?? [];
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
  // `.in()` puts every key in the URL, and a calendar's UID can be long: a few keys a read.
  for (let i = 0; i < keys.length; i += KEYS_PER_READ) {
    const { data, error } = await db
      .from("appointments")
      .select("external_id, status, starts_at, vanished_at, updated_at")
      .eq("tenant_id", tenantId)
      .eq("source", "calendar_feed")
      .in("external_id", keys.slice(i, i + KEYS_PER_READ));
    if (error && (error.code === "PGRST205" || error.code === "42P01")) return out;
    if (error) throw new Error(`appointments: ${error.message}`);
    for (const r of data ?? []) {
      if (r.external_id && isStatus(r.status))
        out.set(r.external_id, {
          status: r.status,
          starts_at: r.starts_at,
          vanished_at: r.vanished_at,
          updated_at: r.updated_at,
        });
    }
  }
  return out;
}
