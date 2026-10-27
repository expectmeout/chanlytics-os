import { z } from "zod";
import { read, write, workspace } from "@/server/route";
import { mailboxSendersFor, sortSender } from "@/server/connections/mailbox-senders";

/**
 * GET /api/v1/mailbox-senders
 *
 * The list under the workspace's connected mailbox (00483): who it left mail from, newest first, a sender since said to
 * be a person left out; and what the workspace said of senders. Anyone in the workspace may read it.
 */
export const GET = read({
  scope: workspace,
  role: "viewer",
  rate: "aggregate",
  handle: async ({ ctx, member }) => mailboxSendersFor(ctx, member.tenantId),
});

const Body = z
  .object({
    sender: z.string().min(3).max(254),
    verdict: z.enum(["automated", "person"]).nullable(),
  })
  .strict();

/**
 * POST /api/v1/mailbox-senders
 *
 * What the workspace says of a sender of its mailbox's mail: an address or a domain is automated (its mail stays in the
 * mailbox), a person (its mail comes in whatever it looks like, and an address's last six months are brought in), or
 * taken back (null). A whole free-mail domain, or the business's own, is never said to be automated.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: Body,
  handle: async ({ ctx, member, input }) => sortSender(ctx, member.tenantId, input),
});
