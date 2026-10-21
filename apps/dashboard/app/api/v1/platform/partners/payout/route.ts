import { write, platform } from "@/server/route";
import { PartnerPayoutSchema } from "@chanlytics/contracts";
import { platformPartnerPayout } from "@/server/platform/platform";

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
  fresh: true,
  act: "partner_payout",
  input: PartnerPayoutSchema,
  handle: async ({ office, input }) => ({
    result: await platformPartnerPayout(
      office,
      input.partner_id,
      {
        currency: input.currency,
        reference: input.reference,
        ...(input.expected_cents !== undefined ? { expectedCents: input.expected_cents } : {}),
      },
      input.why,
    ),
  }),
});
