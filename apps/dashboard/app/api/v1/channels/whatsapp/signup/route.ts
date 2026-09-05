import { withRoute, memberContext } from "@/server/with-route";
import { whatsappSignupConfig } from "@/server/service";

/**
 * GET /api/v1/channels/whatsapp/signup — what the browser needs to start
 * Embedded Signup, and whether it can. Any member may ask; only an owner may
 * connect. The answer is honest about a missing configuration so the pane
 * can say so instead of drawing a button that opens nothing.
 */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const cfg = await whatsappSignupConfig();
  return { ...cfg, canConnect: member.role === "owner" && cfg.ready };
});
