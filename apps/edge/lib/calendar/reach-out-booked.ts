/**
 * A booking stops a reach-out (Reach out Part 5, PR 9; G19, N3): the calendar sweep hands the door every address and
 * number its appointments carry, and the door converts a lead a reach-out wrote to that booked after its email left.
 * Its next nudge is then never written: the send door's lead stage stops it.
 *
 * A failure is logged and counts nothing: the appointment is still in the feed next hour, and People's import, which
 * ran first, is not undone for it. A database without the door (00227 not yet applied) is such a failure, so either
 * deploy order works.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { bookedSeenOf, type FeedItem, type OwnAddresses } from "../packages/contracts.js";
import { logger } from "../log.js";

export async function bookedFromCalendar(
  db: SupabaseClient<Database>,
  tenantId: string,
  items: FeedItem[],
  own: OwnAddresses,
): Promise<number> {
  const seen = bookedSeenOf(items, own);
  if (!seen.length) return 0;
  const { data, error } = await db.rpc("reach_out_booked", { p_tenant_id: tenantId, p_seen: seen });
  if (error) {
    logger({ tenant_id: tenantId }).warn("reach_out_booked_failed", { error: error.message });
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
