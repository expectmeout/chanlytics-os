import { RECIPIENT_REASON_HEARD } from "@chanlytics/contracts";
import { errField, logger } from "@chanlytics/channels";
import { MONTH_ALLOWANCE_REASON } from "./allowance";
import type { AssembleCommand, AssemblePorts, Assembled, AssembledRun } from "./ports";

/** A run's own lines, by name: a hold at enrolment that could not be written. */
const assembleLog = logger();

/**
 * A run's assembly, the one implementation: the broadcast row, the people on it, the send job when the plan sends now
 * or later, and the decision to send when one is given, in one transaction (00282 assemble_broadcast, with its
 * decision since 00381). All are written or none is, so no run is left with no people, no people with no job to send
 * to them, and no run sending with nothing in the ledger saying who said so; a function that dies halfway leaves
 * nothing to clean up. It was three writes with a compensating fail between them, then the ledger's line after, and a
 * death between two left a broadcast that showed as scheduled and that nothing would ever send, or one the route
 * answered with a 500 that a person presses again. The caller decides what a failure means to whoever asked: the
 * sweep counts it, a person is told.
 *
 * Who a send by hand leaves out for the breath (`cmd.leftOut`) and whom the month's allowance already holds (`cmd.held`)
 * are written as skipped once the run exists, so its report says so before anything is sent: the breath's first, then
 * the month's, each in its own write. Neither is the only thing that holds them: the left out carry their row's mark,
 * written with the run (contracts LEFT_OUT_FACTS), and a person past the month's room is held by the send's own count
 * (overAllowance), so a skip the hold did not write -- it failed, failed part-way, or the send claimed the person first
 * -- is still a person never sent. It never fails the run, but it is never silent: logged (`campaign_hold_unwritten`,
 * with its reason) and answered (`leftOutUnwritten`, `unheld`), so a receipt never claims a skip that was not written.
 */
export async function assembleRun(ports: AssemblePorts, cmd: AssembleCommand): Promise<Assembled> {
  let made: AssembledRun;
  try {
    made = await ports.assemble(cmd.broadcast, cmd.recipients, cmd.sendAt, cmd.decision);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const { id, decisionId } = made;
  const leftOutUnwritten = await skipAt(ports, id, cmd.leftOut, RECIPIENT_REASON_HEARD);
  const unheld = await skipAt(ports, id, cmd.held, MONTH_ALLOWANCE_REASON);
  return { ok: true, id, decisionId, unheld, leftOutUnwritten };
}

/** What the log calls the people a skip did not write, by its reason: the month's are unheld, the breath's left out. */
const UNWRITTEN_FIELD: Readonly<Record<string, string>> = {
  [MONTH_ALLOWANCE_REASON]: "unheld",
  [RECIPIENT_REASON_HEARD]: "left_out_unwritten",
};

/**
 * The people of a run just made skipped with `reason`, at once: how many were not written, counted from who the hold
 * says it skipped (none asked: none), so a step that failed after others wrote counts only its own, and a person the
 * send claimed first is not counted as skipped.
 */
async function skipAt(ports: AssemblePorts, id: string, people: readonly string[], reason: string): Promise<number> {
  if (people.length === 0) return 0;
  let done: { skipped: readonly string[]; error: string | null };
  try {
    done = await ports.holdRecipients(id, [...people], reason);
  } catch (e) {
    done = { skipped: [], error: errField(e) };
  }
  const unwritten = people.length - done.skipped.length;
  if (unwritten > 0)
    assembleLog.error("campaign_hold_unwritten", {
      broadcast_id: id,
      reason,
      [UNWRITTEN_FIELD[reason] ?? "unheld"]: unwritten,
      error: done.error ?? "no longer queued",
    });
  return unwritten;
}
