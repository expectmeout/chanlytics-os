import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type TakeOverPorts = Pick<ThreadPorts, "pauseMs" | "pauseBot" | "claim" | "withdrawDrafts" | "record" | "now">;
export interface TakeOverResult { state: "needs_human"; paused_until: string; decision_id: string; withdrawn_drafts: number }

/** Take over: pause the receptionist, claim the thread. The open escalation stays open (§4). */
export async function takeOver(ports: TakeOverPorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "phone_e164">; userId: string }): Promise<TakeOverResult> {
  const { conv } = cmd;
  if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
  const untilMs = ports.now() + (await ports.pauseMs(conv.tenant_id));
  const paused_until = new Date(untilMs).toISOString();
  // The live receptionist reads its own store: mirror FIRST, fail loud.
  await ports.pauseBot(conv.tenant_id, conv.phone_e164, untilMs);
  if (!(await ports.claim(conv.id, paused_until, cmd.userId))) {
    // The mirror already paused the receptionist; release it so the two stores
    // do not disagree about a thread nobody took.
    await ports.pauseBot(conv.tenant_id, conv.phone_e164, 0);
    throw new AppError("conflict", "Could not take this thread over — reload and try again.", 409);
  }
  // A held reply must not land after a person has taken the thread — the case
  // the veto window exists to prevent.
  const withdrawn_drafts = await ports.withdrawDrafts(conv.tenant_id, conv.id);
  // No timer to set: expire_stale_pauses() ends the pause from paused_until (00098).
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "take_over", { paused_until });
  return { state: "needs_human", paused_until, decision_id, withdrawn_drafts };
}
