import { errField, logger } from "@chanlytics/channels";
import { MONTH_ALLOWANCE_REASON } from "./allowance";
import type { AssembleCommand, AssemblePorts, Assembled, AssembledRun } from "./ports";

/** A run's own lines, by name: a hold at enrolment that could not be written. */
const assembleLog = logger();

/**
 * A run's assembly, the one implementation: the broadcast row, the people on it, the send job when the plan sends now
 * or later, and the decision to send when one is given, in one transaction (00282 assemble_broadcast, with its
 * decision since 00360). All are written or none is, so no run is left with no people, no people with no job to send
 * to them, and no run sending with nothing in the ledger saying who said so; a function that dies halfway leaves
 * nothing to clean up. It was three writes with a compensating fail between them, then the ledger's line after, and a
 * death between two left a broadcast that showed as scheduled and that nothing would ever send, or one the route
 * answered with a 500 that a person presses again. The caller decides what a failure means to whoever asked: the
 * sweep counts it, a person is told.
 *
 * Whom the month's allowance already holds (`cmd.held`) is written as held once the run exists, not before: the run's
 * people are enrolled whole and the held are skipped in their own write, so a write that fails leaves them queued and
 * the send holds them at the wire (overAllowance), which is the backstop. It never fails the run, but it is never silent:
 * the failure is logged (`campaign_hold_unwritten`) and the answer says how many were left unheld (`unheld`), which the
 * caller records beside what it did hold, so a receipt never claims a hold that was not written.
 */
export async function assembleRun(ports: AssemblePorts, cmd: AssembleCommand): Promise<Assembled> {
  let made: AssembledRun;
  try {
    made = await ports.assemble(cmd.broadcast, cmd.recipients, cmd.sendAt, cmd.decision);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const { id, decisionId } = made;
  if (cmd.held.length === 0) return { ok: true, id, decisionId, unheld: 0 };
  try {
    await ports.holdRecipients(id, [...cmd.held], MONTH_ALLOWANCE_REASON);
    return { ok: true, id, decisionId, unheld: 0 };
  } catch (e) {
    assembleLog.error("campaign_hold_unwritten", { broadcast_id: id, unheld: cmd.held.length, error: errField(e) });
    return { ok: true, id, decisionId, unheld: cmd.held.length };
  }
}
