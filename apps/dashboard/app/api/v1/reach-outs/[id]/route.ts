import { ReachOutChainSchema } from "@chanlytics/contracts";
import { read, write } from "@/server/route";
import { reachOutScope } from "@/server/verbs";
import { chainReportOf, reachOf, removeChain, saveChain } from "@/server/reach-outs";

/**
 * One reach-out, by its first step (reachOutScope: read under RLS, so one the caller cannot see is a 404).
 *
 * GET    /api/v1/reach-outs/:id — its report: each step counted once, its last runs, whether it may be removed
 *        (R16, R23), and its search's reach. Any member.
 * PUT    /api/v1/reach-outs/:id — the chain edited whole (R15): new words or a new name to sign with send what is
 *        planned or held for a step back to the check (R5); a step dropped takes its work with it (R17).
 * DELETE /api/v1/reach-outs/:id — removed, only before its first email goes (R16); after that it is paused.
 */
export const GET = read({
  scope: reachOutScope,
  handle: async ({ ctx, member, row }) => {
    const [report, reach] = await Promise.all([
      chainReportOf(ctx, member.tenantId, row.id),
      row.lead_search_id ? reachOf(ctx, member.tenantId, row.lead_search_id) : Promise.resolve(null),
    ]);
    return { report, reach };
  },
});

export const PUT = write({
  scope: reachOutScope,
  role: "operator",
  rate: "playbook",
  input: ReachOutChainSchema,
  handle: ({ ctx, member, row, input }) => saveChain(ctx, member, input, row.id),
});

export const DELETE = write({
  scope: reachOutScope,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, member, row }) => removeChain(ctx, member, row),
});
