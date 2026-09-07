import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";
import { BILLING_SAID, edgeBilling } from "@/server/billing";

/**
 * POST /api/v1/billing/checkout — the way to Stripe Checkout for this
 * workspace: a card, the trial, and back to Billing with the outcome.
 * Owners only; the edge makes the session and answers with its URL, and
 * the browser leaves the app for Stripe's page.
 */
export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  await takeRate(ctx.userId, "billing");
  const a = await edgeBilling({ op: "checkout", tenant_id: member.tenantId, email: ctx.email ?? null }, 25_000);
  const b = a.body ?? {};
  if (a.status !== 200 || b.ok !== true || typeof b.url !== "string") {
    const reason = typeof b.error === "string" ? b.error : "failed";
    throw new AppError(a.status === 409 ? "conflict" : a.status === 503 ? "upstream_auth" : "internal", BILLING_SAID[reason] ?? `Checkout could not be opened (${reason}).`, a.status === 409 ? 409 : a.status === 503 ? 503 : 502);
  }
  return { url: b.url };
});
