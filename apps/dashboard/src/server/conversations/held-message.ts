import { AppError, asTenantId } from "@chanlytics/contracts";
import { row } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { findMessageState } from "@chanlytics/db/conversations";

/** The message a held-send door acts on, read as its caller may read it. */
export const theMessage = row(async (ctx, params) => {
  const id = requireUuid(params.id, "message");
  const { data: msg, error } = await findMessageState(ctx.supabase, id);
  if (error) throw new Error(error.message);
  if (!msg) throw new AppError("not_found", "Message not found.");
  return { ...msg, tenant_id: asTenantId(msg.tenant_id) };
});
