import { z } from "zod";
import { AppError, CHECKOUT_RETURNS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { BILLING_SAID, edgeBilling } from "@/server/workspace/billing";

/**
 * POST /api/v1/billing/checkout — the way to Stripe Checkout for this
 * workspace: a card, the trial, and back with the outcome. Owners only; the
 * edge makes the session and answers with its URL, and the browser leaves the
 * app for Stripe's page.
 *
 * `{ return: "start" }` brings the owner back to the first run that asked for
 * the card rather than to Settings › Billing. A place off contracts' closed list
 * is refused here, before the edge is asked; nothing said is Billing.
 */
export const POST = write({
  scope: workspace,
  fresh: true,
  role: "owner",
  rate: "billing",
  input: z.object({
    return: z.enum(CHECKOUT_RETURNS, { error: "Checkout comes back to Billing or to setting up." }).optional(),
  }),
  handle: async ({ ctx, input, member }) => {
    const a = await edgeBilling(
      {
        op: "checkout",
        tenant_id: member.tenantId,
        user_id: ctx.userId,
        email: ctx.email ?? null,
        ...(input.return ? { return: input.return } : {}),
      },
      25_000,
    );
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true || typeof b.url !== "string") {
      const reason = typeof b.error === "string" ? b.error : "failed";
      throw new AppError(
        a.status === 409 ? "conflict" : a.status === 503 ? "upstream_auth" : "internal",
        BILLING_SAID[reason] ?? `Checkout could not be opened (${reason}).`,
        a.status === 409 ? 409 : a.status === 503 ? 503 : 502,
      );
    }
    return { url: b.url };
  },
});
