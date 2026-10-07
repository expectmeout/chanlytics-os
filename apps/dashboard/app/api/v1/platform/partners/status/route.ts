import { write, platform } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { platformPartnerStatus } from "@/server/platform/platform";
import { AppError, PARTNER_STATUSES } from "@chanlytics/contracts";

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
  handle: async ({ req, office }) => {
    const body = (await req.json().catch(() => ({}))) as { partner_id?: unknown; status?: unknown; why?: unknown };
    const partnerId = requireUuid(body.partner_id, "partner");
    const status = typeof body.status === "string" ? body.status : "";
    if (!(PARTNER_STATUSES as readonly string[]).includes(status))
      throw new AppError("validation", "Choose active, paused or closed.", 400);
    const why = typeof body.why === "string" ? body.why.trim() : "";
    if (!why) throw new AppError("validation", "Say why: the partner is written to about it.", 400);
    return { result: await platformPartnerStatus(office, partnerId, status, why) };
  },
});
