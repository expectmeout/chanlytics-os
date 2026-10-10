import { AppError, type TenantId } from "@chanlytics/contracts";
import type { CancelSendPorts } from "./ports";

/** The honest undo (§6): inside the grace window a queued send cancels cleanly; after fire it is out, and this says so. */
export async function cancelSend(
  ports: CancelSendPorts,
  cmd: { msg: { id: string; tenant_id: TenantId; status: string } },
): Promise<{ status: "canceled"; decision_id: string }> {
  const { msg } = cmd;
  if (msg.status !== "queued") throw new AppError("conflict", "Too late — this message has already been sent.");
  // The row, its send job and the member's line in one write (00379 message_call_back), taken only while the row is
  // queued and no run has claimed it: that closes the race the check above cannot, since the send job can fire
  // between the read and the write. Nothing withdrawn means it won, and then nothing was written.
  const called = await ports.callBack(msg.tenant_id, msg.id);
  if (!called) throw new AppError("conflict", "Too late — this message went out while you were canceling it.");
  return { status: "canceled", decision_id: called.decision_id };
}
