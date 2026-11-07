import { z } from "zod";
import { read, workspace } from "@/server/shared/route";
import { getReach } from "@/server/campaigns/reach-outs/chain-acts";

/**
 * GET /api/v1/reach-outs/reach?search= — a search's reach, for the sheet and the Leads door: who a chain over it
 * would write to, who waits on an unconfirmed address, who has only a phone, and its chain when it has one. Any member.
 */
export const GET = read({
  scope: workspace,
  query: z.object({ search: z.string().uuid() }),
  handle: ({ ctx, member, input }) => getReach(ctx, member.tenantId, input.search),
});
