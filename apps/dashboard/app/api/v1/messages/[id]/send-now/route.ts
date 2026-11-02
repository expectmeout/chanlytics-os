import { AppError, asTenantId } from "@chanlytics/contracts";
import { sendNow } from "@chanlytics/core";
import { write, row } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { sendNowPorts } from "@/server/ports/core-ports";

/** The message being let go, read under RLS: one the caller cannot see is a 404. */
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

/** A held reply let go now (the thread canvas's Send now): its send job brought to the ledger's next tick. */
export const POST = write({
  scope: theMessage,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: msg }) => sendNow(sendNowPorts(ctx), { msg }),
});
