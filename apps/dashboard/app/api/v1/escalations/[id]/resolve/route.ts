import { AppError } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";
import { requireOperator, recordDecision } from "@/server/verbs";
import { requireUuid } from "@/server/request-guards";

/** Explicit resolve — "no change was needed" is also an answer (§4). */
export const POST = withRoute(async (_req, ctx) => {
  const id = requireUuid(ctx.params.id, "escalation");
  const { data: esc, error } = await ctx.supabase
    .from("escalations")
    .select("id, tenant_id, state")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!esc) throw new AppError("not_found", "Escalation not found.");
  await requireOperator(ctx, esc.tenant_id);
  if (esc.state === "resolved") return { state: "resolved", already: true };

  // The update FIRST, row-counted; the ledger entry only once it landed.
  // The decision used to be written before the update, so a resolve that
  // RLS or a concurrent resolve excluded left "resolve" on the ledger for
  // an escalation still open.
  const { data: resolved, error: uerr } = await ctx.supabase
    .from("escalations")
    .update({ state: "resolved", resolved_by_user_id: ctx.userId })
    .eq("id", esc.id)
    .eq("state", "open")
    .select("id");
  if (uerr) throw new Error(uerr.message);
  if (!resolved || resolved.length === 0) {
    throw new AppError("conflict", "This escalation was already resolved — reload.", 409);
  }
  const decisionId = await recordDecision(ctx, esc.tenant_id, "escalation", esc.id, "resolve");
  const { error: linkErr } = await ctx.supabase.from("escalations").update({ decision_id: decisionId }).eq("id", esc.id);
  if (linkErr) console.error("resolve_link_decision_failed", esc.id, linkErr.message);
  return { state: "resolved", decision_id: decisionId };
});
