import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { answerOf, refusalOf, recordLeadPutBack } from "@/server/leads/leads";
import { putLeadBack } from "@/server/leads/search-acts";

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
  handle: async ({ ctx, member, input }) => {
    const leadId = requireUuid(ctx.params.id, "lead");
    const { data, error } = await putLeadBack(ctx, {
      p_search_id: input.search_id,
      p_lead_id: leadId,
    });
    if (error) throw new Error(`lead_member_put_back: ${error.message}`);
    const answer = answerOf(data);
    const refused = refusalOf(answer);
    if (refused) throw refused;
    await recordLeadPutBack({ tenantId: member.tenantId, leadId, searchId: input.search_id, by: ctx.userId });
    return { lead_id: leadId, op_id: answer.op_id, version: answer.version };
  },
});
