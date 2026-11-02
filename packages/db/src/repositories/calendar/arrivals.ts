/**
 * What arrived on the record today, for Today's figure of what was booked (decision 0076, as amended 2 Nov 2026; the
 * dashboard's server/metrics/bookings.ts): the changes of the visits since a moment, which contracts bookingArriving reads
 * as the bell's notice does, and whether a booking can arrive in the workspace at all. The visits themselves, as they stand,
 * are the bell's own read (notices/notifications.ts bookedVisitsOf). Read on the member's session, where RLS decides. A
 * read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_VIAS } from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;

/** The most events one day's read of the arrivals carries: a busy day's bookings, never a calendar's first read. */
const ARRIVALS_READ_MAX = 200;

/**
 * The events of the record since `sinceIso` that may say a booking arrived, newest first, at most ARRIVALS_READ_MAX: every
 * change of a visit, which contracts notices/visit-news.ts bookingArriving reads (a visit added, or a proposed one
 * confirmed, by a booking's source).
 */
export async function visitChangesSince(
  db: Db,
  tenantId: string,
  sinceIso: string,
): Promise<
  Array<{ kind: string; subject_type: string | null; subject_id: string | null; data: Json; created_at: string }>
> {
  const { data, error } = await db
    .from("events")
    .select("kind, subject_type, subject_id, data, created_at")
    .eq("tenant_id", tenantId)
    .eq("kind", "appointment.changed")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(ARRIVALS_READ_MAX);
  if (error) throw new Error(`cannot read the visits' changes: ${error.message}`);
  return data ?? [];
}

/**
 * Whether a booking can arrive in this workspace at all: the record holds a visit one of a booking's sources brought (the
 * owner's calendar, a booking tool, its email), so a day with none booked is a day with none, not a calendar never linked.
 */
export async function bookingsCanArrive(db: Db, tenantId: string): Promise<boolean> {
  const { data, error } = await db
    .from("appointments")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("source", [...BOOKING_VIAS])
    .limit(1);
  if (error) throw new Error(`cannot read whether bookings arrive: ${error.message}`);
  return (data ?? []).length > 0;
}
