import { z } from "zod";
import { write } from "@/server/route";
import { erasureScope } from "@/server/verbs";
import { notAPerson } from "@/server/connections/mailbox-senders";

const Body = z.object({ scope: z.enum(["address", "domain"]) }).strict();

/**
 * POST /api/v1/contacts/:id/not-a-person
 *
 * A "person" who is a sender of automated mail (00483): their address, or every address at their domain, said to be
 * automated, so their mail stays in the mailbox from now on; then they are deleted as Delete person deletes them. The
 * owner's, on a fresh session, as a deletion is.
 */
export const POST = write({
  scope: erasureScope,
  fresh: true,
  role: "owner",
  rate: "erase",
  input: Body,
  handle: ({ ctx, row, input }) => notAPerson(ctx, row, input.scope),
});
