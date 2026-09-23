import { z } from "zod";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { noteAnswer, noteOn } from "@/server/person-notes";

const Body = z.object({ note_id: z.string().uuid() }).strict();

/**
 * POST /api/v1/contacts/:id/notes/remove — take a note away (0007).
 *
 * Its author, or an owner; the door decides. The words go, and the event holds none.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: Body,
  handle: async ({ ctx, row: contact, input }) => {
    await noteOn(ctx, contact.id, input.note_id);
    const { data, error } = await ctx.supabase.rpc("person_note_remove", { p_note_id: input.note_id });
    const { removed } = noteAnswer("person_note_remove", data, error);
    return { removed: removed ?? input.note_id };
  },
});
