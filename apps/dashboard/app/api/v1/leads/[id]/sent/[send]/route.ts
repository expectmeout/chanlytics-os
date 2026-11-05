import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { leadSent } from "@/server/readers/leads";
import { requireUuid } from "@/server/request-guards";

/**
 * GET /api/v1/leads/:id/sent/:send — what one send of a lead's said as it went: its subject and its words, or null where
 * it wrote none. What a step that went shows on the lead's sheet (decision 0096). Any member; under the caller's row
 * security.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) =>
    (
      await load(readerContext(ctx, member), leadSent, {
        id: requireUuid(ctx.params.id, "lead"),
        send: requireUuid(ctx.params.send, "send"),
      })
    ).data,
});
