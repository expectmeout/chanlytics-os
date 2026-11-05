import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { leadWords } from "@/server/readers/leads";
import { requireUuid } from "@/server/request-guards";

/**
 * GET /api/v1/leads/:id/words — the lead's own words at each step that has some (decision 0096): what the sheet's email
 * says in place of the step's. Any member; under the caller's row security.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) =>
    (await load(readerContext(ctx, member), leadWords, { id: requireUuid(ctx.params.id, "lead") })).data,
});
