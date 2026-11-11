/**
 * What a member says became of a visit (decision 0002, step 8, and its answers of 10 October 2026): kept, missed or
 * cancelled, said on the record's row for it (a booking's, or the one the hourly sync keeps for a feed's event). The
 * door decides and writes, with the decision theirs in the same transaction (00397 mark_visit), as a deal's is; the
 * record never infers that someone came. Their word holds a reminder for a visit marked missed or cancelled
 * (contracts appointmentHolds).
 */
import "server-only";
import {
  APPOINTMENT_STATUSES,
  AppError,
  DEFAULT_TIMEZONE,
  VISIT_REFUSALS,
  batchModeOf,
  clockNearWhen,
  keptThanksAt,
  missedFollowUpAt,
  nextOpenMoment,
  type VisitFollowUp,
  type TenantId,
  type VisitMark,
  type VisitWord,
} from "@chanlytics/contracts";
import { markVisit } from "@chanlytics/db/calendar";
import { findOccasionAppointment, listOccasionSteps } from "@chanlytics/db/campaigns";
import { findWorkspaceZoneStatus } from "@chanlytics/db/workspace";
import { logAndGoOn } from "@chanlytics/log";
import { dbRefusal, type RouteContext } from "@/server/shared/with-route";
import { log } from "@/server/shared/log";
import { z } from "zod";
import { readAnswer } from "@chanlytics/db/shared";

/** What mark_visit answers: its refusal, or the visit, what it was, and the decision it wrote. */
const VisitAnswer = z
  .object({
    error: z.string(),
    appointment: z.object({ id: z.string(), status: z.enum(APPOINTMENT_STATUSES) }),
    from: z.string(),
    decision_id: z.string(),
    unchanged: z.boolean(),
  })
  .partial();

/** What the door answered: the row as it stands now, what it stood at before, and the decision, unless nothing moved. */
interface VisitMarked {
  visit: VisitMark;
  from: string;
  decision_id: string | null;
  unchanged: boolean;
  /** Marked missed or kept where a sequence owes the person its message for it: which, and when (visitFollowUpOf). */
  follows: VisitFollowUp | null;
}

/**
 * What a visit marked missed sets going (decision 0119), read by the rules the edge's enrolment goes by (the sequences
 * on the moment: listOccasionSteps; whether a message is owed and when: missedFollowUpAt, moved into the sending hours
 * as the run moves it), so the row that asked says who writes to the person and offers no second message of its own.
 * Null where no sequence runs on a missed visit, the visit is nobody's on record, or it began too long ago to be owed
 * one. It promises nothing: the run still leaves someone who booked again, who cannot be reached, or whose mark was
 * taken back. A read that fails is logged and answers null: the word was said, and the row falls back to its own offer.
 *
 * A visit marked kept is answered the same way (decision 0123): the thank-you the day after waits for this word, and
 * goes by the day's look or, said after it, on its own (contracts keptThanksAt, the edge's own rule).
 */
async function visitFollowUpOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  marked: { appointmentId: string; status: "missed" | "kept" },
  now: Date,
): Promise<VisitFollowUp | null> {
  const [step] = await listOccasionSteps(ctx.supabase, tenantId, [
    marked.status === "kept" ? "visited" : "visit_missed",
  ]);
  if (!step) return null;
  const visit = await findOccasionAppointment(ctx.supabase, tenantId, marked.appointmentId);
  if (!visit?.contactId) return null;
  const zone = await findWorkspaceZoneStatus(ctx.supabase, tenantId);
  const tz = zone.data?.timezone || DEFAULT_TIMEZONE;
  const startsAt = Date.parse(visit.startsAt);
  const due =
    marked.status === "kept"
      ? (keptThanksAt({ startsAt, tz, nowMs: now.getTime(), runHour: step.runHour, lastRunFor: step.lastRunFor })?.at ??
        null)
      : missedFollowUpAt({ markedAt: now.getTime(), startsAt });
  if (due === null) return null;
  return {
    name: step.name,
    when: clockNearWhen(nextOpenMoment(tz, new Date(due)).at.getTime(), tz, now.getTime()),
    asks: batchModeOf({ mode: step.mode, words_ok_at: step.wordsOkAt, trigger: step.trigger }) === "ask",
  };
}

export async function markVisitOf(
  ctx: Pick<RouteContext, "supabase" | "via" | "undoOf">,
  appointment: { id: string; tenant_id: TenantId },
  status: VisitWord,
): Promise<VisitMarked> {
  const appointmentId = appointment.id;
  const { data, error } = await markVisit(ctx.supabase, {
    appointmentId,
    status,
    via: ctx.via ?? null,
    undoOf: ctx.undoOf ?? null,
  });
  if (error) throw dbRefusal(error);
  const item = readAnswer("mark_visit", VisitAnswer, data ?? {});
  if (item.error || !item.appointment) {
    // A refusal the sentences lack, or no row and no error: logged raw before the generic sentence, so a new refusal is
    // found in the log rather than by its blandness.
    if (!(item.error && VISIT_REFUSALS[item.error]))
      log.error("visit_door_unknown_answer", { appointment: appointmentId, error: item.error ?? null });
    throw new AppError("validation", VISIT_REFUSALS[item.error ?? ""] ?? "Could not say this.");
  }
  if (!item.unchanged && typeof item.decision_id !== "string")
    throw new Error("mark_visit: the door answered without its decision");
  const stands = item.appointment.status;
  const follows =
    stands === "missed" || stands === "kept"
      ? await visitFollowUpOf(ctx, appointment.tenant_id, { appointmentId, status: stands }, new Date()).catch(
          logAndGoOn("visitFollowUpOf", null),
        )
      : null;
  return {
    visit: item.appointment,
    from: item.from ?? item.appointment.status,
    decision_id: item.decision_id ?? null,
    unchanged: !!item.unchanged,
    follows,
  };
}
