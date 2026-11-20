import { write, workspace } from "@/server/shared/route";
import { AdPausedCheckBodySchema } from "@/server/ads/draft-shape";
import { runPausedAdCheck } from "@/server/ads/paused-check";

/** The edge's calls to Meta run one after another inside this minute (server/ads/paused-check.ts). */
export const maxDuration = 60;

/**
 * POST /api/v1/ads/check — the paused-ad check (the Ads plan's step 4): the owner's New ad draft, judged as its
 * screen judges it, sent to Meta once as dry runs, then made paused and read back on the owner's own ad account. It
 * spends nothing: every part is made paused and the campaign stays paused. It answers what Meta did at each step. The
 * owner alone, where this deployment's switch is live for the workspace.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  input: AdPausedCheckBodySchema,
  handle: ({ ctx, member, input }) => runPausedAdCheck(ctx, member, input),
});
