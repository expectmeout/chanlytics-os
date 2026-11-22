/** Appointments: how many. Counted by the database, so a busy book costs a number and never its rows. */

import { DbFailure } from "@chanlytics/contracts";
import type { TenantId } from "@chanlytics/contracts";
import { BOOKED_STATUSES } from "./visits";
import type { Db } from "./rows";

/**
 * How many visits AI booked (source `receptionist`) that nobody took back, all of them or, with `sinceIso`, those it
 * booked since that moment: what a milestone on Today is said from (Working for you, W9). The tenant's visits by their
 * source are one walk of an index (appointments_source_uq), counted there. Under the caller's RLS. A failure throws.
 */
export async function countBookedByAi(db: Db, tenantId: TenantId, sinceIso: string | null): Promise<number> {
  const all = db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("source", "receptionist")
    .in("status", [...BOOKED_STATUSES]);
  const { count, error } = await (sinceIso ? all.gte("created_at", sinceIso) : all);
  if (error) throw new DbFailure(error, "booked_by_ai_count");
  return count ?? 0;
}

/**
 * How many visits stood between two moments that were already on the book by `knownByIso`: what a day held at an hour
 * of it, so a day still filling is set beside what earlier days held at the same hour, never beside how they ended
 * (Working for you, W15). Booked visits that are still there (not cancelled, not gone from the calendar), an all-day
 * entry left out, as Today's day counts them. One short walk of the tenant's visits by their start
 * (appointments_tenant_start). Under the caller's RLS. A failure throws.
 */
export async function countVisitsKnownBy(
  db: Db,
  tenantId: TenantId,
  day: { fromIso: string; toIso: string; knownByIso: string },
): Promise<number> {
  const { count, error } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("starts_at", day.fromIso)
    .lt("starts_at", day.toIso)
    .in("status", [...BOOKED_STATUSES])
    .eq("all_day", false)
    .is("vanished_at", null)
    .lte("created_at", day.knownByIso);
  if (error) throw new DbFailure(error, "visits_known_by_count");
  return count ?? 0;
}
