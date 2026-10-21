import { read, platform } from "@/server/route";
import { SupportQuerySchema } from "@chanlytics/contracts";
import { consoleSupport } from "@/server/platform/support";

/**
 * GET /api/v1/platform/support?view=needs|waiting|done&kind=&topic=&workspace=&q=&page= — Support's queue (decision
 * 0067): the questions and setup asks of the last ninety days, one view of them narrowed as its tools say, late first
 * then the oldest, `page` pages of fifty. The rows come back as their own records with the counts the tools say, how
 * many bug reports went to Health this week, how fast we answered, and the inbox's search address. The replies are the
 * inbox's.
 */
export const GET = read({
  scope: platform,
  query: SupportQuerySchema,
  handle: async ({ office, input }) =>
    consoleSupport(office, {
      view: input.view,
      kind: input.kind,
      topic: input.topic ?? null,
      workspace: input.workspace ?? null,
      q: input.q,
      page: input.page,
    }),
});
