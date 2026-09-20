import { LeadSearchPlanSchema, type LeadSearchPlan } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { read, write, workspace } from "@/server/route";
import { answerOf, estimateForRound, listSearches, refusalOf } from "@/server/leads";

/**
 * GET /api/v1/lead-searches: every search of this workspace with its latest
 * round (lead_searches_view), newest first. Release A has no screen; the
 * internal runner reads this.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => ({ searches: await listSearches(ctx, member.tenantId) }),
});

/**
 * POST /api/v1/lead-searches: a plan becomes a search and its first round.
 *
 * The owner alone (it spends: PRD decision 6), on a workspace that may spend
 * (402 before anything else), counted against `lead_search`. The body is the
 * validated plan; the route computes what the round is expected to cost from
 * the card's brief prices and hands it to the door, which reserves the
 * month's leads and budget in the same transaction as the round row (E2) and
 * refuses in a word the route says as a sentence: paused, this month's leads,
 * the budget, today's cap.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "lead_search",
  spend: true,
  input: LeadSearchPlanSchema,
  handle: async ({ ctx, member, input }) => {
    const plan = input as LeadSearchPlan;
    const { data, error } = await ctx.supabase.rpc("lead_search_create", {
      p_tenant_id: member.tenantId,
      p_plan: plan as unknown as Json,
      p_via: ctx.via === "ask" ? "ask" : "people",
      p_estimate_usd: estimateForRound(plan, "probe"),
    });
    if (error) throw new Error(`lead_search_create: ${error.message}`);
    const a = answerOf(data);
    const refused = refusalOf(a);
    if (refused) throw refused;
    return { search_id: a.search_id, round_id: a.round_id };
  },
});
