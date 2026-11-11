/**
 * A visit marked kept after the day's look, thanked (decision 0123): the door the subscriber `visit_reminder` asks through
 * for a Kept (core subscribers.ts), injected into the job context by the tick (ops/jobs-tick.ts) beside the late booking's.
 *
 * The thank-you looks once a day, at its hour, for yesterday's visits a member said were kept. One marked kept after that
 * look was thanked by nobody. Here the workspace's running step on `visited` runs for that one person, through the
 * implementation the hourly sweep and Run now use (lib/campaigns/playbooks/playbooks.ts runPlaybook over core's
 * run-playbook), as the system's decision under its sequence's mode, at the time the one rule gives it (contracts
 * keptThanksAt): now, on the day after the visit, while that day's sending hours last.
 *
 * Once per visit: a thank-you that already stands for this person and this start answers a second ask (a second delivery
 * of the event, a Kept said twice), asked before the run since a batch has no key of its own. A run that failed, or a
 * workspace that could not be read, throws, so the delivery tries again; every other outcome is an answer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TIMEZONE, DbFailure, keptThanksAt, type LateThanks, type TenantId } from "@chanlytics/contracts";
import { findOccasionAppointment, findReminderOfVisit, findReminderStep } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { findWorkspaceZoneStatus } from "@chanlytics/db/workspace";
import { CONTEXT_PAUSED, loadTenantRunContext, runPlaybook } from "./playbooks/playbooks.js";

type Db = SupabaseClient<Database>;

/**
 * Thank the person a visit marked kept is for, where the day's look can no longer name it: what came of it, or why
 * nothing was sent. `load` is the workspace's run context, the sweep's own unless a caller hands another.
 */
export async function sendLateThanks(
  db: Db,
  tenantId: TenantId,
  appointmentId: string,
  now: Date = new Date(),
  load: typeof loadTenantRunContext = loadTenantRunContext,
): Promise<LateThanks> {
  const found = await findReminderStep(db, tenantId, "visited");
  if (found.state !== "running") return { thanked: false, why: found.state === "paused" ? "paused" : "no_step" };
  const { step } = found;
  const nowMs = now.getTime();
  const visit = await findOccasionAppointment(db, tenantId, appointmentId);
  if (!visit || visit.vanished || visit.status !== "kept") return { thanked: false, why: "gone" };
  const { contactId } = visit;
  if (!contactId) return { thanked: false, why: "nobody" };
  const zone = await findWorkspaceZoneStatus(db, tenantId);
  if (zone.error) throw new DbFailure(zone.error, "late_thanks: the workspace's zone");
  const startsAt = Date.parse(visit.startsAt);
  const when = keptThanksAt({
    startsAt,
    tz: zone.data?.timezone || DEFAULT_TIMEZONE,
    nowMs,
    runHour: step.run_hour,
    lastRunFor: step.last_run_for,
  });
  // The day's look sends it, or nothing is owed: only one the look can no longer name is this door's.
  if (!when?.late) return { thanked: false, why: "not_late" };
  const stands = await findReminderOfVisit(db, tenantId, {
    stepId: step.id,
    contactId,
    startsAt: visit.startsAt,
    nowMs,
  });
  if (stands) return { thanked: false, why: "already" };
  const ctx = await load(db, tenantId, now);
  if ("error" in ctx) {
    if (ctx.error === CONTEXT_PAUSED) return { thanked: false, why: "paused" };
    throw new Error(`the workspace could not be read for a late thank-you: ${ctx.error}`);
  }
  const result = await runPlaybook(ctx, step, {
    by: { kind: "system" },
    late: { contactId, appointment: appointmentId, day: when.day, startsAt, at: when.at },
  });
  switch (result.outcome) {
    case "sent":
      return { thanked: true, at: result.scheduled_for, waits: false };
    case "held":
      return { thanked: true, at: null, waits: true };
    case "empty":
      return { thanked: false, why: "nobody" };
    case "off":
      return { thanked: false, why: "off", detail: result.skipped };
    case "failed":
      throw new Error(`the late thank-you's run failed: ${result.error}`);
  }
}
