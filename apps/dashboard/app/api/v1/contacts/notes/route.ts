import { z } from "zod";
import { workspace, write } from "@/server/route";
import { NOTE_LINE_MAX, appendNotesMany } from "@/server/people-many";

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1, "Pick at least one person.").max(50, "Fifty at a time."),
  append: z.string().trim().min(1, "Write the note first.").max(NOTE_LINE_MAX, `A note line is at most ${NOTE_LINE_MAX} characters.`),
});

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
  input: Body,
  handle: async ({ ctx, member, input }) => appendNotesMany(ctx, member.tenantId, input.ids, input.append),
});
