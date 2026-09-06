import QRCode from "qrcode";
import { AppError, optInLink } from "@chanlytics/contracts";
import { withRoute, memberContext } from "@/server/with-route";

/**
 * GET /api/v1/consent/qr — the workspace's "say yes to offers" code, as SVG.
 *
 * It encodes one link and nothing a caller chooses: WhatsApp opened on the
 * workspace's own number with the opt-in phrase ready to send. Scanning it at
 * the desk or tapping the link in a bio is how a customer says yes in their
 * own words, and the ingest records that message as their consent. Members
 * read; no number, no code.
 */
export const GET = withRoute(async (req, ctx) => {
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
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
});
