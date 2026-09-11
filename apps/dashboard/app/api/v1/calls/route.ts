import { z } from "zod";
import { read, workspace } from "@/server/route";
import { CALL_COLUMNS, toCallDto } from "@/server/dto";
import { requireUuid } from "@/server/request-guards";
import type { CallDto } from "@chanlytics/contracts";

const Query = z.object({
  /** Narrow to one thread's calls. */
  conversation_id: z.string().optional(),
  /** Narrow to one lifecycle state. */
  status: z.string().optional(),
});

/**
 * GET /api/v1/calls — one workspace's phone calls, newest first, narrowed to
 * one thread or one lifecycle state when asked. The recording's storage path
 * and provider URL never leave the server (CALL_COLUMNS, toCallDto): audio is
 * reachable only through /api/v1/calls/:id/recording, a five-minute signed URL.
 */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const tenantId = member.tenantId;
    let q = ctx.supabase
      .from("calls")
      .select(CALL_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(100);
    if (input.conversation_id) q = q.eq("conversation_id", requireUuid(input.conversation_id, "conversation"));
    if (input.status) q = q.eq("status", input.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const calls: CallDto[] = (data ?? []).map(toCallDto);
    return { calls };
  },
});
