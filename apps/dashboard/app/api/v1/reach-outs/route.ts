import { ReachOutChainSchema } from "@chanlytics/contracts";
import { read, workspace, write } from "@/server/route";
import { chainsOf, saveChain } from "@/server/campaigns/reach-outs";

/**
 * The workspace's reach-outs (Reach out, Part 4).
 *
 * GET  /api/v1/reach-outs — every chain with its steps and what decides its next run, without its report (R23: the
 *      report is read when a row is opened). Any member.
 * POST /api/v1/reach-outs — a new chain over a search, saved whole by the service role after this route's role check
 *      and every word validated (R15), then its first run asked for now through the run-now door (R13); the answer
 *      says what that run did, with its reason (R14). Owner or operator.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => ({ chains: await chainsOf(ctx, member.tenantId) }),
});

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "playbook",
  input: ReachOutChainSchema,
  handle: ({ ctx, member, input }) => saveChain(ctx, member, input, null),
});
