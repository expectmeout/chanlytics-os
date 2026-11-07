import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { leadEmails } from "@/server/readers/leads";
import { requireUuid } from "@/server/shared/request-guards";

/**
 * GET /api/v1/leads/:id/emails — the lead's own emails (decision 0094), oldest first: each one a member sent from a
 * mailbox or said they sent themselves. Any member; under the caller's row security. History's rows are read from it.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) =>
    (await load(readerContext(ctx, member), leadEmails, { id: requireUuid(ctx.params.id, "lead") })).data,
});
