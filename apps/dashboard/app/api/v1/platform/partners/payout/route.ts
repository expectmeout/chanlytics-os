import { write, platform } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { platformPartnerPayout } from "@/server/platform";
import { AppError } from "@chanlytics/contracts";

/**
 * POST /api/v1/platform/partners/payout — record a payout sent to a partner by hand (decision 0012, P5).
 *
 * IT SENDS NOTHING, as the waiting list's button sends nothing: the money leaves from the bank or the provider, and
 * this records that it did, with the reference to find it by. Every payable earning of the partner in the currency
 * is settled into one payout, refunds since the last one netted in; a net that is not above zero records nothing and
 * says so. Stripe Connect replaces the hand later.
 *
 * On the platform scope, and checked again in the function, which locks the partner so two people pressing at once
 * record one payout.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_partner_payout",
  handle: async ({ req, office }) => {
    const body = (await req.json().catch(() => ({}))) as {
      partner_id?: unknown;
      currency?: unknown;
      reference?: unknown;
    };
    const partnerId = requireUuid(body.partner_id, "partner");
    const currency = typeof body.currency === "string" ? body.currency.trim().toLowerCase() : "";
    if (!/^[a-z]{3}$/.test(currency))
      throw new AppError("validation", "Name the currency the payout was sent in.", 400);
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    if (!reference || reference.length > 200)
      throw new AppError("validation", "Give the payment's reference, so it can be found again.", 400);
    return { result: await platformPartnerPayout(office, partnerId, currency, reference) };
  },
});
