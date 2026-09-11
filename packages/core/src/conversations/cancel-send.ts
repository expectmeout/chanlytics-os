import { AppError } from "@chanlytics/contracts";
import type { CancelSendPorts } from "./ports";

/** The honest undo (§6): inside the grace window a queued send cancels cleanly; after fire it is out, and this says so. */
export async function cancelSend(ports: CancelSendPorts, cmd: { msg: { id: string; tenant_id: string; status: string } }): Promise<{ status: "canceled"; decision_id: string }> {
  const { msg } = cmd;
  if (msg.status !== "queued") throw new AppError("conflict", "Too late — this message has already been sent.");
  // The row, guarded on `queued`, closes the race the check above cannot: the
  // send job can fire between the read and the update. Zero rows means it won.
  if (!(await ports.cancelQueued(msg.id))) throw new AppError("conflict", "Too late — this message went out while you were canceling it.");
  await ports.cancelJob(msg.tenant_id, msg.id);
  const decision_id = await ports.record(msg.tenant_id, "message", msg.id, "cancel_send");
  return { status: "canceled", decision_id };
}
