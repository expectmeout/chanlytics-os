import { AppError, DAY_MS } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export const MAX_SNOOZE_MS = 30 * DAY_MS;
export const NEEDS_UNTIL = "snooze needs a future `until` timestamp.";
export type SnoozePorts = Pick<ThreadPorts, "snooze" | "record" | "now">;
export interface SnoozeResult {
  state: "snoozed";
  snooze_until: string;
  decision_id: string;
}

/** Snooze: hide from the queue until a wake time. The receptionist stays active. */
export async function snooze(
  ports: SnoozePorts,
  cmd: { conv: Pick<Thread, "id" | "tenant_id" | "paused_until" | "phone_e164">; until: string | undefined },
): Promise<SnoozeResult> {
  const { conv } = cmd;
  const now = ports.now();
  const until = cmd.until ? new Date(cmd.until) : null;
  if (!until || Number.isNaN(until.getTime()) || until.getTime() <= now) throw new AppError("validation", NEEDS_UNTIL);
  if (until.getTime() - now > MAX_SNOOZE_MS) throw new AppError("validation", "snooze is capped at 30 days.");
  const snooze_until = until.toISOString();
  // Snooze hides the thread from the queue; it does NOT keep the receptionist
  // muted (that is take-over's job), and the UPDATE clears the pause in the
  // same statement that sets the wake time. It used to release a second store
  // first and put it back when the row did not change; there is no second
  // store now, so a snooze that changes nothing leaves nothing behind.
  if (!(await ports.snooze(conv.id, snooze_until))) {
    throw new AppError("conflict", "Could not snooze this thread — reload and try again.", 409);
  }
  // No timer to set: wake_stale_snoozes() reopens the thread from snooze_until (00098).
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "snooze", { until: snooze_until });
  // The escalation deliberately stays OPEN. Resolving it here once returned the
  // thread at wake as "Handled — no one asked for you" while the customer who
  // had asked for a person was still waiting and in nobody's queue.
  return { state: "snoozed", snooze_until, decision_id };
}
