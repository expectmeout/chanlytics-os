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
 * Who waits a week for the breath (`cmd.waits`) and whom the month's allowance already holds (`cmd.held`) are written
 * as skipped once the run exists, not before: the run's people are enrolled whole and each is skipped in its own write,
 * the breath's first, since nothing at the wire holds a person who heard this week, where the send holds a person past
 * the month's room all the same (overAllowance, the backstop). A write that fails never fails the run, but it is never
 * silent: the failure is logged (`campaign_hold_unwritten`, with its reason) and the answer says how many were left
 * queued (`unwaited`, `unheld`), which the caller records beside what it did write, so a receipt never claims a skip that
 * was not written.
 */
export async function assembleRun(ports: AssemblePorts, cmd: AssembleCommand): Promise<Assembled> {
  let made: AssembledRun;
  try {
    made = await ports.assemble(cmd.broadcast, cmd.recipients, cmd.sendAt, cmd.decision);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const { id, decisionId } = made;
  const unwaited = await skipAt(ports, id, cmd.waits, RECIPIENT_REASON_HEARD);
  const unheld = await skipAt(ports, id, cmd.held, MONTH_ALLOWANCE_REASON);
  return { ok: true, id, decisionId, unheld, unwaited };
}

/** The people of a run just made skipped with `reason`, at once: how many could not be written (none asked: none). */
async function skipAt(ports: AssemblePorts, id: string, people: readonly string[], reason: string): Promise<number> {
  if (people.length === 0) return 0;
  try {
    await ports.holdRecipients(id, [...people], reason);
    return 0;
  } catch (e) {
    assembleLog.error("campaign_hold_unwritten", {
      broadcast_id: id,
      reason,
      unheld: people.length,
      error: errField(e),
    });
    return people.length;
  }
}
