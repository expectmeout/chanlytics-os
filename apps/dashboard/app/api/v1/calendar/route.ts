import { withRoute, memberContext } from "@/server/with-route";
import { takeRate } from "@/server/rate-limit";
import { calendarWeek } from "@/server/calendar";

/**
 * GET /api/v1/calendar?from=YYYY-MM-DD&days=7 — the calendar as the
 * receptionist reads it: what the feed says is taken, the hours and
 * closures, and the windows a caller would be offered, for one span of
 * days by the business's clock. `from` defaults to the Monday of today.
 * Read-only; the feed's address never leaves the server.
 */
export const GET = withRoute(async (req, ctx) => {
  takeRate(ctx.userId, "aggregate");
  const url = new URL(req.url);
  const member = await memberContext(ctx, url.searchParams.get("workspace"));
  const from = url.searchParams.get("from");
  const days = Number(url.searchParams.get("days") ?? 7);
  // An owner or operator opening the board puts the people its appointments
  // name in People; a viewer's read changes nothing.
  const canAct = member.role === "owner" || member.role === "operator";
  return { calendar: await calendarWeek(ctx, member.tenantId, { from, days }, new Date(), { canAct }) };
});
