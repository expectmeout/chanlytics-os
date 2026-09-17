import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type ArchivePorts = Pick<ThreadPorts, "archive" | "record" | "resolveEscalation">;

/** Archive: close the thread (a state, never a deletion — P3). A later inbound reopens it. */
export async function archive(ports: ArchivePorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "paused_until" | "phone_e164"> }): Promise<{ state: "archived"; decision_id: string }> {
  const { conv } = cmd;
  // Closing a thread releases it completely, and the same UPDATE clears the
  // pause. The second store this used to release first, and put back when the
  // row did not change, is gone (take-over.ts says why).
  if (!(await ports.archive(conv.id))) {
    throw new AppError("conflict", "Could not archive this thread — reload and try again.", 409);
  }
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "archive");
  await ports.resolveEscalation(conv.id, decision_id);
  return { state: "archived", decision_id };
}
