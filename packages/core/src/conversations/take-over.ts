import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type TakeOverPorts = Pick<ThreadPorts, "pauseMs" | "claim" | "takeControl" | "withdrawDrafts" | "record" | "now">;

/**
 * The longest a person's hold lasts without being renewed.
 *
 * The pause a take-over sets is how long the RECEPTIONIST is held off, and a
 * workspace may set that to a week. How long a person is actually on a thread
 * is a different question and a shorter one, and a hold that outlives the
 * person holding it is the defect this fact was added to end -- so the pause
 * window is the ceiling, and a day is the ceiling on that.
 */
export const PERSON_CONTROL_MAX_S = 24 * 60 * 60;
export interface TakeOverResult { state: "needs_human"; paused_until: string; decision_id: string; withdrawn_drafts: number }

/** Take over: pause the receptionist, claim the thread. The open escalation stays open (§4). */
export async function takeOver(ports: TakeOverPorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "phone_e164">; userId: string }): Promise<TakeOverResult> {
  const { conv } = cmd;
  const untilMs = ports.now() + (await ports.pauseMs(conv.tenant_id));
  const paused_until = new Date(untilMs).toISOString();
  // The row IS the pause. There used to be a second store in front of it --
  // the receptionist's own, mirrored over the network before the claim and
  // released again if the claim changed nothing -- and every verb here carried
  // the compensation for it. Nothing reads that store any more, so a thread is
  // held by one fact in one place, and a claim that changes no row leaves
  // nothing behind to undo.
  if (!(await ports.claim(conv.id, paused_until, cmd.userId))) {
    throw new AppError("conflict", "Could not take this thread over — reload and try again.", 409);
  }
  // Who is speaking now, before the drafts are withdrawn: between the claim and
  // the withdrawal a draft can still reach the wire, and the wire asks this.
  await ports.takeControl(conv.tenant_id, conv.id, cmd.userId, Math.min(PERSON_CONTROL_MAX_S, Math.max(1, Math.round((untilMs - ports.now()) / 1000))));
  // A held reply must not land after a person has taken the thread — the case
  // the veto window exists to prevent.
  const withdrawn_drafts = await ports.withdrawDrafts(conv.tenant_id, conv.id);
  // No timer to set: expire_stale_pauses() ends the pause from paused_until (00098).
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "take_over", { paused_until });
  return { state: "needs_human", paused_until, decision_id, withdrawn_drafts };
}
