import { read, workspace } from "@/server/route";
import { AppError, type BillingInvoiceDto } from "@chanlytics/contracts";
import { BILLING_SAID, edgeBilling } from "@/server/billing";

/** GET /api/v1/billing/invoices — the last twelve invoices as Stripe lists them, each with its own page. Owners only, counted as a read: pressing it never locks Checkout for the hour. */
export const GET = read({
  scope: workspace,
  role: "owner",
  rate: "billing_read",
  handle: async ({ member }) => {
    const a = await edgeBilling({ op: "invoices", tenant_id: member.tenantId }, 20_000);
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true || !Array.isArray(b.invoices)) {
      const reason = typeof b.error === "string" ? b.error : "failed";
      throw new AppError(a.status === 503 ? "upstream_auth" : "internal", BILLING_SAID[reason] ?? `The invoices could not be read (${reason}).`, a.status === 503 ? 503 : 502);
    }
    return { invoices: b.invoices as BillingInvoiceDto[] };
  },
});
