import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";
import { edgeGoogle } from "@/server/google";

/**
 * DELETE /api/v1/google/connection — the Business Profile disconnected: the
 * grant given back to Google, the token gone from Vault, the profile's
 * reviews gone. The public listing stays. Owners only.
 */
export const DELETE = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  await takeRate(ctx.userId, "google_link");
  const a = await edgeGoogle({ op: "disconnect", tenant_id: member.tenantId }, 25_000);
  const b = a.body ?? {};
  if (a.status !== 200 || b.ok !== true) throw new AppError("internal", typeof b.error === "string" ? b.error : "The connection could not be removed. Try again.", 502);
  return { removed: b.removed === true, revoked: b.revoked === true };
});
