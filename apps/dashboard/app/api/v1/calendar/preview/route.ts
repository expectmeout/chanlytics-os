import { AppError } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { jsonBody } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { tenantFacts } from "@/server/tenant";
import { previewFeed } from "@/server/calendar";

/**
 * POST /api/v1/calendar/preview — { url }. A calendar feed checked before it
 * is saved: reached, read as iCal, and its next few taken blocks in the
 * business's own zone — so a wrong address is caught here, not discovered
 * weeks later as a receptionist that never names an open time. Owner or
 * operator; nothing is stored.
 */
export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  takeRate(ctx.userId, "settings");
  const body = (await jsonBody(req)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) throw new AppError("validation", "Paste the calendar's iCal address first.");
  const { timezone } = await tenantFacts(ctx.supabase, member.tenantId);
  return await previewFeed(url, timezone);
});
