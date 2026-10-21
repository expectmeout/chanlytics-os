import { write, platform } from "@/server/route";
import { PartnerStandingSchema } from "@chanlytics/contracts";
import { platformPartnerStanding } from "@/server/platform/platform";

/**
 * POST /api/v1/platform/partners/standing — a person decides the standing of a workspace a partner brought
 * (decision 0012, P5): qualified, under review, or disqualified, and why.
 *
 * The nightly check decides once, from the card and the listing (00203); this is the person who looks at what it held
 * for review, or who changes their mind. Disqualified voids what the workspace still held and earns nothing more;
 * what was paid stays paid. Qualified makes what is past its thirty days payable now.
 *
 * On the platform scope, whose door is `backOffice()`, and checked again in the function, which records the decision
 * against the caller in the same transaction. The body names the workspace, as the line actions do.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_partner_standing",
  act: "partner_standing",
  input: PartnerStandingSchema,
  handle: async ({ office, input }) => ({
    result: await platformPartnerStanding(office, input.tenant_id, input.standing, input.why),
  }),
});
