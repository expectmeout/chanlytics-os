import { read, workspace } from "@/server/route";
import { whatsappSignupConfig } from "@/server/connections/whatsapp";
import { ROLE_PERMS } from "@chanlytics/contracts";

/**
 * GET /api/v1/channels/whatsapp/signup — what Meta's Embedded Signup needs
 * in the browser, and whether this member may connect a number (whoever has
 * the channel permission, `disconnect`: the owner and the partner, as
 * POST channels/whatsapp/connect declares; and only where this deployment is
 * set up to).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ member }) => {
    const cfg = await whatsappSignupConfig();
    return { ...cfg, canConnect: !!ROLE_PERMS[member.role]?.disconnect && cfg.ready };
  },
});
