import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type TakeOverPorts = Pick<ThreadPorts, "pauseMs" | "takeOver" | "now">;

/**
 * The longest a person's hold lasts without being renewed.
 *
 * The pause a take-over sets is how long the RECEPTIONIST is held off, and a
 * workspace may set that to a week. How long a person is actually on a thread
 * is a different question and a shorter one, and a hold that outlives the
 * person holding it is the defect this fact was added to end -- so the pause
 * window is the ceiling, and a day is the ceiling on that. The take-over's own
 * door keeps the same ceiling (00378, over 00132's claim); a reply's hold is
 * taken here (reply.ts).
 */
export const PERSON_CONTROL_MAX_S = 24 * 60 * 60;
export interface TakeOverResult {
  state: "needs_human";
  paused_until: string;
  decision_id: string;
  withdrawn_drafts: number;
}

/** Take over: pause the receptionist, claim the thread. The open escalation stays open (§4). */
export async function takeOver(
  ports: TakeOverPorts,
  cmd: { conv: Pick<Thread, "id" | "tenant_id" | "phone_e164"> },
): Promise<TakeOverResult> {
  const { conv } = cmd;
  // How long is decided here, from the workspace's reply policy; the door takes the moment.
  const paused_until = new Date(ports.now() + (await ports.pauseMs(conv.tenant_id))).toISOString();
  // One call, one transaction (00378): the claim IS the pause; the hold on who is
  // speaking is taken with it, before the drafts are withdrawn, so a draft that
  // reaches the wire meanwhile meets the hold; the drafts written before it are
  // withdrawn; and the ledger says who. These used to be four writes on two
  // clients, and the hold taken with a release that then failed kept the
  // receptionist off a thread the Inbox showed open for up to a day. A door that
  // changed no row did nothing at all: the thread moved while the person looked.
  // No timer to set: expire_stale_pauses() ends the pause from paused_until (00098).
  const done = await ports.takeOver(conv.tenant_id, conv.id, paused_until);
  if (!done) {
    throw new AppError("conflict", "Could not take this thread over — reload and try again.", 409);
  }
  return { state: "needs_human", paused_until, decision_id: done.decision_id, withdrawn_drafts: done.withdrawn_drafts };
}
