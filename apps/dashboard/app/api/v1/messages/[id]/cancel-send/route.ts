import { AppError } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";
import { requireOperator, recordDecision } from "@/server/verbs";
import { cancelKindFor } from "@/server/service";
import { requireUuid } from "@/server/request-guards";

/** The honest undo (§6): inside the grace window a queued send cancels cleanly;
 *  after fire it is out, and this says so. */
export const POST = withRoute(async (_req, ctx) => {
  const id = requireUuid(ctx.params.id, "message");
  const { data: msg, error } = await ctx.supabase
    .from("messages")
    .select("id, tenant_id, conversation_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!msg) throw new AppError("not_found", "Message not found.");
  await requireOperator(ctx, msg.tenant_id);
  if (msg.status !== "queued") {
    throw new AppError("conflict", "Too late — this message has already been sent.");
  }

  // `.eq("status","queued")` closes the race the JS check above cannot: the
  // send job can fire between reading the row and updating it, and without this
  // both would succeed — the customer receives the text AND the operator is
  // told it was canceled. Zero rows means the job won.
  const { data: canceled, error: uerr } = await ctx.supabase
    .from("messages")
    .update({ status: "canceled" })
    .eq("id", msg.id)
    .eq("status", "queued")
    .select("id");
  if (uerr) throw new Error(uerr.message);
  if (!canceled || canceled.length === 0) {
    throw new AppError("conflict", "Too late — this message went out while you were canceling it.");
  }

  await cancelKindFor(msg.tenant_id, "outbound_send", "message_id", msg.id);
  const decisionId = await recordDecision(ctx, msg.tenant_id, "message", msg.id, "cancel_send");
  return { status: "canceled", decision_id: decisionId };
});
