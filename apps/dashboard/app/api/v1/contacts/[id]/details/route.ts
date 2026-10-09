import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { setPersonDetails, PersonDetailsChange } from "@/server/people/person-details";

/**
 * PUT /api/v1/contacts/:id/details — { name?, notes?, email?, proposal? }
 *
 * The owner's own words about a person: what to call them, the notes the
 * receptionist reads before it answers them, the address they can be
 * written to, and the proposal the receptionist sends them when they ask
 * about price (00154). Any field alone; an empty string clears it. Owner or
 * operator, judged where the person lives (contactScope): a live person the
 * caller can see under RLS. Nothing here but the proposal's address is ever
 * sent to the customer, and that only by a person's or the receptionist's
 * own reply.
 *
 * The handle is setPersonDetails in src/server/people/person-details.ts: the route is its declaration (who may, how
 * often), the verb is what it does (each field judged first, the address's door before the name's, and what the name
 * and the address were, for an undo).
 */
export const PUT = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: PersonDetailsChange,
  handle: ({ ctx, row, input }) => setPersonDetails(ctx, row, input),
});
