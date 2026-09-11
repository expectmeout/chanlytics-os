import { AppError } from "@chanlytics/contracts";
import type { ApproveRunPorts, BroadcastRef } from "./ports";

export interface ApproveReceipt { id: string; state: "scheduled"; recipient_count: number | null; decision_id: string }

/**
 * A run that was waiting for a person goes out now.
 *
 * Under the ask mode a playbook's run is made as pending_approval: the
 * recipients are enrolled, nothing is scheduled. Approving schedules the
 * send now and records the decision as the approver's; skipping is the
 * cancel. A job the ledger refused leaves the run waiting, as it was.
 */
export async function approveRun(ports: ApproveRunPorts, cmd: { row: BroadcastRef; now: Date }): Promise<ApproveReceipt> {
  const b = cmd.row;
  if (b.state !== "pending_approval") throw new AppError("conflict", "This run is not waiting for approval.", 409);
  if (!(await ports.release(b.id))) throw new AppError("conflict", "This run just changed state; look again.", 409);
  try {
    await ports.schedule(b.id, cmd.now);
  } catch (e) {
    await ports.hold(b.id);
    throw new AppError("upstream_meta", "The send could not be scheduled. The run is still waiting; try again.", 502, e instanceof Error ? e.message : undefined);
  }
  const decision_id = await ports.record("broadcast", b.id, "send_broadcast", {
    name: b.name, playbook_id: b.playbook_id, recipients: b.recipient_count, approved: true, scheduled_for: cmd.now.toISOString(),
  });
  return { id: b.id, state: "scheduled", recipient_count: b.recipient_count, decision_id };
}
