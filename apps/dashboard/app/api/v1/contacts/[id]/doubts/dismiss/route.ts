import { z } from "zod";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { settleDoubtApart } from "@/server/people/person-doubts";

const Body = z
  .object({
    doubt_id: z.uuid({ message: "Choose the doubt to settle." }),
  })
  .strict();

/**
 * POST /api/v1/contacts/:id/doubts/dismiss — { doubt_id }
 *
 * Not the same (decision 0034, step 4): a doubt the door raised on this person (another record one identity could
 * belong to) is settled as two people, and the next arrival never raises it again. Any acting member's, as a note's
 * verdict is; the merge stays the owner's (0028, POST contacts/:id/merge). This person is read under RLS first
 * (contactScope), and a doubt not on them is a 404. The handle is settleDoubtApart in src/server/people/person-doubts.ts.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: Body,
  handle: ({ ctx, row: contact, input }) => settleDoubtApart(ctx, contact.tenant_id, contact.id, input.doubt_id),
});
