import { write, workspace } from "@/server/route";
import { checkSendingDomain } from "@/server/connections/sending-domains";

/**
 * POST /api/v1/sending-domains/:id/check
 *
 * The owner's Check: the provider is asked to look at the records again, and what it and DNS say now is written to
 * the row and answered. The ten-minute clock keeps checking after; this is "now" instead of "within ten minutes".
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  handle: async ({ ctx, member }) => ({
    domain: await checkSendingDomain(member.tenantId, ctx.userId, String(ctx.params.id ?? "")),
  }),
});
