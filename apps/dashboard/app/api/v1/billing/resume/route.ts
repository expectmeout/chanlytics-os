import { write, workspace } from "@/server/shared/route";
import { AppError } from "@chanlytics/contracts";
import { BILLING_SAID, callEdgeBilling } from "@/server/workspace/billing";

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
    const answer = await callEdgeBilling({ op: "resume", tenant_id: member.tenantId, user_id: ctx.userId }, 25_000);
    const body = answer.body ?? {};
    if (answer.status !== 200 || body.ok !== true) {
      const reason = typeof body.error === "string" ? body.error : "failed";
      throw new AppError(
        answer.status === 409 ? "conflict" : answer.status === 503 ? "upstream_auth" : "upstream_provider",
        BILLING_SAID[reason] ?? `The subscription could not be resumed (${reason}).`,
        answer.status === 409 ? 409 : answer.status === 503 ? 503 : 502,
      );
    }
    return { status: typeof body.status === "string" ? body.status : "active" };
  },
});
