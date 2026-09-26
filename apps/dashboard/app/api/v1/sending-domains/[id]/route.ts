import { write, workspace } from "@/server/route";
import { removeSendingDomain } from "@/server/connections/sending-domains";

/**
 * DELETE /api/v1/sending-domains/:id
 *
 * An owner removes a domain: gone at the cold mail account, then here. Nothing more is sent from it; what was sent
 * stays in its threads. Another workspace's domain is not found.
 */
export const DELETE = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  handle: async ({ ctx, member }) => {
    await removeSendingDomain(member.tenantId, ctx.userId, String(ctx.params.id ?? ""));
    return { removed: true };
  },
});
