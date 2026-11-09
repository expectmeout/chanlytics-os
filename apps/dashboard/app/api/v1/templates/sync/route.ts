import { AppError } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { syncTemplates } from "@/server/campaigns/meta-templates";
import { WHATSAPP_ACCOUNT_MISSING, WHATSAPP_NO_TOKEN } from "@/server/campaigns/whatsapp-refusals";

/**
 * POST /api/v1/templates/sync — this workspace's templates, as Meta holds
 * them now.
 *
 * Owner or operator, rate-limited with the other settings changes. The edge
 * does the read (it holds the number's credentials) and the write; this
 * route proves who is asking and says what happened in the owner's words.
 * Not a ledger verb: nothing a customer experiences changes by reading.
 */
const REASON_WORDS: Record<string, string> = {
  preview: "Syncing only works on the production dashboard.",
  no_channel: "Connect a WhatsApp number first — templates belong to a number's account.",
  no_waba: WHATSAPP_ACCOUNT_MISSING,
  no_token: WHATSAPP_NO_TOKEN,
  meta_failed: "Meta did not answer. Try again in a moment.",
  write_failed: "The templates could not be saved. Try again.",
};

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  handle: async ({ ctx, member }) => {
    const result = await syncTemplates(member.tenantId, ctx.userId);
    if (!result.ok) {
      const sentence = REASON_WORDS[result.reason] ?? `The sync did not complete (${result.reason}).`;
      throw new AppError(
        result.reason === "no_channel" || result.reason === "no_waba" ? "conflict" : "upstream_meta",
        sentence,
        result.reason === "no_channel" || result.reason === "no_waba" ? 409 : 502,
      );
    }
    return {
      ok: true,
      seen: result.seen,
      approved: result.approved,
      marketing: result.marketing,
      synced_at: result.syncedAt,
    };
  },
});
