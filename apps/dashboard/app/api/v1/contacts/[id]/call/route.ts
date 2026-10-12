import { PersonCallSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { logCall } from "@/server/people/person-notes";

/**
 * POST /api/v1/contacts/:id/call — a call the member made from their own phone, logged on the person (decision 0052,
 * canvas A M4): how it went, what was said, the day to call back, and who answered a stand-in's number. One door keeps
 * it (person_call_logged): a note, a step with a day, and the outcome on the lead their business is, where it is open.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: PersonCallSchema,
  handle: async ({ ctx, row: contact, input }) => logCall(ctx, contact.id, input),
});
