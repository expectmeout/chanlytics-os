import { write, workspace } from "@/server/route";
import { AppError } from "@chanlytics/contracts";
import { BILLING_SAID, edgeBilling } from "@/server/workspace/billing";

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
    const a = await edgeBilling({ op: "start_now", tenant_id: member.tenantId, user_id: ctx.userId }, 25_000);
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true) {
      const reason = typeof b.error === "string" ? b.error : "failed";
      throw new AppError(
        a.status === 409 ? "conflict" : a.status === 503 ? "upstream_auth" : "internal",
        BILLING_SAID[reason] ?? `The plan could not be started (${reason}).`,
        a.status === 409 ? 409 : a.status === 503 ? 503 : 502,
      );
    }
    return { status: typeof b.status === "string" ? b.status : "active" };
  },
});
