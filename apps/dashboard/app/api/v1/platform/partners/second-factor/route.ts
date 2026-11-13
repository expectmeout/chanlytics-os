import { write, platform } from "@/server/shared/route";
import { PartnerSecondFactorSchema } from "@chanlytics/contracts";
import { resetPlatformPartnerSecondFactor } from "@/server/console/platform";

/**
 * POST /api/v1/platform/partners/second-factor — {partner_id, why}: remove a partner's authenticator so they can set
 * up a new one at their next sign-in (decision 0013, M2), after a person has checked it is them. On the platform
 * scope, checked again in the function, which records who, when and why before anything is removed.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_partner_second_factor",
  act: "partner_second_factor",
  input: PartnerSecondFactorSchema,
  handle: async ({ office, input }) => ({
    result: await resetPlatformPartnerSecondFactor(office, input.partner_id, input.why),
  }),
});
