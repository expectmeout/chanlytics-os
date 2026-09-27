import type { BillingDto } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { billingFor, billingReadiness } from "@/server/workspace/billing";

/**
 * GET /api/v1/billing — the workspace's billing row as a member may read it
 * (RLS), whether this deployment can charge and on which of Stripe's keys,
 * live or test, and the plan as Stripe states it. The page draws its buttons
 * from the session's own role (canDo).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const [account, ready] = await Promise.all([billingFor(ctx.supabase, member.tenantId), billingReadiness()]);
    const billing: BillingDto = {
      ready: ready.ready,
      livemode: ready.livemode,
      account,
      price: ready.price,
      trial_days: ready.trial_days,
    };
    return { billing };
  },
});
