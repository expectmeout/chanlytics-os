import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { leadWords } from "@/server/readers/leads";
import { requireUuid } from "@/server/shared/request-guards";

/**
 * GET /api/v1/leads/:id/words — the lead's own words at each step that has some (decision 0096): what the sheet's email
 * says in place of the step's. Any member; under the caller's row security.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) =>
    (await load(readerContext(ctx, member), leadWords, { id: requireUuid(ctx.params.id, "lead") })).data,
});
