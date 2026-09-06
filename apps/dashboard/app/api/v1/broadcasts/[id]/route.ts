import { withRoute, memberContext } from "@/server/with-route";
import { requireUuid } from "@/server/request-guards";
import { getBroadcast } from "@/server/broadcasts";

/**
 * GET /api/v1/broadcasts/:id — one broadcast and every person on it: who
 * got it (and whether WhatsApp says delivered or read), who was held back
 * and why, who it could not reach. Every number on the Broadcasts page is a
 * row's; this is the page that shows the rows. Members read, under RLS.
 */
export const GET = withRoute(async (req, ctx) => {
  const id = requireUuid(ctx.params.id, "broadcast");
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  return await getBroadcast(ctx, tenantId, id);
});
