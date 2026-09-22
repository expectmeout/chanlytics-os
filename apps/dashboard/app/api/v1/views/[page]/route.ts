import { z } from "zod";
import type { Json } from "@chanlytics/db";
import { AppError } from "@chanlytics/contracts";
import { workspace, write } from "@/server/route";

const PAGE = /^[a-z][a-z0-9_-]{0,31}$/;
const Body = z.object({ view: z.record(z.string(), z.unknown()) });

/**
 * PUT /api/v1/views/:page -- { view }
 *
 * A page remembering how this member left it, in this workspace: the People
 * page's sort and columns today, sent whole, since a save replaces the page's
 * view. Any member, one small object, through
 * member_view_set (00113), which judges the caller's own membership. The
 * whole set comes back so the caller holds what the row holds.
 */
export const PUT = write({
  scope: workspace,
  role: "viewer",
  rate: "view_set",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const page = String(ctx.params.page ?? "");
    if (!PAGE.test(page)) throw new AppError("validation", "A page is a short lowercase name.");
    if (JSON.stringify(input.view).length > 2000) throw new AppError("validation", "A view is a small object.");
    const { data, error } = await ctx.supabase.rpc("member_view_set", {
      p_tenant_id: member.tenantId,
      p_page: page,
      p_view: input.view as Json,
    });
    if (error) throw new AppError("validation", error.message);
    return { views: (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown> };
  },
});
