import { write, workspace } from "@/server/shared/route";
import { AppError } from "@chanlytics/contracts";
import { BILLING_SAID, callEdgeBilling } from "@/server/workspace/billing";

/**
 * POST /api/v1/billing/sync — read the subscription from Stripe now and
 * apply it: the Refresh button, and the way back when a webhook delivery
 * was missed. Operators and owners.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "billing",
  handle: async ({ ctx, member }) => {
    const answer = await callEdgeBilling({ op: "sync", tenant_id: member.tenantId, user_id: ctx.userId }, 25_000);
    const body = answer.body ?? {};
    if (answer.status !== 200 || body.ok !== true) {
      const reason = typeof body.error === "string" ? body.error : "failed";
      throw new AppError(
        answer.status === 409 ? "conflict" : answer.status === 503 ? "upstream_auth" : "internal",
        BILLING_SAID[reason] ?? `Billing could not be refreshed (${reason}).`,
        answer.status === 409 ? 409 : answer.status === 503 ? 503 : 502,
      );
    }
    return { status: typeof body.status === "string" ? body.status : "none" };
  },
});
