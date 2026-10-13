import { errField, logger } from "@chanlytics/channels";
import {
  AppError,
  CAMPAIGNS_PAUSED_WORDS,
  isReachOutRun,
  nextOpenMoment,
  runApprovalRefusal,
  runDaysAt,
} from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import type { ApproveRunPorts, BroadcastRef } from "./ports";

/** An approval's own lines, by name: what a job ledger said when it refused the send is the log's, never the answer's. */
const approveLog = logger();

/** What an approval says when it could not be written: nothing moved (the door is one transaction), so the words are true. */
const NOT_APPROVED_WORDS = "The send could not be scheduled. The run is still waiting; try again.";
/** A run that was approved, skipped or canceled while the person looked. */
const MOVED_WORDS = "This run just changed state; look again.";

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
 * recipients are enrolled, nothing is scheduled. Approving releases the run,
 * schedules its send and records the decision as the approver's, in one
 * transaction (00353): any of the three that cannot be written leaves the run
 * waiting, as it was. Skipping is the cancel. A paused workspace sends
 * nothing, so nothing is approved in it.
 */
export async function approveRun(
  ports: ApproveRunPorts,
  cmd: { row: BroadcastRef; now: Date },
): Promise<ApproveReceipt> {
  const b = cmd.row;
  if (b.state !== "pending_approval") throw new AppError("conflict", "This run is not waiting for approval.", 409);
  // A paused workspace sends nothing (the wire holds every person of a run, each for good): refused before anything
  // moves, in the words Run now answers in. A read that fails throws: "could not check" is not "may".
  if (await ports.paused()) throw new AppError("payment_required", CAMPAIGNS_PAUSED_WORDS, 402);
  // A reach-out's run (Part 3) is its planned sends, each at its own time in its lead's hours: the reach-out clock
  // claims them, and plans again any that went stale while the run waited. Approved on a later day it still goes, and
  // it is released with no broadcast job, which would find no recipients and end the run as sent.
  if (isReachOutRun(b.audience)) return approveReachOut(ports, b, cmd.now);
  // Approved at night, it goes at nine: the same hours a run keeps on its own.
  // Read BEFORE the row moves: a clock that cannot be read leaves the run
  // waiting, as it was, rather than scheduled with no job to send it.
  const tz = await ports.timezone();
  const open = nextOpenMoment(tz, cmd.now);
  // A playbook's run is a day's run: approved on a later day it is refused, and so is a visit's run that would go out on
  // a later day than it was made for (approved after the last sending hour it waits for nine, with the day before's
  // words): contracts runApprovalRefusal, the words Ask's run card refuses in and the sheet says instead of a button.
  const late = runApprovalRefusal(b, runDaysAt(tz, cmd.now));
  if (late) throw new AppError("conflict", late, 409);
  const at = open.at;
  const scheduledFor = at.toISOString();
  const movedFrom = open.moved ? cmd.now.toISOString() : null;
  const decision_id = await approvedWhole(ports, b, at, {
    job: true,
    decision: {
      name: b.name,
      playbook_id: b.playbook_id,
      recipients: b.recipient_count,
      approved: true,
      scheduled_for: scheduledFor,
      ...(movedFrom ? { moved_from: movedFrom } : {}),
    },
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
 * The run released, its job written when it has one, and the approval recorded, together or not at all: the decision's
 * id. A run that moved while the person looked is a conflict; a door that failed is said as what it left, a run still
 * waiting, with the database's own words in the log and never in the answer.
 */
async function approvedWhole(
  ports: ApproveRunPorts,
  b: BroadcastRef,
  at: Date,
  o: { job: boolean; decision: Json },
): Promise<string> {
  let id: string | null;
  try {
    id = await ports.approve(b.id, at, o);
  } catch (e) {
    approveLog.error("campaign_step_failed", { step: "approve", broadcast_id: b.id, error: errField(e) });
    throw new AppError("upstream_meta", NOT_APPROVED_WORDS, 502);
  }
  if (!id) throw new AppError("conflict", MOVED_WORDS, 409);
  return id;
}

/**
 * A reach-out's run, approved: released with no broadcast job. Its sends keep their own times, and the reach-out clock
 * claims each when it is due (planning again one that went stale while the run waited), so the run says when its first
 * email goes, or now when that time has passed.
 */
async function approveReachOut(ports: ApproveRunPorts, b: BroadcastRef, now: Date): Promise<ApproveReceipt> {
  const first = b.scheduled_for ? Date.parse(b.scheduled_for) : NaN;
  const at = Number.isFinite(first) && first > now.getTime() ? new Date(first) : now;
  const scheduledFor = at.toISOString();
  // No job: its sends keep their own times, and the reach-out clock claims each.
  const decision_id = await approvedWhole(ports, b, at, {
    job: false,
    decision: {
      name: b.name,
      playbook_id: b.playbook_id,
      recipients: b.recipient_count,
      approved: true,
      reach_out: true,
      scheduled_for: scheduledFor,
    },
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
