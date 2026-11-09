import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { answerOf, refusalOf, recordLeadExcluded } from "@/server/leads/leads";
import { excludeFoundLead } from "@/server/leads/search-acts";
import { DbFailure } from "@chanlytics/contracts";

const Body = z.object({ search_id: z.uuid() });

/** POST /api/v1/leads/:id/exclude: the owner leaves a place out of Needs review. Free; undoable through its operation record. */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_member",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const leadId = requireUuid(ctx.params.id, "lead");
    const { data, error } = await excludeFoundLead(ctx, {
      p_search_id: input.search_id,
      p_lead_id: leadId,
    });
    if (error) throw new DbFailure(error, "lead_member_exclude");
    const answer = answerOf(data);
    const refused = refusalOf(answer);
    if (refused) throw refused;
    await recordLeadExcluded({ tenantId: member.tenantId, leadId, searchId: input.search_id, by: ctx.userId });
    return { lead_id: leadId, op_id: answer.op_id, version: answer.version };
  },
});
