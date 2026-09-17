import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type HandBackPorts = Pick<ThreadPorts, "pauseBot" | "release" | "record" | "resolveEscalation">;

/** Hand back: the receptionist resumes; the open escalation resolves (§4). */
export async function handBack(ports: HandBackPorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "phone_e164" | "paused_until"> }): Promise<{ state: "open"; decision_id: string }> {
  const { conv } = cmd;
  // The mirror is keyed by the number; a thread with none has nothing to release (take-over.ts).
  const phone = conv.phone_e164;
  const mirror = async (until: number) => { if (phone) await ports.pauseBot(conv.tenant_id, phone, until); };
  await mirror(0);
  // The mirror was released first, so a row that did not change gets it back:
  // the thread still reads as held, and a receptionist answering under the
  // person holding it is the defect the pause exists to prevent.
  const back = conv.paused_until ? () => mirror(Date.parse(conv.paused_until!)) : async () => {};
  const released = await ports.release(conv.id).catch(async (e: unknown) => { await back(); throw e; });
  if (!released) {
    await back();
    throw new AppError("conflict", "Could not hand this thread back — reload and try again.", 409);
  }
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "hand_back");
  await ports.resolveEscalation(conv.id, decision_id);
  return { state: "open", decision_id };
}
