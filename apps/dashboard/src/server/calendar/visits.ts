/**
 * What a member says became of a visit (decision 0002, step 8, and its answers of 10 October 2026): kept, missed or
 * cancelled, said on the record's row for it (a booking's, or the one the hourly sync keeps for a feed's event). The
 * door decides and writes, with the decision theirs in the same transaction (00397 mark_visit), as a deal's is; the
 * record never infers that someone came. Their word holds a reminder for a visit marked missed or cancelled
 * (contracts appointmentHolds).
 */
import "server-only";
import { AppError, VISIT_REFUSALS, type VisitMark, type VisitWord } from "@chanlytics/contracts";
import { markVisit } from "@chanlytics/db/calendar";
import { dbRefusal, type RouteContext } from "@/server/shared/with-route";
import { log } from "@/server/shared/log";

/** What the door answered: the row as it stands now, what it stood at before, and the decision, unless nothing moved. */
interface VisitMarked {
  visit: VisitMark;
  from: string;
  decision_id: string | null;
  unchanged: boolean;
}

export async function markVisitOf(
  ctx: Pick<RouteContext, "supabase" | "via" | "undoOf">,
  appointmentId: string,
  status: VisitWord,
): Promise<VisitMarked> {
  const { data, error } = await markVisit(ctx.supabase, {
    appointmentId,
    status,
    via: ctx.via ?? null,
    undoOf: ctx.undoOf ?? null,
  });
  if (error) throw dbRefusal(error);
  const item = (data ?? {}) as {
    error?: string;
    appointment?: VisitMark;
    from?: string;
    decision_id?: string;
    unchanged?: boolean;
  };
  if (item.error || !item.appointment) {
    // A refusal the sentences lack, or no row and no error: logged raw before the generic sentence, so a new refusal is
    // found in the log rather than by its blandness.
    if (!(item.error && VISIT_REFUSALS[item.error]))
      log.error("visit_door_unknown_answer", { appointment: appointmentId, error: item.error ?? null });
    throw new AppError("validation", VISIT_REFUSALS[item.error ?? ""] ?? "Could not say this.");
  }
  if (!item.unchanged && typeof item.decision_id !== "string")
    throw new Error("mark_visit: the door answered without its decision");
  return {
    visit: item.appointment,
    from: item.from ?? item.appointment.status,
    decision_id: item.decision_id ?? null,
    unchanged: !!item.unchanged,
  };
}
