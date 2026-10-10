import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type HandBackPorts = Pick<ThreadPorts, "handBack">;

/** Hand back: the receptionist resumes; the open escalation resolves (§4). */
export async function handBack(
  ports: HandBackPorts,
  cmd: { conv: Pick<Thread, "id" | "tenant_id" | "phone_e164" | "paused_until"> },
): Promise<{ state: "open"; decision_id: string }> {
  const { conv } = cmd;
  // One call, one transaction (00378): the row's own pause cleared by the
  // release, this person's hold let go with it (somebody else's is left where
  // it is), the ledger, and the open escalation resolved by that decision. The
  // hold used to be let go after the release on another client, and a release
  // that ran and a hold that then failed to go left the receptionist held off a
  // thread the Inbox showed open, which is the one direction this must never
  // fail in; now neither happens without the other. A door that changed no row
  // did nothing at all: the thread moved while the person looked.
  const done = await ports.handBack(conv.tenant_id, conv.id);
  if (!done) {
    throw new AppError("conflict", "Could not hand this thread back — reload and try again.", 409);
  }
  return { state: "open", decision_id: done.decision_id };
}
