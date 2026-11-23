import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { contentWeek } from "@/server/readers/results";

/**
 * GET /api/v1/content/week: the last seven days' line of what the business's posts brought (00692; the content loop
 * PRD's 9.3, 12.5): posts up, reached as the places report it, conversations, booked from a post and it helped, which
 * Today's weekly card says. Any member. The body is its reader's (readers/results.ts contentWeek).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), contentWeek, undefined)).data,
});
