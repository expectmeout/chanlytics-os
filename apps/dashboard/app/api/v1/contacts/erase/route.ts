import { EraseManyBody } from "@chanlytics/contracts";
import { workspace, write } from "@/server/route";
import { eraseMany } from "@/server/people/people-many";

/**
 * POST /api/v1/contacts/erase -- { ids, not_a_person? }
 *
 * Many people deleted at one press: People's Delete… for a selection, however many. Each is taken out of reach and
 * handed to the ledger in one write, which erases them as DELETE /contacts/:id erases one; with `not_a_person`, each
 * one's address said automated first, as POST /contacts/:id/not-a-person says it. The owner's, on a fresh session, as a
 * deletion is, with a bucket of its own: the single door's five an hour made a mailbox's leftovers a day of taps. The
 * answer names who is going, who is not and why, and who was not there to go; the erasing is behind it.
 */
export const POST = write({
  scope: workspace,
  fresh: true,
  role: "owner",
  rate: "erase_many",
  input: EraseManyBody,
  handle: ({ ctx, member, input }) => eraseMany(ctx, member.tenantId, input.ids, input.not_a_person ?? false),
});
