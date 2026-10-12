import { PersonNameActSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { actOnPersonName } from "@/server/people/person-works-at";

/**
 * POST /api/v1/people/:id/name — { act: "adopt", message_id } | { act: "undo" } | { act: "decline", message_id }
 *
 * What to call a person found as a lead (decision 0052): the name a reply was signed with becomes theirs ("Use this
 * name", settled), the name it replaced goes back ("Undo": the business's, or none, settled so that sign-off is never
 * taken again), or the signer is declined for everyone (the notice's ×). The person is the row (contactScope): visible
 * under RLS first, an erased one gone, and the role judged in the person's own workspace; the doors (00413) judge it
 * again from the session. The handle is actOnPersonName in src/server/people/person-works-at.ts.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: PersonNameActSchema,
  handle: ({ ctx, row: person, input }) => actOnPersonName(ctx, person.id, input),
});

export const dynamic = "force-dynamic";
