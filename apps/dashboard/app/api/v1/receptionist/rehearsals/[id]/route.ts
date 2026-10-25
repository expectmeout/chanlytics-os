import { read, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import { rehearsal } from "@/server/readers/settings";

/**
 * GET /api/v1/receptionist/rehearsals/:id — one rehearsal of the workspace the tab named (decision 0069): its words so
 * far or whole, its end, its review and its fixes. The body is its reader's (readers/rehearsals.ts).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const id = requireUuid(ctx.params.id, "rehearsal");
    return (await load(readerContext(ctx, member), rehearsal, { id })).data;
  },
});
