import { NotesAppendManyBody } from "@chanlytics/contracts";
import { workspace, write } from "@/server/route";
import { appendNotesMany } from "@/server/people/people-many";

/**
 * PUT /api/v1/contacts/notes -- { ids, append }
 *
 * One line under many people's notes -- "class of 12 Sep" -- through the
 * single door each would go through alone (set_person_notes), appended and
 * never replacing. Operator or owner, like the details door.
 */
export const PUT = write({
  scope: workspace,
  role: "operator",
  rate: "person_edit",
  input: NotesAppendManyBody,
  handle: async ({ ctx, member, input }) => appendNotesMany(ctx, member.tenantId, input.ids, input.append),
});
