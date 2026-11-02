import { AppError, type TenantId } from "@chanlytics/contracts";
import type { SendNowPorts } from "./ports";

/**
 * A held reply let go now (the thread canvas's Send now, 1 Nov 2026): a reply the receptionist holds before it sends
 * goes at the ledger's next tick rather than at the window's end. Only a message still queued: one already on its way,
 * sent or withdrawn has nothing to bring forward, and says so.
 */
export async function releaseHeldReply(
  ports: SendNowPorts,
  cmd: { msg: { id: string; tenant_id: TenantId; status: string } },
): Promise<{ status: "sending"; decision_id: string }> {
  const { msg } = cmd;
  if (msg.status !== "queued") throw new AppError("conflict", "This message is no longer waiting to send.");
  // The job and the member's line in one write (00503 message_send_now), taken only while the row is queued and no run
  // has claimed it: nothing brought forward means its run took it first, and then nothing was written.
  const done = await ports.sendNow(msg.tenant_id, msg.id);
  if (!done) throw new AppError("conflict", "This message is already on its way.");
  return { status: "sending", decision_id: done.decision_id };
}
