/**
 * The record's taken time over the days the receptionist may offer (00345,
 * docs/plans/2026-10-07-bookings-arrive-by-email.md): a booking that arrived by email took its slot even where the
 * tool writes no calendar, so every reader here that names an open time subtracts it beside the feed's busy blocks --
 * the board (calendar-week.ts), Ask's openings (ask/openings.ts, through its reader) and the prompt's preview
 * (receptionist/prompt-preview.ts) -- as the receptionist does on the edge (apps/edge/lib/calendar/availability.ts).
 * One rule (contracts busyOfAppointments) over one span (offeringHorizon), so none offers a time another draws as taken.
 *
 * Read on the member's client, where RLS decides. A read that fails is none, logged: the feed's openings are still
 * said, as they were before the record, and the page is never held for it.
 */
import "server-only";
import { busyOfAppointments, offeringHorizon, type BusyBlock } from "@chanlytics/contracts";
import { appointmentsBetween } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { log } from "@/server/log";

export async function recordBusy(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  now: Date,
  daysAhead: number,
): Promise<BusyBlock[]> {
  const span = offeringHorizon(now, daysAhead);
  try {
    const rows = await appointmentsBetween(
      ctx.supabase,
      tenantId,
      new Date(span.from).toISOString(),
      new Date(span.to).toISOString(),
    );
    return busyOfAppointments(rows);
  } catch (e) {
    log.error("calendar_notices_read_failed", {
      tenant_id: tenantId,
      what: "taken",
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}
