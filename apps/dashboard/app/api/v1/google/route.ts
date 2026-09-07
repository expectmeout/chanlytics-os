import { withRoute, memberContext } from "@/server/with-route";
import type { GoogleDto } from "@chanlytics/contracts";
import { googleFor, googleReadiness } from "@/server/google";

/**
 * GET /api/v1/google — the workspace's listing on Google as the edge last
 * read it: whether listings can be looked up here at all, the listing, the
 * latest reviews Google showed, and the day-by-day rating and count for
 * the period charts. Members read; the role rides along so the pages know
 * who may link and who may only look.
 */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const [data, ready] = await Promise.all([googleFor(ctx.supabase, member.tenantId), googleReadiness()]);
  const google: GoogleDto = { ready, ...data, role: member.role };
  return { google };
});
