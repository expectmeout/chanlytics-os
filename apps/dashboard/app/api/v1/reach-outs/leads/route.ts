import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { leadLinesOf, leadTimelineOf } from "@/server/campaigns/reach-out-leads";

/**
 * GET /api/v1/reach-outs/leads?search= — Leads while a reach-out writes (Reach out Part 6, H8): the open search's
 * chain, its strip's facts and a line per lead it has written to or planned, with the chain as Playbooks reads it.
 * GET /api/v1/reach-outs/leads?lead= — one lead's story (H9): its emails, its readings, and whether it may be stopped,
 * for its peek. Exactly one of the two. Any member.
 */
export const GET = read({
  scope: workspace,
  query: z.object({ search: z.string().uuid().optional(), lead: z.string().uuid().optional() }),
  handle: async ({ ctx, member, input }) => {
    if (!!input.search === !!input.lead) throw new AppError("validation", "Ask for one search or one lead.");
    if (input.search) return leadLinesOf(ctx, member.tenantId, input.search);
    return { lines: null, chain: null, timeline: await leadTimelineOf(ctx, member.tenantId, input.lead!) };
  },
});
