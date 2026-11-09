/** Appointments: visits. */

import type { PostgrestError } from "@supabase/supabase-js";
import {
  APPOINTMENT_STATUSES,
  recordIdOf,
  recordKeyOf,
  type AppointmentState,
  type AppointmentStatus,
  type FeedAppointmentRow,
  isOneOf,
  DbFailure,
} from "@chanlytics/contracts";
import type { Json } from "../../../types";
import { readAllRows } from "../../../shared/paged";
import { clientFilter, type AppointmentRow, type Db } from "./rows";
import type { TenantId, ContactId } from "@chanlytics/contracts";

/**
 * The workspace a visit belongs to, as the caller may see it: on a member's session RLS decides, so one they cannot see
 * is null. What a route about one visit is scoped by.
 */
export async function findAppointmentWorkspace(
  db: Db,
  id: string,
): Promise<{ id: string; tenant_id: TenantId } | null> {
  const { data, error } = await db.from("appointments").select("id, tenant_id").eq("id", id).maybeSingle();
  if (error) throw new DbFailure(error, "appointment_workspace");
  return data ?? null;
}

/**
 * A member says what became of a visit (00397 mark_visit), on their own session: kept, missed or cancelled, with the
 * decision theirs in the same transaction. The door's answer as it gave it (a refusal is `{ error }`), and the
 * database's error for one it threw (not found, not signed in).
 */
export async function markVisit(
  db: Db,
  params: { appointmentId: string; status: "kept" | "missed" | "cancelled"; via: string | null; undoOf: string | null },
): Promise<{ data: Json | null; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("mark_visit", {
    p_appointment_id: params.appointmentId,
    p_status: params.status,
    ...(params.via ? { p_via: params.via } : {}),
    ...(params.undoOf ? { p_undo_of: params.undoOf } : {}),
  });
  return { data, error };
}

/**
 * One person's rows, by their number or their address, that end after `fromIso`: their next visit, and the ones since,
 * however each stands, so the reader joins them to the feed as the pools do (contracts feedWithRecord): a cancelled one
 * leaves its copy in the feed out, a request is no visit yet. A booking's rows; the feed's own carry no client.
 */
export async function listAppointmentsForClient(
  db: Db,
  tenantId: TenantId,
  personName: { phone: string | null; email: string | null },
  fromIso: string,
): Promise<AppointmentRow[]> {
  const or = clientFilter(personName);
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
  if (error) throw new DbFailure(error, "appointments_for_client");
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
 * or address a booking carries. A feed row the calendar stopped naming is left out, as listFeedWordsOver leaves it. Newest
 * first. `capped`: more matched than EARLIER_ROWS_MAX, so the rows are a part and must not be counted from.
 */
export async function getEarlierVisitRows(
  db: Db,
  tenantId: TenantId,
  personName: { id: string; phone: string | null; email: string | null },
  beforeIso: string,
): Promise<{ rows: EarlierVisitRow[]; capped: boolean }> {
  const or = [`contact_id.eq.${personName.id}`, clientFilter(personName)].filter(Boolean).join(",");
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

/** The most rows one read of several people's earlier visits takes: past it, nobody is said to have none. */
const EARLIER_OF_MANY_MAX = 1000;

/** A value in a PostgREST list, quoted, so an address's reserved characters stay one value. */
const quotedList = (vs: readonly string[]): string =>
  vs.map((v) => `"${v.replace(/["\\]/g, (c) => `\\${c}`)}"`).join(",");

/**
 * Which of `people` the record holds a visit of that ended at or before `beforeIso` (the season's start): kept, missed,
 * or booked with nobody having said, found as getEarlierVisitRows finds one person's (the person the record linked, or the
 * number or address a booking carries), for several people in one read. Null where the read filled its page, so none of
 * them may be said to have none. A failure throws.
 */
export async function findPeopleWithEarlierVisits(
  db: Db,
  tenantId: TenantId,
  people: readonly { id: string; phone: string | null; email: string | null }[],
  beforeIso: string,
): Promise<ReadonlySet<string> | null> {
  if (!people.length) return new Set();
  const phones = people.flatMap((p) => (p.phone ? [p.phone] : []));
  const emails = people.flatMap((p) => (p.email ? [p.email] : []));
  const or = [
    `contact_id.in.(${quotedList(people.map((p) => p.id))})`,
    phones.length ? `client_phone.in.(${quotedList(phones)})` : "",
    emails.length ? `client_email.in.(${quotedList(emails)})` : "",
  ]
    .filter(Boolean)
    .join(",");
  const { data, error } = await db
    .from("appointments")
    .select("contact_id, client_phone, client_email")
    .eq("tenant_id", tenantId)
    .in("status", ["kept", "missed", "booked"])
    .is("vanished_at", null)
    .lte("ends_at", beforeIso)
    .or(or)
    .limit(EARLIER_OF_MANY_MAX);
  if (error) throw new DbFailure(error, "people_with_earlier_visits");
  const rows = data ?? [];
  if (rows.length >= EARLIER_OF_MANY_MAX) return null;
  const theirs = (p: (typeof people)[number]) =>
    rows.some(
      (r) =>
        r.contact_id === p.id ||
        (p.phone !== null && r.client_phone === p.phone) ||
        (p.email !== null && r.client_email === p.email),
    );
  return new Set(people.filter(theirs).map((p) => p.id));
}

/* ------------------------------------------------------------------ an erasure's hand */

/**
 * An erasure's hand in the appointments (appointments_scrub, 00345; decision 0036): the person's visits, by their id or
 * by any of their numbers and addresses, keep their time and service and lose the client's name, number, address and
 * note; the notices that made them, and any whose subject names them, lose the name. Answers how many visits changed.
 * Service role only. Throws when the database refuses, so the erasure's caller sees the leg did not run.
 */
export async function scrubAppointments(
  db: Db,
  params: { tenantId: TenantId; contactId: ContactId; needles: readonly string[] },
): Promise<number> {
  const { data, error } = await db.rpc("appointments_scrub", {
    p_tenant_id: params.tenantId,
    p_contact_id: params.contactId,
    p_needles: [...params.needles],
  });
  if (error) throw new DbFailure(error, "appointments_scrub");
  return typeof data === "number" ? data : 0;
}

/* ------------------------------------------------------------------ the person */

/** The one person in People this number names: not erased, not merged into another. */
export async function findContactIdByPhone(db: Db, tenantId: TenantId, phone: string): Promise<ContactId | null> {
  const { data, error } = await db
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phone)
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "contact_by_phone");
  return data?.id ?? null;
}

/** The one person in People this address names, matched and never made from an address alone (00125). */
export async function findContactIdByEmail(db: Db, tenantId: TenantId, email: string): Promise<ContactId | null> {
  const { data, error } = await db
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "contact_by_email");
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
  params: {
    tenantId: TenantId;
    timezone: string;
    rows: readonly FeedAppointmentRow[];
    window: { from: Date; to: Date };
    now?: Date;
  },
): Promise<AppointmentSync> {
  const { data, error } = await db.rpc("appointments_feed_sync", {
    p_tenant_id: params.tenantId,
    p_timezone: params.timezone,
    p_rows: params.rows.map((row) => ({
      external_id: row.external_id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      all_day: row.all_day,
      service: row.service,
      consultation: row.consultation,
      contact_id: row.contact_id,
      series: row.series,
      twin: row.twin,
    })),
    p_from: params.window.from.toISOString(),
    p_to: params.window.to.toISOString(),
    p_now: (params.now ?? new Date()).toISOString(),
  });
  if (error) throw new DbFailure(error, "appointments_feed_sync");
  const value = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
  return {
    added: count(value, "added"),
    moved: count(value, "moved"),
    back: count(value, "back"),
    vanished: count(value, "vanished"),
    seen: count(value, "seen"),
    stale: value.stale === true ? 1 : 0,
    first: value.first === true ? 1 : 0,
  };
}

/** Keys one read names: a key is the calendar's UID and a start, and a UID may run to hundreds of characters. */
const KEYS_PER_READ = 25;

const isStatus = (s: string): s is AppointmentStatus => isOneOf(APPOINTMENT_STATUSES, s);

export async function getAppointmentStates(
  db: Db,
  tenantId: TenantId,
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
  for (let index = 0; index < feedKeys.length; index += KEYS_PER_READ) {
    const { data, error } = await db
      .from("appointments")
      .select("external_id, status, starts_at, vanished_at, updated_at")
      .eq("tenant_id", tenantId)
      .eq("source", "calendar_feed")
      .in("external_id", feedKeys.slice(index, index + KEYS_PER_READ));
    if (error && (error.code === "PGRST205" || error.code === "42P01")) return out;
    if (error) throw new DbFailure(error, "appointments");
    for (const r of data ?? []) put(r.external_id, r);
  }
  for (let i = 0; i < ids.length; i += KEYS_PER_READ) {
    const { data, error } = await db
      .from("appointments")
      .select("id, status, starts_at, vanished_at, updated_at")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + KEYS_PER_READ));
    if (error) throw new DbFailure(error, "appointments");
    for (const r of data ?? []) put(recordKeyOf(r.id), r);
  }
  return out;
}

/**
 * The booking door over one appointment of the record (00389 reach_out_booked_from), the service role's: the lead a
 * reach-out wrote to, whose address or number the appointment or its person carries, booked after an email left, is
 * stamped and converted once. How many leads moved. A failure throws.
 */
export async function recordReachOutBookedFrom(db: Db, tenantId: TenantId, appointmentId: string): Promise<number> {
  const { data, error } = await db.rpc("reach_out_booked_from", {
    p_tenant_id: tenantId,
    p_appointment_id: appointmentId,
  });
  if (error) throw new DbFailure(error, "reach_out_booked_from");
  return typeof data === "number" ? data : 0;
}
