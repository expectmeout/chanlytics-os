import { AppError, nextOpenMoment } from "@chanlytics/contracts";
import type { ApproveRunPorts, BroadcastRef } from "./ports";

export interface ApproveReceipt { id: string; state: "scheduled"; recipient_count: number | null; scheduled_for: string; moved_from: string | null; decision_id: string }

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
  // Approved at night, it goes at nine: the same hours a run keeps on its own.
  const open = nextOpenMoment(await ports.timezone(), cmd.now);
  const at = open.at;
  try {
    await ports.schedule(b.id, at);
  } catch (e) {
    await ports.hold(b.id);
    throw new AppError("upstream_meta", "The send could not be scheduled. The run is still waiting; try again.", 502, e instanceof Error ? e.message : undefined);
  }
  const decision_id = await ports.record("broadcast", b.id, "send_broadcast", {
    name: b.name, playbook_id: b.playbook_id, recipients: b.recipient_count, approved: true, scheduled_for: at.toISOString(),
    ...(open.moved ? { moved_from: cmd.now.toISOString() } : {}),
  });
  return { id: b.id, state: "scheduled", recipient_count: b.recipient_count, scheduled_for: at.toISOString(), moved_from: open.moved ? cmd.now.toISOString() : null, decision_id };
}
