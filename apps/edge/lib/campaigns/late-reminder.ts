/**
 * A late booking reminded (decision 0118): the door the subscriber `visit_reminder` asks through (core subscribers.ts),
 * injected into the job context by the tick (ops/jobs-tick.ts) as the freed time's offer is.
 *
 * The appointment reminder looks once a day, at its hour, for tomorrow's visits. A booking that lands after that look was
 * reminded by nobody. Here the workspace's running step on `visit_tomorrow` runs for that one person, through the
 * implementation the hourly sweep and Run now use (lib/campaigns/playbooks/playbooks.ts runPlaybook over core's
 * run-playbook), as the system's decision under its sequence's mode, at the time the one rule gives it (contracts
 * lateReminderAt): 8:00 PM the evening before, at once when that has just passed, else the visit's own morning.
 *
 * Once per visit: a reminder that already stands for this person and this start answers a second ask (a second delivery
 * of the event, a booking confirmed after it was added), asked before the run since a batch has no key of its own. A
 * run that failed, or a workspace that could not be read, throws, so the delivery tries again; every other outcome is an
 * answer.
 *
 * It reads the workspace as the day's run does, everyone in People, for the one person: a late booking is a handful a
 * day, and the read is the same one the reminder's own run makes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { lateReminderAt, type LateReminder, type TenantId } from "@chanlytics/contracts";
import { findBookingForReminder, findReminderOfVisit, findReminderStep } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { CONTEXT_PAUSED, loadTenantRunContext, runPlaybook } from "./playbooks/playbooks.js";

type Db = SupabaseClient<Database>;

/**
 * Remind the person an appointment is for, where the day's look can no longer name it: what came of it, or why nothing
 * was sent. `load` is the workspace's run context, the sweep's own unless a caller hands another.
 */
export async function remindLateBooking(
  db: Db,
  tenantId: TenantId,
  appointmentId: string,
  now: Date = new Date(),
  load: typeof loadTenantRunContext = loadTenantRunContext,
): Promise<LateReminder> {
  const found = await findReminderStep(db, tenantId);
  if (found.state !== "running") return { reminded: false, why: found.state === "paused" ? "paused" : "no_step" };
  const { step } = found;
  const nowMs = now.getTime();
  const booking = await findBookingForReminder(db, tenantId, appointmentId, nowMs);
  if (!booking) return { reminded: false, why: "gone" };
  const { contactId } = booking;
  if (!contactId) return { reminded: false, why: "nobody" };
  const startsAt = Date.parse(booking.startsAt);
  const when = lateReminderAt({
    startsAt,
    tz: booking.tz,
    nowMs,
    runHour: step.run_hour,
    lastRunFor: step.last_run_for,
  });
  if (!when) return { reminded: false, why: "not_late" };
  const stands = await findReminderOfVisit(db, tenantId, {
    stepId: step.id,
    contactId,
    startsAt: booking.startsAt,
    nowMs,
  });
  if (stands) return { reminded: false, why: "already" };
  const ctx = await load(db, tenantId, now);
  if ("error" in ctx) {
    if (ctx.error === CONTEXT_PAUSED) return { reminded: false, why: "paused" };
    throw new Error(`the workspace could not be read for a late reminder: ${ctx.error}`);
  }
  const result = await runPlaybook(ctx, step, {
    by: { kind: "system" },
    late: { contactId, appointment: appointmentId, day: when.day, startsAt, at: when.at },
  });
  switch (result.outcome) {
    case "sent":
      return { reminded: true, at: result.scheduled_for, waits: false };
    case "held":
      return { reminded: true, at: null, waits: true };
    case "empty":
      return { reminded: false, why: "nobody" };
    case "off":
      return { reminded: false, why: "off", detail: result.skipped };
    case "failed":
      throw new Error(`the late reminder's run failed: ${result.error}`);
  }
}
