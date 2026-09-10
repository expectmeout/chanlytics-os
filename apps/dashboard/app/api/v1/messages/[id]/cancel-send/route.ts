import { AppError } from "@chanlytics/contracts";
import { write, row } from "@/server/route";
import { recordDecision } from "@/server/verbs";
import { cancelKindFor } from "@/server/service";
import { requireUuid } from "@/server/request-guards";

/** The message being called back, read under RLS: one the caller cannot see is a 404. */
const theMessage = row(async (ctx, params) => {
  const id = requireUuid(params.id, "message");
  const { data: msg, error } = await ctx.supabase
    .from("messages")
    .select("id, tenant_id, conversation_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!msg) throw new AppError("not_found", "Message not found.");
  return msg;
});

/** The honest undo (§6): inside the grace window a queued send cancels cleanly;
 *  after fire it is out, and this says so. */
export const POST = write({
  scope: theMessage,
  role: "operator",
  rate: "thread_state",
  handle: async ({ ctx, row: msg }) => {
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
  },
});
