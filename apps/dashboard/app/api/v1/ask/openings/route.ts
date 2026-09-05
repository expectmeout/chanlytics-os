import { withRoute, memberContext } from "@/server/with-route";
import { takeRate } from "@/server/rate-limit";
import { openingsFor } from "@/server/ask/openings";

/**
 * GET /api/v1/ask/openings?day=&service= — open times, no model.
 *
 * The palette's fast path for "what's open Saturday": the same computation
 * the phone receptionist's availability tool runs, answered from the
 * connected calendar in the business's own zone.
 */
export const GET = withRoute(async (req, ctx) => {
  takeRate(ctx.userId, "aggregate");
  const url = new URL(req.url);
  const { tenantId } = await memberContext(ctx, url.searchParams.get("workspace"));
  const day = (url.searchParams.get("day") ?? "").trim().slice(0, 20) || null;
  const service = (url.searchParams.get("service") ?? "").trim().slice(0, 160) || null;
  return { openings: await openingsFor(ctx, tenantId, { day, service }) };
});
