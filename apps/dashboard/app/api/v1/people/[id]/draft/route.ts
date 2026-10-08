import { PersonDraftInputSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { readerContext } from "@/server/readers";
import { draftForPerson } from "@/server/new-conversation/person-draft";

/** A model call that reads a person first: the platform's ceiling, as the reply route's and Ask's own. */
export const maxDuration = 60;

/**
 * POST /api/v1/people/:id/draft — Ask writes a message to one person, or the brief for a call to them.
 *
 * A model call, counted in Ask's one daily budget, with a bucket of its own on top (per person, sixty an hour). It
 * answers questions when the plan is too thin to write from, else the words (and a subject for an email) or a call's
 * brief, and always the note the receptionist would read. Nothing is stored: the member sends what they keep through
 * POST people/:id/message. A price or an offer of money the member did not give is refused, and nothing of it kept.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_draft",
  input: PersonDraftInputSchema,
  handle: ({ ctx, row, member, input }) => draftForPerson(readerContext(ctx, member), row.id, input),
});
