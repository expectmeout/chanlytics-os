import type { AssembleCommand, AssemblePorts, Assembled } from "./ports";

/**
 * A run's assembly, the one implementation: the broadcast row, the people on it and the send job when the plan sends
 * now or later, in one transaction (00280 assemble_broadcast). All three are written or none is, so no run is left
 * with no people, and no people with no job to send to them; a function that dies halfway leaves nothing to clean up.
 * It was three writes with a compensating fail between them, and a death between two left a broadcast that showed as
 * scheduled and that nothing would ever send. The caller decides what a failure means to whoever asked: the sweep
 * counts it, a person is told.
 */
export async function assembleRun(ports: AssemblePorts, cmd: AssembleCommand): Promise<Assembled> {
  try {
    return { ok: true, id: await ports.assemble(cmd.broadcast, cmd.recipients, cmd.sendAt) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
