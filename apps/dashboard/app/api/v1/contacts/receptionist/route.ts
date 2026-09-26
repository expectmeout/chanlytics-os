import { z } from "zod";
import { workspace, write } from "@/server/route";
import { RECEPTIONIST_MODES, setReceptionistMany } from "@/server/people/people-many";

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1, "Pick at least one person.").max(50, "Fifty at a time."),
  mode: z.enum(RECEPTIONIST_MODES, { message: "Mode must be one of: auto, ask, never, inherit." }),
});

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
  input: Body,
  handle: async ({ ctx, member, input }) => setReceptionistMany(ctx, member.tenantId, input.ids, input.mode),
});
