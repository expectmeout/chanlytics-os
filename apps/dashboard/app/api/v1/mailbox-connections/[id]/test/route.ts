import { write, workspace } from "@/server/route";
import { testMailbox } from "@/server/connections/mailbox-connections";

/**
 * POST /api/v1/mailbox-connections/:id/test
 *
 * An email from the mailbox to itself, through its own provider, in the words and shape a reach-out leaves in: what the
 * owner reads is what a business gets.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: async ({ ctx, member }) => {
    await testMailbox(member.tenantId, ctx.userId, String(ctx.params.id ?? ""));
    return { sent: true };
  },
});
