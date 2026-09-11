import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type HandBackPorts = Pick<ThreadPorts, "pauseBot" | "release" | "record" | "resolveEscalation">;

/** Hand back: the receptionist resumes; the open escalation resolves (§4). */
export async function handBack(ports: HandBackPorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "phone_e164"> }): Promise<{ state: "open"; decision_id: string }> {
  const { conv } = cmd;
  if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
  await ports.pauseBot(conv.tenant_id, conv.phone_e164, 0);
  if (!(await ports.release(conv.id))) throw new AppError("conflict", "Could not hand this thread back — reload and try again.", 409);
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "hand_back");
  await ports.resolveEscalation(conv.id, decision_id);
  return { state: "open", decision_id };
}
