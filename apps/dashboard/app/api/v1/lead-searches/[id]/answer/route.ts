import { z } from "zod";
import { AppError, LeadSearchPlanSchema } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { answerOf, answerPlanOf, refusalOf, searchRow } from "@/server/leads";

const Body = z.object({
  answer: z.enum(["keep", "include", "stop"]),
  /** The amended plan, for "include": the plan the owner approved (PRD §7.2); its version and count are the route's. */
  plan: LeadSearchPlanSchema.optional(),
});

/**
 * POST /api/v1/lead-searches/:id/answer: the owner answers the question after
 * 25. Keep goes on; Include amends the plan and re-judges what that criterion
 * left out; Stop ends the round. The door (lead_round_answer) takes the
 * search's latest round and refuses when it is not waiting. Include amends
 * the plan: the route sets its version (the round's + 1) and count (the count
 * the search's plan reserved), so a client never computes them.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_answer",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const search = await searchRow(ctx, member.tenantId, requireUuid(ctx.params.id, "search"));
    if (!search.round_id) throw new AppError("conflict", "This search has no round to answer for.", 409);
    if (input.answer === "include" && !input.plan) throw new AppError("validation", "Include needs the amended plan.");
    const { data, error } = await ctx.supabase.rpc("lead_round_answer", {
      p_round_id: search.round_id,
      p_answer: input.answer,
      ...(input.plan ? { p_plan: answerPlanOf(search, input.plan) as unknown as Json } : {}),
    });
    if (error) throw new Error(`lead_round_answer: ${error.message}`);
    const refused = refusalOf(answerOf(data));
    if (refused) throw refused;
    return { round_id: search.round_id, answered: input.answer };
  },
});
