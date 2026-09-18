import { read, workspace } from "@/server/route";

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
    const { data, error } = await ctx.supabase
      .from("memberships")
      .select("views")
      .eq("tenant_id", member.tenantId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const views = data?.views && typeof data.views === "object" && !Array.isArray(data.views) ? (data.views as Record<string, unknown>) : {};
    return { views };
  },
});
