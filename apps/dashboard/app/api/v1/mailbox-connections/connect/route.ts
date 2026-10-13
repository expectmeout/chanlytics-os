import { z } from "zod";
import { read, workspace } from "@/server/route";
import { startMailboxConnect } from "@/server/connections/mailbox-connections";

const Query = z.object({ provider: z.enum(["google", "microsoft"]) });

/**
 * GET /api/v1/mailbox-connections/connect?provider=google|microsoft — the way to the provider's consent screen: a
 * signed state naming the workspace, the person and the provider. Owners and managers. The browser follows the
 * redirect; the callback proves the state before trusting anything that comes back with it.
 *
 * The handle is startMailboxConnect in src/server/connections/mailbox-connections.ts.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "settings",
  query: Query,
  handle: ({ ctx, member, input }) => startMailboxConnect(ctx, member, input.provider),
});
