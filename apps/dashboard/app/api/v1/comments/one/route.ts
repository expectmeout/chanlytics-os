import { z } from "zod";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { commentOne } from "@/server/readers/results";

/**
 * GET /api/v1/comments/one?id=<touch id>: one comment on a post, with the post it is under and its public answer
 * (00692). Any member. The body is its reader's (readers/results.ts commentOne).
 */
export const GET = read({
  scope: workspace,
  query: z.object({ id: z.uuid() }),
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), commentOne, input)).data,
});
