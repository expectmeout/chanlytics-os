import { AppError } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { checkWhatsAppStanding } from "@/server/connections/whatsapp";

/**
 * POST /api/v1/channels/whatsapp/standing — ask Meta what it holds about the workspace's WhatsApp number now: whether it may
 * send, what stands in the way, its display name's review, the business's verification and tier. The edge reads it with the
 * business's own token and keeps it on the channel, which the settings read carries, so Connections' row says it; the owner is
 * told by notice if it turned BLOCKED. The owner's or the partner's, as Connect WhatsApp is; counted in its own bucket (a
 * Graph read each). The page asks only when it opens on a standing that is missing, or not AVAILABLE and read more than ten
 * minutes ago, so a payment method added a minute ago shows as fixed without waiting for the six-hourly read. Answers what was
 * kept and Meta's word for the number, never Meta's words.
 */
const SAID: Record<string, string> = {
  preview: "Checking only works on the production dashboard.",
  no_channel: "This workspace has no WhatsApp number connected.",
  no_token: "Chanlytics could not read this number's WhatsApp credentials. Connect the number again and try again.",
  channel_read_failed: "Chanlytics could not read the workspace's WhatsApp number just now. Try again in a moment.",
  meta_failed: "Meta did not answer. Try again in a moment.",
};

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "whatsapp_standing",
  handle: async ({ ctx, member }) => {
    const r = await checkWhatsAppStanding(member.tenantId, ctx.userId);
    if (!r.ok) {
      const said = SAID[r.reason] ?? `Meta's answer about the number could not be read (${r.reason}).`;
      throw r.reason === "no_channel" ? new AppError("conflict", said, 409) : new AppError("upstream_meta", said, 502);
    }
    return { kept: r.kept, can_send: r.canSend };
  },
});
