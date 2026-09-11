import { z } from "zod";
import { read, workspace } from "@/server/route";

const Query = z.object({
  state: z.string().optional(),
});

/** GET /api/v1/escalations?state=open — the workspace's escalations in one state (open by default), newest first. */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const { supabase } = ctx;
    const state = input.state ?? "open";
    const tenantId = member.tenantId;
    const { data, error } = await supabase
      .from("escalations")
      .select("id, reason, details, state, created_at, conversation_id")
      .eq("tenant_id", tenantId)
      .eq("state", state)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { escalations: data ?? [] };
  },
});
