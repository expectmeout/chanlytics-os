import QRCode from "qrcode";
import { AppError, optInLink } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";

/**
 * GET /api/v1/consent/qr — the code a customer scans to say yes to offers,
 * as an SVG. It encodes one link, the workspace's own WhatsApp number with
 * the opt-in words, and nothing a caller chooses; a workspace with no
 * active number has nothing to say yes to.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const tenantId = member.tenantId;
    const { data: ch, error } = await ctx.supabase
      .from("tenant_channels")
      .select("number_e164")
      .eq("tenant_id", tenantId)
      .eq("kind", "whatsapp")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const link = optInLink(ch?.number_e164);
    if (!link) throw new AppError("not_found", "No WhatsApp number to say yes to yet.", 404);
    const svg = await QRCode.toString(link, { type: "svg", margin: 1, width: 240, errorCorrectionLevel: "M" });
    return new Response(svg, {
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "private, max-age=3600" },
    });
  },
});
