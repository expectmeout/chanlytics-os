import type { BillingDto } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { billingFor, billingReadiness, callMinutesThisMonth, modelStandingFor } from "@/server/workspace/billing";

/**
 * GET /api/v1/billing — the workspace's billing row as a member may read it
 * (RLS), whether this deployment can charge and on which of Stripe's keys,
 * live or test, and the plan as Stripe states it. The page draws its buttons
 * from the session's own role (canDo).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const [account, ready, minutes, modelStanding] = await Promise.all([
      billingFor(ctx.supabase, member.tenantId),
      billingReadiness(),
      callMinutesThisMonth(ctx.supabase, member.tenantId),
      modelStandingFor(member.tenantId),
    ]);
    const billing: BillingDto = {
      ready: ready.ready,
      livemode: ready.livemode,
      account,
      price: ready.price,
      trial_days: ready.trial_days,
      call_minutes_month: minutes,
      model_standing: modelStanding,
    };
    return { billing };
  },
});
