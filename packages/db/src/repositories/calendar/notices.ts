/**
 * The notices ledger (00345, docs/plans/2026-10-07-bookings-arrive-by-email.md): every booking tool's notice the
 * workspace's address took in, what it became or why it is held. Groups:
 *
 *   one delivery      appointmentNoticeOf (what it became, or null), keepAppointmentNotice (once per delivery: the same
 *                     delivery kept again replaces the row, appointment_notices_delivery_uq).
 *   the health line   appointmentNoticesOf: the latest notice (its tool and when) and how many are held for a person,
 *                     read one after the other so a turn's reads are in one order (ask/readers.test.mjs pins them).
 *
 * Written by the booking_read job on the service role; read by the dashboard on the member's client, where RLS decides.
 * A failed read or write throws, so the caller's retry meets it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;
export type AppointmentNoticeRow = Database["public"]["Tables"]["appointment_notices"]["Row"];
export type AppointmentNoticeInsert = Database["public"]["Tables"]["appointment_notices"]["Insert"];

export async function appointmentNoticeOf(
  db: Db,
  tenantId: string,
  noticeId: string,
): Promise<AppointmentNoticeRow | null> {
  const { data, error } = await db
    .from("appointment_notices")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("notice_id", noticeId)
    .maybeSingle();
  if (error) throw new Error(`appointment_notice: ${error.message}`);
  return data;
}

/** What became of a delivery, kept once: the same delivery kept again replaces the row. */
export async function keepAppointmentNotice(db: Db, row: AppointmentNoticeInsert): Promise<void> {
  const { error } = await db
    .from("appointment_notices")
    .upsert({ ...row, read_at: new Date().toISOString() }, { onConflict: "tenant_id,notice_id" });
  if (error) throw new Error(`appointment_notice_keep: ${error.message}`);
}

/**
 * The health line's facts: the latest notice that became a visit (booked, moved or cancelled: its tool and when), and
 * how many are held for a person. A tool's receipt set aside, a notice held and one dismissed are none of them "the
 * last booking email": a workspace whose only mail was those is not working yet.
 */
export async function appointmentNoticesOf(
  db: Db,
  tenantId: string,
): Promise<{ tool: string | null; last_at: string | null; held: number }> {
  const latest = await db
    .from("appointment_notices")
    .select("tool, received_at")
    .eq("tenant_id", tenantId)
    .in("outcome", ["booked", "changed", "cancelled"])
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new Error(`appointment_notices_latest: ${latest.error.message}`);
  const held = await db
    .from("appointment_notices")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("outcome", "held");
  if (held.error) throw new Error(`appointment_notices_held: ${held.error.message}`);
  return { tool: latest.data?.tool ?? null, last_at: latest.data?.received_at ?? null, held: held.count ?? 0 };
}

/* ------------------------------------------------------------------ who may forward one */

/**
 * Is this address a member's of the workspace (member_has_address, 00345): how the intake trusts a notice a person
 * forwarded by hand. Service role only; a failed ask throws, so the intake's retry meets it rather than booking on a
 * stranger's word.
 */
export async function memberHasAddress(db: Db, tenantId: string, address: string): Promise<boolean> {
  const { data, error } = await db.rpc("member_has_address", { p_tenant_id: tenantId, p_address: address });
  if (error) throw new Error(`member_has_address: ${error.message}`);
  return data === true;
}

/* ------------------------------------------------------------------ the ones a person looks at */

/** The most held notices the card lists: the latest first. */
const HELD_MAX = 20;

/** The notices held for a person, latest first, as the card lists them. */
export async function heldNoticesOf(db: Db, tenantId: string): Promise<AppointmentNoticeRow[]> {
  const { data, error } = await db
    .from("appointment_notices")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("outcome", "held")
    .order("received_at", { ascending: false })
    .limit(HELD_MAX);
  if (error) throw new Error(`appointment_notices_held_list: ${error.message}`);
  return data ?? [];
}

/** One notice of the workspace by its row id, or null. */
export async function appointmentNoticeById(
  db: Db,
  tenantId: string,
  id: string,
): Promise<AppointmentNoticeRow | null> {
  const { data, error } = await db
    .from("appointment_notices")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`appointment_notice_by_id: ${error.message}`);
  return data;
}

/**
 * A person let a held notice go: dismissed, its reason kept. Only a held one moves; answers whether one did, so the
 * route can say "nothing to dismiss" rather than succeed over a row that was already read.
 */
export async function dismissAppointmentNotice(db: Db, tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await db
    .from("appointment_notices")
    .update({ outcome: "dismissed" })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("outcome", "held")
    .select("id");
  if (error) throw new Error(`appointment_notice_dismiss: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
