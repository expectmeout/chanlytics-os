import { AppError } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { requireUuid } from "@/server/request-guards";
import { recordDecision } from "@/server/verbs";
import { takeRate } from "@/server/rate-limit";
import { cancelKindFor } from "@/server/service";

/**
 * POST /api/v1/broadcasts/:id/cancel — stop a broadcast that has not
 * finished.
 *
 * Scheduled: the job is withdrawn and nothing is sent. Sending: the job
 * stops at its next batch — the messages already on their way are on their
 * way, and the row says how many. Anything else has already ended and says
 * so. Owner or operator; the ledger records the decision.
 */
export const POST = withRoute(async (req, ctx) => {
  const id = requireUuid(ctx.params.id, "broadcast");
  const { data: b, error } = await ctx.supabase.from("broadcasts").select("id, tenant_id, state, name").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!b) throw new AppError("not_found", "Broadcast not found.", 404);
  const member = await memberContext(ctx, b.tenant_id);
  requireRole(member, "operator");
  takeRate(ctx.userId, "broadcast");

  if (b.state === "scheduled") {
    await cancelKindFor(b.tenant_id, "broadcast_send", "broadcast_id", id);
  } else if (b.state !== "sending") {
    const said = b.state === "sent" ? "already been sent" : b.state === "canceled" ? "already been canceled" : "already failed";
    throw new AppError("conflict", `This broadcast has ${said}.`, 409);
  }
  const { data: moved, error: uErr } = await ctx.supabase
    .from("broadcasts")
    .update({ state: "canceled" })
    .eq("id", id)
    .eq("state", b.state)
    .select("id");
  if (uErr) throw new Error(uErr.message);
  if (!moved || moved.length === 0) throw new AppError("conflict", "This broadcast just changed state; look again.", 409);

  const decisionId = await recordDecision(ctx, b.tenant_id, "broadcast", id, "cancel_broadcast", { name: b.name, was: b.state });
  return { id, state: "canceled", was: b.state, decision_id: decisionId };
});
