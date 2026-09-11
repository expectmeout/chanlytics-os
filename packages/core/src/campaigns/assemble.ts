import type { AssembleCommand, AssemblePorts, Assembled } from "./ports";

/**
 * A run's assembly, the one implementation: the broadcast row, then the
 * people on it, then the send job when the plan sends now or later. A stage
 * that fails names itself on the row, so a failed run reads why on the page
 * rather than as a row with no reason; nothing is scheduled for a row whose
 * people could not be written, and no job exists for a row the ledger
 * refused. The caller decides what a failure means to whoever asked: the
 * sweep counts it, a person is told.
 */
export async function assembleRun(ports: AssemblePorts, cmd: AssembleCommand): Promise<Assembled> {
  let id: string;
  try {
    id = await ports.create(cmd.broadcast);
  } catch (e) {
    return { ok: false, id: null, failure: "run_not_created", error: said(e) };
  }
  try {
    await ports.enrol(id, cmd.recipients);
  } catch (e) {
    await ports.fail(id, "recipients_write_failed");
    return { ok: false, id, failure: "recipients_write_failed", error: said(e) };
  }
  if (cmd.sendAt) {
    try {
      await ports.schedule(id, cmd.sendAt);
    } catch (e) {
      await ports.fail(id, "schedule_failed");
      return { ok: false, id, failure: "schedule_failed", error: said(e) };
    }
  }
  return { ok: true, id };
}

const said = (e: unknown): string => (e instanceof Error ? e.message : String(e));
