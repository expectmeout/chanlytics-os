/**
 * Appointments as records (decision 0002, 00346): the one place the table is typed.
 *   syncFeedAppointments  one read of a workspace's calendar feed kept through appointments_feed_sync, in one transaction:
 *                         each row inserted or updated by its key, a row the read no longer names vanished (never
 *                         cancelled), a booked appointment over for a day kept. Throws with the database's words.
 *   appointmentStates     how the appointments a reminder batch was drawn for stand now, by key: what a send asks again
 *                         (contracts appointmentHolds). A database before 00346 has none, and says so as no rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppointmentState, AppointmentStatus, FeedAppointmentRow } from "@chanlytics/contracts";
import { APPOINTMENT_STATUSES } from "@chanlytics/contracts";
import type { Database } from "./database.types";

type Db = SupabaseClient<Database>;

/** What one read of the feed changed: rows added, moved, back after vanishing, vanished, kept by time; and how many it named. */
export interface AppointmentSync {
  added: number;
  moved: number;
  back: number;
  vanished: number;
  kept: number;
  seen: number;
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
      title: r.title,
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
    kept: count(o, "kept"),
    seen: count(o, "seen"),
  };
}

const isStatus = (s: string): s is AppointmentStatus => (APPOINTMENT_STATUSES as readonly string[]).includes(s);

export async function appointmentStates(
  db: Db,
  tenantId: string,
  keys: readonly string[],
): Promise<Map<string, AppointmentState>> {
  const out = new Map<string, AppointmentState>();
  if (keys.length === 0) return out;
  const { data, error } = await db
    .from("appointments")
    .select("external_id, status, starts_at, vanished_at")
    .eq("tenant_id", tenantId)
    .eq("source", "calendar_feed")
    .in("external_id", [...keys]);
  if (error && (error.code === "PGRST205" || error.code === "42P01")) return out;
  if (error) throw new Error(`appointments: ${error.message}`);
  for (const r of data ?? []) {
    if (r.external_id && isStatus(r.status))
      out.set(r.external_id, { status: r.status, starts_at: r.starts_at, vanished_at: r.vanished_at });
  }
  return out;
}
