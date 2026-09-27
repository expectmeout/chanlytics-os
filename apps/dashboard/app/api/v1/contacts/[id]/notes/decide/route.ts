import { z } from "zod";
import { NOTE_MAX } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { noteAnswer, noteOn, writtenNote } from "@/server/people/person-notes";

const Body = z
  .object({
    note_id: z.string().uuid(),
    keep: z.boolean(),
    /** Kept in the member's own words, when they changed the receptionist's. */
    body: z.string().trim().min(1).max(NOTE_MAX).optional(),
    team_only: z.boolean().optional(),
  })
  .strict();

/**
 * POST /api/v1/contacts/:id/notes/decide — keep or dismiss the receptionist's suggested note (0007).
 *
 * Kept, the receptionist reads it from then on; dismissed, its words go. Nothing the receptionist wrote reaches its
 * own instructions until a member has read it here.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: Body,
  handle: async ({ ctx, row: contact, input }) => {
    await noteOn(ctx, contact.id, input.note_id);
    const { data, error } = await ctx.supabase.rpc("person_note_decide", {
      p_note_id: input.note_id,
      p_keep: input.keep,
      ...(input.body ? { p_body: input.body } : {}),
      ...(input.team_only !== undefined ? { p_team_only: input.team_only } : {}),
    });
    const { note, removed } = noteAnswer("person_note_decide", data, error);
    return note ? { note: writtenNote(ctx, note) } : { removed: removed ?? input.note_id };
  },
});
