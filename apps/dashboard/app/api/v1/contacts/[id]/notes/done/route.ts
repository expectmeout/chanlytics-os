import { z } from "zod";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { noteAnswer, noteOn, writtenNote } from "@/server/person-notes";

const Body = z
  .object({
    note_id: z.string().uuid(),
    /** Done (the default), or open again. */
    done: z.boolean().optional(),
    /** The version the page saw: a stale press is refused. */
    version: z.number().int().min(1).optional(),
  })
  .strict();

/**
 * POST /api/v1/contacts/:id/notes/done — a step done, or open again (0007, amended; 00166).
 *
 * Any owner or operator, not only its author: a step for Maria is Maria's to do. Only a note with a day; the door
 * writes the event, and a press that changes nothing writes nothing.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: Body,
  handle: async ({ ctx, row: contact, input }) => {
    await noteOn(ctx, contact.id, input.note_id);
    const { data, error } = await ctx.supabase.rpc("person_note_done", {
      p_note_id: input.note_id,
      p_done: input.done ?? true,
      ...(input.version !== undefined ? { p_version: input.version } : {}),
    });
    const { note } = noteAnswer("person_note_done", data, error);
    return { note: note ? writtenNote(ctx, note) : null };
  },
});
