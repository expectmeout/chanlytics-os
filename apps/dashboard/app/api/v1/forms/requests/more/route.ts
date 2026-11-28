import { z } from "zod";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { formRequestsMore } from "@/server/readers/forms/forms";

/**
 * GET /api/v1/forms/requests/more?after=<id>: the requests nobody has answered past those a list holds (00726). Needs
 * you's list stops at 200 while its count has no cap; this reads on from the request the list ended on (`after`, its
 * id): the next 200 older than it, in the list's own order, so every counted request can be reached. Any member. The
 * body is its reader's (readers/forms.ts formRequestsMore).
 */
export const GET = read({
  scope: workspace,
  query: z.object({ after: z.uuid() }),
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), formRequestsMore, input)).data,
});
