import { z } from "zod";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { answerOf, refusalOf } from "@/server/leads/leads";

const Body = z.object({ search_id: z.string().uuid() });

/**
 * POST /api/v1/leads/:id/keep: the owner keeps a place from Needs review. It
 * counts, as Qualified, through the same reservation door as a search (E2):
 * the door refuses this month's 501st in a sentence.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "lead_member",
  input: Body,
  handle: async ({ ctx, input }) => {
    const leadId = requireUuid(ctx.params.id, "lead");
    const { data, error } = await ctx.supabase.rpc("lead_member_keep", {
      p_search_id: input.search_id,
      p_lead_id: leadId,
    });
    if (error) throw new Error(`lead_member_keep: ${error.message}`);
    const a = answerOf(data);
    const refused = refusalOf(a);
    if (refused) throw refused;
    return { lead_id: leadId, op_id: a.op_id, version: a.version };
  },
});
