import type { BillingDto } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { billingFor, billingReadiness } from "@/server/billing";

/**
 * GET /api/v1/billing — the workspace's billing row as a member may read it
 * (RLS), whether this deployment can charge, and the caller's role, so the
 * page knows which buttons to draw.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const [account, ready] = await Promise.all([billingFor(ctx.supabase, member.tenantId), billingReadiness()]);
    const billing: BillingDto = { ready: ready.ready, account, price: ready.price, trial_days: ready.trial_days, role: member.role };
    return { billing };
  },
});
