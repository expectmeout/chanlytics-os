import { read, workspace } from "@/server/route";
import { linesFor, linesStatus } from "@/server/lines";

/** GET /api/v1/lines — the workspace's lines as the page may see them, and whether this deployment can get one. */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const [lines, status] = await Promise.all([linesFor(ctx.supabase, member.tenantId), linesStatus()]);
    return { lines, ready: status.ready, provider: status.provider, costs: status.costs };
  },
});
