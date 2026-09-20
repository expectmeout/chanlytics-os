import { read, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { searchRow } from "@/server/leads";

/** GET /api/v1/lead-searches/:id: one search with its latest round, as lead_searches_view says it. */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => ({ search: await searchRow(ctx, member.tenantId, requireUuid(ctx.params.id, "search")) }),
});
