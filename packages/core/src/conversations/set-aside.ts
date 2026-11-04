import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

type SetAsidePorts = Pick<ThreadPorts, "notACustomer" | "replyAnyway">;

/**
 * Not a customer, on a thread set aside (decision 0093): it stays archived and leaves the Set aside list, and its sender's
 * address is said to be automated, so their mail stays out. With `undo`, all of it back. One door, one transaction (00539).
 * A door that changed no row did nothing at all: the thread moved while the person looked.
 */
export async function notACustomer(
  ports: Pick<SetAsidePorts, "notACustomer">,
  cmd: { conv: Pick<Thread, "id" | "tenant_id">; undo: boolean },
): Promise<{ set_aside: boolean; decision_id: string }> {
  const done = await ports.notACustomer(cmd.conv.tenant_id, cmd.conv.id, cmd.undo);
  if (!done) throw new AppError("conflict", "That thread has moved. Reload and try again.", 409);
  return { set_aside: cmd.undo, decision_id: done.decision_id };
}

/**
 * Reply anyway, on a thread set aside: it is a customer's after all. Open again, its sender a person, its hold back with its
 * first reason, and so a draft owed by the hold's own event (00539).
 */
export async function replyAnyway(
  ports: Pick<SetAsidePorts, "replyAnyway">,
  cmd: { conv: Pick<Thread, "id" | "tenant_id"> },
): Promise<{ reopened: true; decision_id: string }> {
  const done = await ports.replyAnyway(cmd.conv.tenant_id, cmd.conv.id);
  if (!done) throw new AppError("conflict", "That thread has moved. Reload and try again.", 409);
  return { reopened: true, decision_id: done.decision_id };
}
