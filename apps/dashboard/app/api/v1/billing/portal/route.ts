import { AppError } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { BILLING_SAID, edgeBilling } from "@/server/workspace/billing";

/**
 * POST /api/v1/billing/portal — the way to Stripe's customer portal: the
 * card, the invoices, cancel, in Stripe's words on Stripe's page. Owners
 * only. The portal's own configuration is set once in the Stripe dashboard.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "billing",
  handle: async ({ ctx, member }) => {
    const a = await edgeBilling({ op: "portal", tenant_id: member.tenantId, user_id: ctx.userId }, 20_000);
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true || typeof b.url !== "string") {
      const reason = typeof b.error === "string" ? b.error : "failed";
      throw new AppError(
        a.status === 409 ? "conflict" : a.status === 503 ? "upstream_auth" : "internal",
        BILLING_SAID[reason] ?? `The portal could not be opened (${reason}).`,
        a.status === 409 ? 409 : a.status === 503 ? 503 : 502,
      );
    }
    return { url: b.url };
  },
});
