import { withRoute, memberContext } from "@/server/with-route";
import { CALL_COLUMNS, toCallDto } from "@/server/dto";
import { requireUuid } from "@/server/request-guards";
import type { CallDto } from "@chanlytics/contracts";

/**
 * GET /api/v1/calls — one workspace's phone calls, newest first.
 *
 * `?conversation_id=` narrows to one thread, `?status=` to one lifecycle
 * state. storage_path and provider_url never leave the server; audio is
 * reachable only through /api/v1/calls/:id/recording (a 5-minute signed URL).
 */
export const GET = withRoute(async (req, ctx) => {
  const { supabase } = ctx;
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation_id");
  const status = url.searchParams.get("status");
  const { tenantId } = await memberContext(ctx, url.searchParams.get("workspace"));

  let q = supabase
    .from("calls")
    .select(CALL_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (conversationId) q = q.eq("conversation_id", requireUuid(conversationId, "conversation"));
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const calls: CallDto[] = (data ?? []).map(toCallDto);
  return { calls };
});
