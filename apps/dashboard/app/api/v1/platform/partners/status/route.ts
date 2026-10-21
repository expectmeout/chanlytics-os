import { write, platform } from "@/server/route";
import { PartnerStatusSchema } from "@chanlytics/contracts";
import { platformPartnerStatus } from "@/server/platform/platform";

/**
 * POST /api/v1/platform/partners/status — pause, close or restore a partner (decision 0012, Risks).
 *
 * A partner holds the settings of every business they brought, so a bad or hacked partner account is a problem on
 * all of them at once. A pause makes each of their partner seats a viewer's and releases what they held in those
 * workspaces' conversations; a restore gives back the seats the pause took, where the owner has not removed them
 * since. Their earnings keep being written while paused and mature only once they are active again.
 *
 * On the platform scope, and checked again in the function, which records it against the caller on every workspace
 * whose seat moved.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_partner_status",
  act: "partner_status",
  input: PartnerStatusSchema,
  handle: async ({ office, input }) => ({
    result: await platformPartnerStatus(office, input.partner_id, input.status, input.why),
  }),
});
