import { AppError } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";
import { requireOperator, recordDecision } from "@/server/verbs";

/** Explicit resolve — "no change was needed" is also an answer (§4). */
export const POST = withRoute(async (_req, ctx) => {
  const id = String(ctx.params.id ?? "");
  const { data: esc, error } = await ctx.supabase
    .from("escalations")
    .select("id, tenant_id, state")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!esc) throw new AppError("not_found", "Escalation not found.");
  await requireOperator(ctx, esc.tenant_id);
  if (esc.state === "resolved") return { state: "resolved", already: true };

  const decisionId = await recordDecision(ctx, esc.tenant_id, "escalation", esc.id, "resolve");
  const { error: uerr } = await ctx.supabase
    .from("escalations")
    .update({ state: "resolved", resolved_by_user_id: ctx.userId, decision_id: decisionId })
    .eq("id", esc.id);
  if (uerr) throw new Error(uerr.message);
  return { state: "resolved", decision_id: decisionId };
});
