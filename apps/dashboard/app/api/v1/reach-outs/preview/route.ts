import { AppError, REACH_OUT_REFUSALS, ReachOutPreviewSchema, type ReachOutPreviewDto } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { previewReachOut } from "@/server/campaigns/reach-outs";

/**
 * POST /api/v1/reach-outs/preview — one business's email as the chain would write it: the edge writes its opening
 * with the check's own code and assembles it as the sender does (R11). It spends the model, so it may be refused for
 * billing (spend), has a bucket of its own (ten a minute), and counts in Ask's daily budget as a lead draft does
 * (R12). Owner or operator.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "reach_out_preview",
  spend: true,
  input: ReachOutPreviewSchema,
  handle: async ({ ctx, member, input }): Promise<{ preview: ReachOutPreviewDto }> => {
    const r = await previewReachOut(member.tenantId, ctx.userId, { ...input, language: input.language ?? "en" });
    if (r.ok) return { preview: r.preview as ReachOutPreviewDto };
    if (r.reason === "preview") throw new AppError("upstream_anthropic", REACH_OUT_REFUSALS.preview, 503);
    if (r.reason === "ask_budget") throw new AppError("rate_limited", REACH_OUT_REFUSALS.budget, 429);
    throw new AppError("upstream_anthropic", REACH_OUT_REFUSALS.previewDown, 502);
  },
});
