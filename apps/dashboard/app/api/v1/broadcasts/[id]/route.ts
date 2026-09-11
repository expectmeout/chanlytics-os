import { read, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { getBroadcast } from "@/server/broadcasts";

/** GET /api/v1/broadcasts/:id — one broadcast with its recipients, in the workspace the tab named. */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const id = requireUuid(ctx.params.id, "broadcast");
    const tenantId = member.tenantId;
    return await getBroadcast(ctx, tenantId, id);
  },
});
