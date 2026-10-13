import { write, workspace } from "@/server/route";
import { checkMailbox } from "@/server/connections/mailbox-connections";

/**
 * POST /api/v1/mailbox-connections/:id/check
 *
 * The owner's Check: its domain's SPF, DKIM and DMARC read again now and written to its row. The mailboxes clock reads
 * them once a day after; this is "now" instead of "by tomorrow".
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: async ({ ctx, member }) => ({
    mailbox: await checkMailbox(member.tenantId, ctx.userId, String(ctx.params.id ?? "")),
  }),
});
