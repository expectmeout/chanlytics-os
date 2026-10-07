import { write, workspace } from "@/server/route";
import { AppError } from "@chanlytics/contracts";
import { BILLING_SAID, edgeBilling } from "@/server/workspace/billing";

/**
 * POST /api/v1/billing/resume — a paused subscription resumed, billing
 * from now. Owners only. The edge applies Stripe's answer at once, so the
 * receptionist is back before the webhook confirms it.
 */
export const POST = write({
  scope: workspace,
  fresh: true,
  role: "owner",
  rate: "billing",
  handle: async ({ ctx, member }) => {
    const a = await edgeBilling({ op: "resume", tenant_id: member.tenantId, user_id: ctx.userId }, 25_000);
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true) {
      const reason = typeof b.error === "string" ? b.error : "failed";
      throw new AppError(
        a.status === 409 ? "conflict" : a.status === 503 ? "upstream_auth" : "internal",
        BILLING_SAID[reason] ?? `The subscription could not be resumed (${reason}).`,
        a.status === 409 ? 409 : a.status === 503 ? 503 : 502,
      );
    }
    return { status: typeof b.status === "string" ? b.status : "active" };
  },
});
