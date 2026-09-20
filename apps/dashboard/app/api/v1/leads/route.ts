import { z } from "zod";
import { read, workspace } from "@/server/route";

export const LEADS_PAGE = 200;

const Query = z.object({
  search: z.string().uuid(),
  class: z.enum(["qualified", "review", "excluded"]).optional(),
  sort: z.enum(["found", "fit", "distance"]).optional(),
  /** The last row's key from the page before, as `leads_page` handed it back. */
  after: z.string().max(200).optional(),
  /** 00140 clamps the page at 500; asking for more than the door will give is not a page size. */
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * GET /api/v1/leads?search=…: a search's members joined to their leads,
 * keyset-paged on the sort key by `leads_page` under the caller's own RLS;
 * `class` is a filter. Release A reads it from the internal runner; release
 * B's Leads scope reads the same.
 */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const q = input as z.infer<typeof Query>;
    const { data, error } = await ctx.supabase.rpc("leads_page", {
      p_tenant_id: member.tenantId,
      p_search_id: q.search,
      ...(q.class ? { p_class: q.class } : {}),
      p_sort: q.sort ?? "found",
      ...(q.after ? { p_after_key: q.after } : {}),
      p_limit: q.limit ?? LEADS_PAGE,
    });
    if (error) throw new Error(`leads_page: ${error.message}`);
    return data;
  },
});
