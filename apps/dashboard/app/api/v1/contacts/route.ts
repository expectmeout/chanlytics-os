import { withRoute, memberContext } from "@/server/with-route";
import type { PersonRowDto } from "@chanlytics/contracts";

/**
 * GET /api/v1/contacts — everyone who has written to or phoned this workspace.
 *
 * One row per live person (never erased, never merged) with the facts the
 * People surface renders, computed in SQL by `people_list` under the caller's
 * own RLS. The state a person is in is NOT decided here: the view model
 * derives it from these facts, so the rule lives in one tested place.
 *
 * Pilot scale: one call, capped at 1000 rows in the function. Search and
 * paging arrive with volume.
 */
export const GET = withRoute(async (req, ctx) => {
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const { data, error } = await ctx.supabase.rpc("people_list", { p_tenant_id: tenantId });
  if (error) throw new Error(error.message);
  return { people: (data ?? []) as PersonRowDto[] };
});
