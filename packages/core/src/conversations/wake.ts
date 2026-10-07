import { AppError, conversationMoveAllowed } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type WakePorts = Pick<ThreadPorts, "wake" | "record">;

/**
 * Wake now: end a snooze early and put the thread back exactly as it was.
 * Waking touches only the snooze — whatever the thread was (escalated, taken
 * over, open) is what it goes back to being; that state was never thrown
 * away when it was hidden.
 */
export async function wake(
  ports: WakePorts,
  cmd: { conv: Pick<Thread, "id" | "tenant_id" | "state"> },
): Promise<{ state: "open"; decision_id: string }> {
  const { conv } = cmd;
  if (!conversationMoveAllowed("wake", conv.state)) throw new AppError("conflict", "This thread is not snoozed.", 409);
  if (!(await ports.wake(conv.id)))
    throw new AppError("conflict", "Could not wake this thread — reload and try again.", 409);
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "wake", {});
  return { state: "open", decision_id };
}
