import { z } from "zod";
import { NOTE_MAX } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { noteAnswer, noteOn, writtenNote } from "@/server/person-notes";

const Body = z
  .object({
    body: z.string().trim().min(1).max(NOTE_MAX),
    /** The member it is for; absent or null is for everyone. */
    for_user_id: z.string().uuid().nullable().optional(),
    /** For the team only: the receptionist never reads it. */
    team_only: z.boolean().optional(),
    /** Absent: a new note. Present: its author's change, with the version the page saw. */
    note_id: z.string().uuid().optional(),
    version: z.number().int().min(1).optional(),
  })
  .strict();

/**
 * POST /api/v1/contacts/:id/notes — write a note on a person, or change one (0007).
 *
 * One route for a new note (no note_id) and for its author's change (note_id and the version the page saw), as the
 * deal route is one route for a new engagement and a move. The SQL doors decide who may and write the event.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: Body,
  handle: async ({ ctx, row: contact, input }) => {
    if (input.note_id) {
      await noteOn(ctx, contact.id, input.note_id);
      const { data, error } = await ctx.supabase.rpc("person_note_edit", {
        p_note_id: input.note_id,
        p_body: input.body,
        ...(input.for_user_id ? { p_for_user_id: input.for_user_id } : {}),
        p_team_only: input.team_only ?? false,
        ...(input.version !== undefined ? { p_version: input.version } : {}),
      });
      const { note } = noteAnswer("person_note_edit", data, error);
      return { note: note ? writtenNote(ctx, note) : null };
    }
    const { data, error } = await ctx.supabase.rpc("person_note_add", {
      p_contact_id: contact.id,
      p_body: input.body,
      ...(input.for_user_id ? { p_for_user_id: input.for_user_id } : {}),
      p_team_only: input.team_only ?? false,
    });
    const { note } = noteAnswer("person_note_add", data, error);
    return { note: note ? writtenNote(ctx, note) : null };
  },
});
