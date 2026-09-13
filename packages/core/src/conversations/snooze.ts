import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export const MAX_SNOOZE_MS = 30 * 24 * 3600 * 1000;
export const NEEDS_UNTIL = "snooze needs a future `until` timestamp.";
export type SnoozePorts = Pick<ThreadPorts, "pauseBot" | "snooze" | "record" | "now">;
export interface SnoozeResult { state: "snoozed"; snooze_until: string; decision_id: string }

/** Snooze: hide from the queue until a wake time. The receptionist stays active. */
export async function snooze(ports: SnoozePorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "paused_until" | "phone_e164">; until: string | undefined }): Promise<SnoozeResult> {
  const { conv } = cmd;
  const now = ports.now();
  const until = cmd.until ? new Date(cmd.until) : null;
  if (!until || Number.isNaN(until.getTime()) || until.getTime() <= now) throw new AppError("validation", NEEDS_UNTIL);
  if (until.getTime() - now > MAX_SNOOZE_MS) throw new AppError("validation", "snooze is capped at 30 days.");
  // Snooze hides the thread from the queue; it does NOT keep the receptionist
  // muted (that is take-over's job): release any pause first.
  const held = conv.paused_until && conv.phone_e164 ? { phone: conv.phone_e164, until: Date.parse(conv.paused_until) } : null;
  if (held) await ports.pauseBot(conv.tenant_id, held.phone, 0);
  const snooze_until = until.toISOString();
  // A row that did not change gets its pause back: the thread still reads as
  // held, and the receptionist must not answer under the person holding it.
  const back = held ? () => ports.pauseBot(conv.tenant_id, held.phone, held.until) : async () => {};
  const snoozed = await ports.snooze(conv.id, snooze_until).catch(async (e: unknown) => { await back(); throw e; });
  if (!snoozed) {
    await back();
    throw new AppError("conflict", "Could not snooze this thread — reload and try again.", 409);
  }
  // No timer to set: wake_stale_snoozes() reopens the thread from snooze_until (00098).
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "snooze", { until: snooze_until });
  // The escalation deliberately stays OPEN. Resolving it here once returned the
  // thread at wake as "Handled — no one asked for you" while the customer who
  // had asked for a person was still waiting and in nobody's queue.
  return { state: "snoozed", snooze_until, decision_id };
}
