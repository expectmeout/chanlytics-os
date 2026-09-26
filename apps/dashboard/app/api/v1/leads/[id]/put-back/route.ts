import { z } from "zod";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { answerOf, refusalOf } from "@/server/leads";

const Body = z.object({ search_id: z.string().uuid() });

/**
 * POST /api/v1/leads/:id/put-back: the owner's override of an exclusion,
 * through keep's path (it counts). Never revives a hidden place or one
 * outside the area: the door refuses both in a sentence.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_member",
  input: Body,
  handle: async ({ ctx, input }) => {
    const leadId = requireUuid(ctx.params.id, "lead");
    const { data, error } = await ctx.supabase.rpc("lead_member_put_back", {
      p_search_id: input.search_id,
      p_lead_id: leadId,
    });
    if (error) throw new Error(`lead_member_put_back: ${error.message}`);
    const a = answerOf(data);
    const refused = refusalOf(a);
    if (refused) throw refused;
    return { lead_id: leadId, op_id: a.op_id, version: a.version };
  },
});
