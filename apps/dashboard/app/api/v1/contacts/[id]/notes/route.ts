import { NoteWriteBody } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { noteAnswer, noteOn, writtenNote } from "@/server/people/person-notes";

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
  input: NoteWriteBody,
  handle: async ({ ctx, row: contact, input }) => {
    if (input.note_id) {
      await noteOn(ctx, contact.id, input.note_id);
      const { data, error } = await ctx.supabase.rpc("person_note_edit", {
        p_note_id: input.note_id,
        p_body: input.body,
        ...(input.for_user_id ? { p_for_user_id: input.for_user_id } : {}),
        p_team_only: input.team_only ?? false,
        ...(input.version !== undefined ? { p_version: input.version } : {}),
        ...(input.due_on ? { p_due_on: input.due_on } : {}),
        ...(input.deal_id ? { p_deal_id: input.deal_id } : {}),
        ...(input.clear_due ? { p_clear_due: true } : {}),
      });
      const { note } = noteAnswer("person_note_edit", data, error);
      return { note: note ? writtenNote(ctx, note) : null };
    }
    const { data, error } = await ctx.supabase.rpc("person_note_add", {
      p_contact_id: contact.id,
      p_body: input.body,
      ...(input.for_user_id ? { p_for_user_id: input.for_user_id } : {}),
      p_team_only: input.team_only ?? false,
      ...(input.due_on ? { p_due_on: input.due_on } : {}),
      ...(input.deal_id ? { p_deal_id: input.deal_id } : {}),
    });
    const { note } = noteAnswer("person_note_add", data, error);
    return { note: note ? writtenNote(ctx, note) : null };
  },
});
