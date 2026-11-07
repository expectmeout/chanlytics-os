import { AppError } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { BILLING_SAID, callEdgeBilling } from "@/server/workspace/billing";

/**
 * POST /api/v1/billing/portal — the way to Stripe's customer portal: the
 * card, the invoices, cancel, in Stripe's words on Stripe's page. Owners
 * only. The portal's own configuration is set once in the Stripe dashboard.
 */
export const POST = write({
  scope: workspace,
  fresh: true,
  role: "owner",
  rate: "billing",
  handle: async ({ ctx, member }) => {
    const answer = await callEdgeBilling({ op: "portal", tenant_id: member.tenantId, user_id: ctx.userId }, 20_000);
    const body = answer.body ?? {};
    if (answer.status !== 200 || body.ok !== true || typeof body.url !== "string") {
      const reason = typeof body.error === "string" ? body.error : "failed";
      throw new AppError(
        answer.status === 409 ? "conflict" : answer.status === 503 ? "upstream_auth" : "internal",
        BILLING_SAID[reason] ?? `The portal could not be opened (${reason}).`,
        answer.status === 409 ? 409 : answer.status === 503 ? 503 : 502,
      );
    }
    return { url: body.url };
  },
});
