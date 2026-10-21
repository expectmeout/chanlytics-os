import { z } from "zod";
import { read, workspace } from "@/server/route";
import { startMailboxConnect } from "@/server/connections/mailbox-connections";

const Query = z.object({
  provider: z.enum(["google", "microsoft"]),
  mailbox_id: z.uuid().optional(),
  admin: z.enum(["1"]).optional(),
});

/**
 * GET /api/v1/mailbox-connections/connect?provider=google|microsoft[&mailbox_id=…][&admin=1] — `{ url }`, the way to
 * the provider's consent screen, for the page to follow: a signed state naming the workspace, the person and the
 * provider, and for a Reconnect the mailbox it is for (the provider is asked for that address, and the account that
 * comes back must be its own). `admin=1` (Microsoft only) answers instead the link a Microsoft 365 admin opens to
 * approve Chanlytics for their organisation. Owners and managers. Answered as data, so every refusal is said on the
 * page; the callback proves the state before trusting anything that comes back with it.
 *
 * The handle is startMailboxConnect in src/server/connections/mailbox-connections.ts.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "settings",
  query: Query,
  handle: ({ ctx, member, input }) =>
    startMailboxConnect(ctx, member, input.provider, { mailboxId: input.mailbox_id, admin: input.admin === "1" }),
});
