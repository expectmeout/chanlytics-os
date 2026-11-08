import { z } from "zod";
import { LeadSearchPlanSchema, SPEND_LEADS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { answerOf, estimateForRound, morePlanOf, planAsJson, refusalOf, searchRow } from "@/server/leads/leads";
import { refuseList } from "@/server/leads/lists";
import { askForMore } from "@/server/leads/search-acts";

const Body = z.object({
  purpose: z.enum(["topup", "renew"]),
  plan: LeadSearchPlanSchema,
});

/**
 * POST /api/v1/lead-searches/:id/more: a new round on an ended search (a
 * top-up, Find new ones, Search again changed, Carry on, Try again). The owner
 * alone, a workspace that may spend, through the same reservation path as
 * create (E2).
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_search",
  spend: true,
  // A refusal here is about finding leads, not about buying a number.
  spendWords: SPEND_LEADS,
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const search = await searchRow(ctx, member.tenantId, requireUuid(ctx.params.id, "search"));
    // A list of your own (00242) is never searched again: a finder's plan never lands on it (J9).
    refuseList(search);
    const plan = morePlanOf(search, input.plan);
    const { data, error } = await askForMore(ctx, {
      p_search_id: search.id,
      p_purpose: input.purpose,
      p_plan: planAsJson(plan),
      p_estimate_usd: estimateForRound(plan, input.purpose, search.counted),
    });
    if (error) throw new Error(`lead_search_more: ${error.message}`);
    const answer = answerOf(data);
    const refused = refusalOf(answer);
    if (refused) throw refused;
    return { search_id: search.id, round_id: answer.round_id };
  },
});
