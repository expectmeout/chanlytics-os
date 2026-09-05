import { AppError } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { syncTemplates } from "@/server/service";
import { takeRate } from "@/server/rate-limit";

/**
 * POST /api/v1/templates/sync — this workspace's templates, as Meta holds
 * them now.
 *
 * Owner or operator, rate-limited with the other settings changes. The edge
 * does the read (it holds the number's credentials) and the write; this
 * route proves who is asking and says what happened in the owner's words.
 * Not a ledger verb: nothing a customer experiences changes by reading.
 */
const SAID: Record<string, string> = {
  preview: "Syncing only works on the production dashboard.",
  no_channel: "Connect a WhatsApp number first — templates belong to a number's account.",
  no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
  no_token: "Chanlytics has no access token for this number yet.",
  meta_failed: "Meta did not answer. Try again in a moment.",
  write_failed: "The templates could not be saved. Try again.",
};

export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  takeRate(ctx.userId, "settings");
  const r = await syncTemplates(member.tenantId);
  if (!r.ok) {
    const said = SAID[r.reason] ?? `The sync did not complete (${r.reason}).`;
    throw new AppError(r.reason === "no_channel" || r.reason === "no_waba" ? "conflict" : "upstream_meta", said, r.reason === "no_channel" || r.reason === "no_waba" ? 409 : 502);
  }
  return { ok: true, seen: r.seen, approved: r.approved, marketing: r.marketing, synced_at: r.syncedAt };
});
