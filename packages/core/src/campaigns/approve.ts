import { errField, logger } from "@chanlytics/channels";
import {
  AppError,
  CAMPAIGNS_PAUSED_WORDS,
  isReachOutRun,
  localDate,
  nextOpenMoment,
  runApprovalRefusal,
} from "@chanlytics/contracts";
import type { ApproveRunPorts, BroadcastRef } from "./ports";

/** An approval's own lines, by name: what a job ledger said when it refused the send is the log's, never the answer's. */
const approveLog = logger();

/**
 * What an approval says when its job could not be written AND the run could not be put back to wait: the run reads
 * "scheduled" with nothing to send it, as far as this can tell (a put-back that threw may have landed, and a run that moved
 * on was moved by something else). The edge's watchdog marks a run that still has no job not sent once its time has
 * passed, and tells its owner (ops/stranded-runs.ts): the words promise only that.
 */
const STRANDED_WORDS =
  "The send could not be scheduled, and the run could not be put back to wait for you. If it still says scheduled once its time has passed, it is marked not sent and you are told.";

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
 * cancel. A job the ledger refused leaves the run waiting, as it was. A
 * paused workspace sends nothing, so nothing is approved in it.
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
  const late = runApprovalRefusal(b, { today: localDate(tz, cmd.now), sendsOn: localDate(tz, open.at) });
  if (late) throw new AppError("conflict", late, 409);
  const at = open.at;
  if (!(await ports.release(b.id, at))) throw new AppError("conflict", "This run just changed state; look again.", 409);
  try {
    await ports.schedule(b.id, at);
  } catch (e) {
    approveLog.error("campaign_step_failed", { step: "schedule", broadcast_id: b.id, error: errField(e) });
    // Put back to wait, and SAID only when it was: a put-back that failed leaves a run that reads "scheduled" with nothing
    // to send it, and "still waiting; try again" over it was a button that answers 409 for ever.
    const held = await ports.hold(b.id).catch((h: unknown) => {
      approveLog.error("campaign_step_failed", { step: "hold", broadcast_id: b.id, error: errField(h) });
      return null;
    });
    if (held)
      throw new AppError("upstream_meta", "The send could not be scheduled. The run is still waiting; try again.", 502);
    if (held === false) approveLog.error("campaign_step_failed", { step: "hold", broadcast_id: b.id, error: "no row" });
    throw new AppError("upstream_meta", STRANDED_WORDS, 502);
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
