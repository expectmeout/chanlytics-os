import { ReceptionistManyBody } from "@chanlytics/contracts";
import { workspace, write } from "@/server/route";
import { setReceptionistMany } from "@/server/people/people-many";

/**
 * PUT /api/v1/contacts/receptionist -- { ids, mode }
 *
 * The receptionist's mode for a selection: the People page's bulk bar, for a
 * class the owner wants held for a person, or handed back. Owner only, like
 * the single door (PUT /contacts/:id/receptionist), one take of its bucket
 * for the batch; the same policy row and the same ledger verb per person.
 */
export const PUT = write({
  scope: workspace,
  role: "owner",
  rate: "person_mode",
  input: ReceptionistManyBody,
  handle: async ({ ctx, member, input }) => setReceptionistMany(ctx, member.tenantId, input.ids, input.mode),
});
