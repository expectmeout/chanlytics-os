import { AppError, localDate, nextOpenMoment } from "@chanlytics/contracts";
import type { ApproveRunPorts, BroadcastRef } from "./ports";

export interface ApproveReceipt {
  id: string;
  state: "scheduled";
  recipient_count: number | null;
  scheduled_for: string;
  moved_from: string | null;
  decision_id: string;
}

/**
 * A run that was waiting for a person goes out now.
 *
 * Under the ask mode a playbook's run is made as pending_approval: the
 * recipients are enrolled, nothing is scheduled. Approving schedules the
 * send now and records the decision as the approver's; skipping is the
 * cancel. A job the ledger refused leaves the run waiting, as it was.
 */
export async function approveRun(
  ports: ApproveRunPorts,
  cmd: { row: BroadcastRef; now: Date },
): Promise<ApproveReceipt> {
  const b = cmd.row;
  if (b.state !== "pending_approval") throw new AppError("conflict", "This run is not waiting for approval.", 409);
  // Approved at night, it goes at nine: the same hours a run keeps on its own.
  // Read BEFORE the row moves: a clock that cannot be read leaves the run
  // waiting, as it was, rather than scheduled with no job to send it.
  const tz = await ports.timezone();
  // A playbook's run is a day's run: its people were that day's eligible and
  // its words were written for that day ("tomorrow at 2:00 PM"). Approved on
  // a later day it is refused, and the next sweep reads the calendar again.
  if (b.playbook_id && b.run_for && localDate(tz, cmd.now) !== b.run_for) {
    throw new AppError(
      "conflict",
      `This run was made for ${b.run_for} and that day has passed: its people and its words were that day's. Skip it; the next run reads the calendar again.`,
      409,
    );
  }
  const open = nextOpenMoment(tz, cmd.now);
  const at = open.at;
  if (!(await ports.release(b.id, at))) throw new AppError("conflict", "This run just changed state; look again.", 409);
  try {
    await ports.schedule(b.id, at);
  } catch (e) {
    await ports.hold(b.id);
    throw new AppError(
      "upstream_meta",
      "The send could not be scheduled. The run is still waiting; try again.",
      502,
      e instanceof Error ? e.message : undefined,
    );
  }
  const scheduledFor = at.toISOString();
  const movedFrom = open.moved ? cmd.now.toISOString() : null;
  const decision_id = await ports.record("broadcast", b.id, "send_broadcast", {
    name: b.name,
    playbook_id: b.playbook_id,
    recipients: b.recipient_count,
    approved: true,
    scheduled_for: scheduledFor,
    ...(movedFrom ? { moved_from: movedFrom } : {}),
  });
  return {
    id: b.id,
    state: "scheduled",
    recipient_count: b.recipient_count,
    scheduled_for: scheduledFor,
    moved_from: movedFrom,
    decision_id,
  };
}
