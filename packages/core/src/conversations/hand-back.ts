import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type HandBackPorts = Pick<ThreadPorts, "release" | "letControlGo" | "record" | "resolveEscalation">;

/** Hand back: the receptionist resumes; the open escalation resolves (§4). */
export async function handBack(
  ports: HandBackPorts,
  cmd: { conv: Pick<Thread, "id" | "tenant_id" | "phone_e164" | "paused_until">; userId: string },
): Promise<{ state: "open"; decision_id: string }> {
  const { conv } = cmd;
  // One fact in one place: the row's own pause, cleared by the release. The
  // second store this used to release first -- and put back when the release
  // changed no row -- is gone (take-over.ts says why).
  if (!(await ports.release(conv.id))) {
    throw new AppError("conflict", "Could not hand this thread back — reload and try again.", 409);
  }
  // The row is open again, so let the hold go last and only if it is ours: a
  // release that ran first and then failed to open the row would leave the
  // receptionist free on a thread still marked for a person, which is the one
  // direction this must never fail in.
  await ports.letControlGo(conv.tenant_id, conv.id, cmd.userId);
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "hand_back");
  await ports.resolveEscalation(conv.id, decision_id);
  return { state: "open", decision_id };
}
