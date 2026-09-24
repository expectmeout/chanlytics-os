import { AppError, isCheckoutReturn } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { BILLING_SAID, edgeBilling } from "@/server/billing";

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
  role: "owner",
  rate: "billing",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => ({}))) as { return?: unknown } | null;
    const back = body?.return;
    if (back !== undefined && !isCheckoutReturn(back))
      throw new AppError("validation", "Checkout comes back to Billing or to setting up.", 400);
    const a = await edgeBilling(
      { op: "checkout", tenant_id: member.tenantId, email: ctx.email ?? null, ...(back ? { return: back } : {}) },
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
