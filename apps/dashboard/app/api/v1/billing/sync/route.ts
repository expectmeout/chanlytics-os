import { write, workspace } from "@/server/route";
import { AppError } from "@chanlytics/contracts";
import { BILLING_SAID, edgeBilling } from "@/server/billing";

/**
 * POST /api/v1/billing/sync — read the subscription from Stripe now and
 * apply it: the Refresh button, and the way back when a webhook delivery
 * was missed. Operators and owners.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "billing",
  handle: async ({ member }) => {
    const a = await edgeBilling({ op: "sync", tenant_id: member.tenantId }, 25_000);
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true) {
      const reason = typeof b.error === "string" ? b.error : "failed";
      throw new AppError(a.status === 409 ? "conflict" : a.status === 503 ? "upstream_auth" : "internal", BILLING_SAID[reason] ?? `Billing could not be refreshed (${reason}).`, a.status === 409 ? 409 : a.status === 503 ? 503 : 502);
    }
    return { status: typeof b.status === "string" ? b.status : "none" };
  },
});
