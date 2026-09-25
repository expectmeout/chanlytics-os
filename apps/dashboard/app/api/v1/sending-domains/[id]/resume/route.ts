import { write, workspace } from "@/server/route";
import { resumeSendingDomain } from "@/server/sending-domains";

/**
 * POST /api/v1/sending-domains/:id/resume
 *
 * The owner's Resume, for a domain held for its bounces or a complaint: it sends again from the ramp's first step
 * (30 a day). A domain held for its records lifts itself when Check passes, and is refused here with that said.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  handle: async ({ ctx, member }) => ({
    domain: await resumeSendingDomain(member.tenantId, ctx.userId, String(ctx.params.id ?? "")),
  }),
});
