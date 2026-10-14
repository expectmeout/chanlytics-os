import { SayItInputSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { readerContext } from "@/server/readers";
import { sayIt } from "@/server/people/say-it";

/** A model call that reads a person first: the platform's ceiling, as the draft route's. */
export const maxDuration = 60;

/**
 * POST /api/v1/people/:id/say — Say it: what a member said about one person, read into the deal sheet's or the note
 * sheet's fields (the sheets as verbs, 14 Oct 2026, step 5).
 *
 * A model call, counted as a person's draft is (its bucket, sixty an hour, and Ask's one daily budget). It answers one
 * sheet's fill, each field kept by its own rule; nothing is stored: the sheet's Save is the member's, through its verb.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_draft",
  input: SayItInputSchema,
  handle: ({ ctx, row, member, input }) => sayIt(readerContext(ctx, member), row.id, input),
});
