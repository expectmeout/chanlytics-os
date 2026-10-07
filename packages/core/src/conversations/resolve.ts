import { AppError, type TenantId } from "@chanlytics/contracts";
import type { EscalationPorts } from "./ports";

export type ResolveResult = { state: "resolved"; already: true } | { state: "resolved"; decision_id: string };

/** Explicit resolve — "no change was needed" is also an answer (§4). */
export async function resolveEscalation(
  ports: EscalationPorts,
  cmd: { esc: { id: string; tenant_id: TenantId; state: string } },
): Promise<ResolveResult> {
  const { esc } = cmd;
  if (esc.state === "resolved") return { state: "resolved", already: true };
  // The update FIRST, row-counted; the ledger entry only once it landed, so a
  // resolve that RLS or a concurrent resolve excluded never leaves "resolve"
  // on the ledger for an escalation still open.
  if (!(await ports.resolve(esc.id)))
    throw new AppError("conflict", "This escalation was already resolved — reload.", 409);
  const decision_id = await ports.record(esc.tenant_id, "escalation", esc.id, "resolve");
  await ports.link(esc.id, decision_id);
  return { state: "resolved", decision_id };
}
