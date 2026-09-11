import { read, workspace } from "@/server/route";
import { whatsappSignupConfig } from "@/server/service";

/**
 * GET /api/v1/channels/whatsapp/signup — what Meta's Embedded Signup needs
 * in the browser, and whether this member may connect a number (owners,
 * and only where this deployment is set up to).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ member }) => {
    const cfg = await whatsappSignupConfig();
    return { ...cfg, canConnect: member.role === "owner" && cfg.ready };
  },
});
