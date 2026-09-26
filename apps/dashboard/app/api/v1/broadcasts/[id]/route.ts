import { read, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import { broadcast } from "@/server/readers/broadcasts";

/**
 * GET /api/v1/broadcasts/:id — one broadcast with its recipients, in the workspace the tab named. The body is its
 * reader's (readers/broadcasts.ts).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const id = requireUuid(ctx.params.id, "broadcast");
    return (await load(readerContext(ctx, member), broadcast, { id })).data;
  },
});
