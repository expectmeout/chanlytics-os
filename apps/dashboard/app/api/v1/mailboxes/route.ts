import { z } from "zod";
import { write, workspace } from "@/server/route";
import { createMailbox } from "@/server/email";

const Body = z.object({
  local_part: z.string().max(64),
  from_name: z.string().max(200),
}).strict();

/**
 * POST /api/v1/mailboxes — { local_part, from_name }
 *
 * An owner gives the workspace the address customers write to. Once: the
 * address is printed on business cards and sits in customers' address books,
 * so there is no route that changes it, and a second one is refused. What may
 * be an address is said by contracts (whyNotALocalPart) and held by the table
 * (00126); whether it is free is the door's to say (00129), in its own words.
 * The reply route's token is minted by the database and never returned.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  input: Body,
  handle: async ({ ctx, member, input }) => ({
    mailbox: await createMailbox(ctx, member.tenantId, { localPart: input.local_part, fromName: input.from_name }),
  }),
});
