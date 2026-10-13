import { read, workspace } from "@/server/route";
import { reachOutSourcesOf } from "@/server/leads/lead-workbench";

/**
 * GET /api/v1/reach-outs/sources — what a reach-out could start from (00423 reach_out_sources): the newest searches and
 * lists with no reach-out yet that have someone it would write to, each with how it was made and how many it would
 * write to now. Campaigns' New message, Write to leads, lists them. Any member.
 */
export const GET = read({
  scope: workspace,
  handle: ({ ctx, member }) => reachOutSourcesOf(ctx, member.tenantId),
});
