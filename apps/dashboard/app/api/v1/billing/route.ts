import { withRoute, memberContext } from "@/server/with-route";
import type { BillingDto } from "@chanlytics/contracts";
import { billingFor, billingReadiness } from "@/server/billing";

/**
 * GET /api/v1/billing — how this workspace pays, as the edge last wrote it:
 * whether this deployment can charge at all, the row (mode, Stripe's own
 * status, the dates, the card's brand and last four — never an id Stripe
 * could act on), and the plan as Stripe states it. Members read; the role
 * rides along so the pane knows who may start or manage a subscription.
 */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const [account, ready] = await Promise.all([billingFor(ctx.supabase, member.tenantId), billingReadiness()]);
  const billing: BillingDto = { ready: ready.ready, account, price: ready.price, trial_days: ready.trial_days, role: member.role };
  return { billing };
});
