import { z } from "zod";
import { LeadSearchPlanSchema, SPEND_LEADS, type LeadSearchPlan } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { answerOf, estimateForRound, refusalOf, searchRow } from "@/server/leads";

const Body = z.object({
  purpose: z.enum(["topup", "renew"]),
  plan: LeadSearchPlanSchema,
});

/**
 * POST /api/v1/lead-searches/:id/more: a new round on an ended search (a
 * top-up, Find new ones, Carry on, Try again). The owner alone, a workspace
 * that may spend, through the same reservation path as create (E2).
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
    const plan = input.plan as LeadSearchPlan;
    const { data, error } = await ctx.supabase.rpc("lead_search_more", {
      p_search_id: search.id,
      p_purpose: input.purpose,
      p_plan: plan as unknown as Json,
      p_estimate_usd: estimateForRound(plan, input.purpose, search.counted),
    });
    if (error) throw new Error(`lead_search_more: ${error.message}`);
    const a = answerOf(data);
    const refused = refusalOf(a);
    if (refused) throw refused;
    return { search_id: search.id, round_id: a.round_id };
  },
});
