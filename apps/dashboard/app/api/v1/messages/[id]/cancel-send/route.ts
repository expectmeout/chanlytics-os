import { AppError, asTenantId } from "@chanlytics/contracts";
import { cancelSend } from "@chanlytics/core";
import { write, row } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { cancelSendPorts } from "@/server/ports/core-ports";

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
  return { ...msg, tenant_id: asTenantId(msg.tenant_id) };
});

/** The honest undo (§6): inside the grace window a queued send cancels cleanly; after fire it is out, and this says so. */
export const POST = write({
  scope: theMessage,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: msg }) => cancelSend(cancelSendPorts(ctx), { msg }),
});
