import { AppError, asTenantId } from "@chanlytics/contracts";
import { row } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";

/** The message a held-send door acts on, read as its caller may read it. */
export const theMessage = row(async (ctx, params) => {
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
