import { AppError, isReachOutRun, localDate, nextOpenMoment } from "@chanlytics/contracts";
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
  // A reach-out's run (Part 3) is its planned sends, each at its own time in its lead's hours: the reach-out clock
  // claims them, and plans again any that went stale while the run waited. Approved on a later day it still goes, and
  // it is released with no broadcast job, which would find no recipients and end the run as sent.
  if (isReachOutRun(b.audience)) return approveReachOut(ports, b, cmd.now);
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

/**
 * A reach-out's run, approved: released with no broadcast job. Its sends keep their own times, and the reach-out clock
 * claims each when it is due (planning again one that went stale while the run waited), so the run says when its first
 * email goes, or now when that time has passed.
 */
async function approveReachOut(ports: ApproveRunPorts, b: BroadcastRef, now: Date): Promise<ApproveReceipt> {
  const first = b.scheduled_for ? Date.parse(b.scheduled_for) : NaN;
  const at = Number.isFinite(first) && first > now.getTime() ? new Date(first) : now;
  if (!(await ports.release(b.id, at))) throw new AppError("conflict", "This run just changed state; look again.", 409);
  const scheduledFor = at.toISOString();
  const decision_id = await ports.record("broadcast", b.id, "send_broadcast", {
    name: b.name,
    playbook_id: b.playbook_id,
    recipients: b.recipient_count,
    approved: true,
    reach_out: true,
    scheduled_for: scheduledFor,
  });
  return {
    id: b.id,
    state: "scheduled",
    recipient_count: b.recipient_count,
    scheduled_for: scheduledFor,
    moved_from: null,
    decision_id,
  };
}
