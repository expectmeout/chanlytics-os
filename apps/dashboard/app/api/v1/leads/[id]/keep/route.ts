import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { answerOf, refusalOf } from "@/server/leads/leads";
import { keepFoundLead } from "@/server/leads/search-acts";
import { DbFailure } from "@chanlytics/contracts";

const Body = z.object({ search_id: z.uuid() });

/**
 * POST /api/v1/leads/:id/keep: the owner keeps a place from Needs review. It
 * counts, as Qualified, through the same reservation door as a search (E2):
 * the door refuses this month's 501st in a sentence.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_member",
  input: Body,
  handle: async ({ ctx, input }) => {
    const leadId = requireUuid(ctx.params.id, "lead");
    const { data, error } = await keepFoundLead(ctx, {
      p_search_id: input.search_id,
      p_lead_id: leadId,
    });
    if (error) throw new DbFailure(error, "lead_member_keep");
    const answer = answerOf(data);
    const refused = refusalOf(answer);
    if (refused) throw refused;
    // The door wrote the member's word on the ledger beside its operation row (lead.kept, 00718).
    return { lead_id: leadId, op_id: answer.op_id, version: answer.version };
  },
});
