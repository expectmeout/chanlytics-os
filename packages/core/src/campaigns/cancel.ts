import { AppError } from "@chanlytics/contracts";
import type { BroadcastRef, CancelBroadcastPorts } from "./ports";

export interface CancelReceipt { id: string; state: "canceled"; was: string; decision_id: string }

/**
 * Stop a broadcast that has not finished.
 *
 * Scheduled: the job is withdrawn and nothing is sent. Sending: the job
 * stops at its next batch — the messages already on their way are on their
 * way, and the row says how many. Waiting for approval (a playbook's run
 * under the ask mode): skipped, nothing was ever scheduled. Anything else
 * has already ended and says so. The ledger records the decision.
 */
export async function cancelBroadcast(ports: CancelBroadcastPorts, cmd: { row: Pick<BroadcastRef, "id" | "state" | "name"> }): Promise<CancelReceipt> {
  const b = cmd.row;
  if (b.state !== "scheduled" && b.state !== "sending" && b.state !== "pending_approval") {
    const said = b.state === "sent" ? "already been sent" : b.state === "canceled" ? "already been canceled" : "already failed";
    throw new AppError("conflict", `This broadcast has ${said}.`, 409);
  }
  // The row first, then the job. A batch that reads a canceled row sends
  // nothing, so a job that outlives this by a moment is harmless; a job
  // withdrawn before a row that then did not change would leave a run that
  // reads "scheduled" and never goes.
  if (!(await ports.cancel(b.id, b.state))) throw new AppError("conflict", "This broadcast just changed state; look again.", 409);
  if (b.state === "scheduled") await ports.withdraw(b.id);
  const decision_id = await ports.record("broadcast", b.id, "cancel_broadcast", { name: b.name, was: b.state });
  return { id: b.id, state: "canceled", was: b.state, decision_id };
}
