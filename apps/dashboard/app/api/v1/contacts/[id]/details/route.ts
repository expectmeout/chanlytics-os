import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";

/** Either field alone; an empty string clears it. */
const Body = z
  .object({
    name: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((b) => b.name !== undefined || b.notes !== undefined, "Send a name, notes, or both.");

/**
 * PUT /api/v1/contacts/:id/details — { name?, notes? }
 *
 * The owner's own words about a person: what to call them, and the notes
 * the receptionist reads before it answers them. Owner or operator, through
 * two definer doors that each record an event, so the profile can say who
 * changed what. Nothing here is ever sent to the customer.
 *
 * The contact is the row (contactScope): a live person the caller can see
 * under RLS, the role judged where they live.
 */
export const PUT = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: Body,
  handle: async ({ ctx, row: contact, input }) => {
    const id = contact.id;
    const hasName = input.name !== undefined;
    const hasNotes = input.notes !== undefined;
    const name = input.name === undefined ? null : input.name.trim().slice(0, 80);
    const notes = input.notes === undefined ? null : input.notes.trim().slice(0, 600);

    const out: { contact_id: string; name?: string | null; notes?: string | null } = { contact_id: id };
    if (hasName) {
      const { data, error: doorErr } = await ctx.supabase.rpc("set_person_name", { p_contact_id: id, p_name: name ?? "" });
      if (doorErr) throw new AppError("validation", doorErr.message);
      out.name = ((data ?? {}) as { name?: string | null }).name ?? null;
    }
    if (hasNotes) {
      const { data, error: doorErr } = await ctx.supabase.rpc("set_person_notes", { p_contact_id: id, p_notes: notes ?? "" });
      if (doorErr) throw new AppError("validation", doorErr.message);
      out.notes = ((data ?? {}) as { notes?: string | null }).notes ?? null;
    }
    return out;
  },
});
