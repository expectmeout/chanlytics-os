import { write, platform } from "@/server/route";
import { PartnerSecondFactorResetSchema } from "@chanlytics/contracts";
import { platformPartnerSecondFactorReset } from "@/server/platform/platform";

/**
 * POST /api/v1/platform/partners/second-factor — {partner_id, why}: remove a partner's authenticator so they can set
 * up a new one at their next sign-in (decision 0013, M2), after a person has checked it is them. On the platform
 * scope, checked again in the function, which records who, when and why before anything is removed.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_partner_second_factor",
  fresh: true,
  input: PartnerSecondFactorResetSchema,
  handle: async ({ office, input }) => ({
    result: await platformPartnerSecondFactorReset(office, input.partner_id, input.why),
  }),
});
