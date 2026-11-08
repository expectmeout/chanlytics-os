import { read, workspace } from "@/server/shared/route";
import { AppError } from "@chanlytics/contracts";
import { BILLING_SAID, callEdgeBilling } from "@/server/workspace/billing";

/** GET /api/v1/billing/invoices — the last twelve invoices as Stripe lists them, each with its own page. Owners only, counted as a read: pressing it never locks Checkout for the hour. */
export const GET = read({
  scope: workspace,
  role: "owner",
  rate: "billing_read",
  handle: async ({ ctx, member }) => {
    const answer = await callEdgeBilling({ op: "invoices", tenant_id: member.tenantId, user_id: ctx.userId }, 20_000);
    const body = answer.body ?? {};
    if (answer.status !== 200 || body.ok !== true || !Array.isArray(body.invoices)) {
      const reason = typeof body.error === "string" ? body.error : "failed";
      throw new AppError(
        answer.status === 503 ? "upstream_auth" : "upstream_provider",
        BILLING_SAID[reason] ?? `The invoices could not be read (${reason}).`,
        answer.status === 503 ? 503 : 502,
      );
    }
    return { invoices: body.invoices };
  },
});
