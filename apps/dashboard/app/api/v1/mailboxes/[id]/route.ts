import { z } from "zod";
import { write, workspace } from "@/server/route";
import { renameMailbox } from "@/server/connections/email";

const Body = z.object({ from_name: z.string().max(200) }).strict();

/**
 * PUT /api/v1/mailboxes/:id — { from_name }
 *
 * The name customers see beside the workspace's address. It is the only thing
 * about a mailbox an owner edits: the address does not change, and how much
 * the receptionist may do with an email arrives with the receptionist's draft.
 * A mailbox that is not this workspace's is not found.
 */
export const PUT = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  input: Body,
  handle: async ({ ctx, member, input }) => ({
    mailbox: await renameMailbox(ctx, member.tenantId, String(ctx.params.id ?? ""), input.from_name),
  }),
});
