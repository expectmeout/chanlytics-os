import { AppError, asTenantId } from "@chanlytics/contracts";
import { resolveEscalation } from "@chanlytics/core";
import { write, row } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { escalationPorts } from "@/server/conversations/ports";
import { findEscalationFor } from "@/server/conversations/thread-control";

/** The escalation being answered, read under RLS: one the caller cannot see is a 404. */
const theEscalation = row(async (ctx, params) => {
  const id = requireUuid(params.id, "escalation");
  const { data: esc, error } = await findEscalationFor(ctx, id);
  if (error) throw new Error(error.message);
  if (!esc) throw new AppError("not_found", "Escalation not found.");
  return { ...esc, tenant_id: asTenantId(esc.tenant_id) };
});

/** Explicit resolve — "no change was needed" is also an answer (§4). */
export const POST = write({
  scope: theEscalation,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: esc }) => resolveEscalation(escalationPorts(ctx), { esc }),
});
