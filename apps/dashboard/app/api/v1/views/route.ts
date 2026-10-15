import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { memberViews } from "@/server/readers/notifications";

/**
 * GET /api/v1/views -- what this member's pages remember in this workspace.
 *
 * { views: { people: { sortBy, sortDir, columns }, ... } }, from the
 * member's own membership row (memberships_self_select). Any member: it is
 * their own view. Empty for a member who has changed nothing yet.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    return { views: (await load(readerContext(ctx, member), memberViews, undefined)).data };
  },
});
