import { read, workspace } from "@/server/route";
import { mailboxConnectionsFor, mailboxesReadiness } from "@/server/connections/mailbox-connections";

/**
 * GET /api/v1/mailbox-connections — the mailboxes the workspace connected to write its reach-outs from (decision
 * 0056), as the pages are told of them (never a token's name), and the providers this deployment offers to connect.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const [mailboxes, ready] = await Promise.all([
      mailboxConnectionsFor(ctx.supabase, member.tenantId),
      mailboxesReadiness().catch(() => ({ providers: [] })),
    ]);
    return { mailboxes, providers: ready.providers };
  },
});
