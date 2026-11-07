import { write, workspace } from "@/server/shared/route";
import { AppError } from "@chanlytics/contracts";
import { BILLING_SAID, callEdgeBilling } from "@/server/workspace/billing";

/**
 * POST /api/v1/billing/start-now — a free trial's plan started now: Stripe ends the trial and charges the card on
 * file today. What the trial does not cover (a number, texting, lead searches: contracts maySpend) opens at once,
 * since the edge applies Stripe's answer before the webhook confirms it. Owners only. Answers the status Stripe
 * gave: `active`, or what it made of a card that did not pay.
 */
export const POST = write({
  scope: workspace,
  fresh: true,
  role: "owner",
  rate: "billing",
  handle: async ({ ctx, member }) => {
    const answer = await callEdgeBilling({ op: "start_now", tenant_id: member.tenantId, user_id: ctx.userId }, 25_000);
    const body = answer.body ?? {};
    if (answer.status !== 200 || body.ok !== true) {
      const reason = typeof body.error === "string" ? body.error : "failed";
      throw new AppError(
        answer.status === 409 ? "conflict" : answer.status === 503 ? "upstream_auth" : "internal",
        BILLING_SAID[reason] ?? `The plan could not be started (${reason}).`,
        answer.status === 409 ? 409 : answer.status === 503 ? 503 : 502,
      );
    }
    return { status: typeof body.status === "string" ? body.status : "active" };
  },
});
