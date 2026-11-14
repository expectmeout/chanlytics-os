import { SPEND_LEADS, DbFailure, type LeadSearchPlan } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { answerOf, estimateForRound, refusalOf, searchRow } from "@/server/leads/leads";
import { refuseList } from "@/server/leads/lists";
import { askOnRenewal } from "@/server/leads/search-acts";

/**
 * POST /api/v1/lead-searches/:id/renewal: Find them when the leads renew (decision 0133). A search the month's leads
 * stopped carries on for the rest of its count from the workspace's next month: its leads are reserved from that month
 * now, and its round starts at midnight on its first day. The plan is the one the owner approved; the press says the
 * day. A partner or the owner, a workspace that may spend, through the same reservation as every round.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_search",
  spend: true,
  spendWords: SPEND_LEADS,
  handle: async ({ ctx, member }) => {
    const search = await searchRow(ctx, member.tenantId, requireUuid(ctx.params.id, "search"));
    refuseList(search);
    const plan = search.plan as LeadSearchPlan;
    const { data, error } = await askOnRenewal(ctx, {
      p_search_id: search.id,
      p_estimate_usd: estimateForRound(plan, "topup", search.counted),
    });
    if (error) throw new DbFailure(error, "lead_search_on_renewal");
    const answer = answerOf(data);
    const refused = refusalOf(answer);
    if (refused) throw refused;
    return { search_id: search.id, round_id: answer.round_id, starts_at: answer.starts_at };
  },
});
