import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { answerOf, refusalOf, searchRow } from "@/server/leads/leads";

/**
 * POST /api/v1/lead-searches/:id/stop: an operator may stop a search. The
 * door bumps every live run's lease generation and schedules the abort; the
 * emails of leads already found are still checked (decision 17), and the
 * round ends "stopped" after the checks.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "lead_answer",
  handle: async ({ ctx, member }) => {
    const search = await searchRow(ctx, member.tenantId, requireUuid(ctx.params.id, "search"));
    const { data, error } = await ctx.supabase.rpc("lead_round_stop", { p_search_id: search.id });
    if (error) throw new Error(`lead_round_stop: ${error.message}`);
    const refused = refusalOf(answerOf(data));
    if (refused) throw refused;
    return { search_id: search.id, stopping: true };
  },
});
