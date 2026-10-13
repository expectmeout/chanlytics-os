/**
 * The code a customer scans to say yes to offers (GET /api/v1/consent/qr), as an SVG. It encodes one link, the
 * workspace's own WhatsApp number with the opt-in words, and nothing a caller chooses; a workspace with no active
 * number has nothing to say yes to, and one that is paused or ended takes no sign-ups, so it has no code to hand out
 * (contracts takesSignUps; the wiring's second audit, X4-1): the Broadcasts card offers none, and its address answers
 * none either. Where the workspace's standing cannot be read, the code is served, as the card offers it then. The route
 * declares who may.
 */
import QRCode from "qrcode";
import { AppError, optInLink, takesSignUps } from "@chanlytics/contracts";
import { workspaceOpenToCustomers } from "@chanlytics/db";
import { log } from "@/server/log";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

export async function consentQr(ctx: RouteContext, member: Member) {
  const tenantId = member.tenantId;
  const open = await workspaceOpenToCustomers(ctx.supabase, tenantId).then(
    (s) => s.open,
    (e: unknown) => {
      log.error("consent_qr_standing_failed", {
        tenant_id: tenantId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    },
  );
  if (!takesSignUps(open))
    throw new AppError("conflict", "The workspace is not taking sign-ups, so there is no code to hand out.", 409);
  // The oldest active number, the one Connections shows: a workspace may hold two, and the code says the same one each time.
  const { data: ch, error } = await ctx.supabase
    .from("tenant_channels")
    .select("number_e164")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const link = optInLink(ch?.number_e164);
  if (!link) throw new AppError("not_found", "No WhatsApp number to say yes to yet.", 404);
  const svg = await QRCode.toString(link, { type: "svg", margin: 1, width: 240, errorCorrectionLevel: "M" });
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "private, max-age=3600" },
  });
}
