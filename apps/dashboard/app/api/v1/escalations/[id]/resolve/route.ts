import { AppError } from "@chanlytics/contracts";
import { resolveEscalation } from "@chanlytics/core";
import { write, row } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { escalationPorts } from "@/server/ports/core-ports";

/** The escalation being answered, read under RLS: one the caller cannot see is a 404. */
const theEscalation = row(async (ctx, params) => {
  const id = requireUuid(params.id, "escalation");
  const { data: esc, error } = await ctx.supabase
    .from("escalations")
    .select("id, tenant_id, state")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!esc) throw new AppError("not_found", "Escalation not found.");
  return esc;
});

/** Explicit resolve — "no change was needed" is also an answer (§4). */
export const POST = write({
  scope: theEscalation,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: esc }) => resolveEscalation(escalationPorts(ctx), { esc }),
});
