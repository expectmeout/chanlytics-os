import { z } from "zod";
import { AppError, normalizeEmail, whyNotAnEmail } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";

/** Any field alone; an empty string clears it. */
const Body = z
  .object({
    name: z.string().optional(),
    notes: z.string().optional(),
    email: z.string().max(320).optional(),
  })
  .refine(
    (b) => b.name !== undefined || b.notes !== undefined || b.email !== undefined,
    "Send a name, notes or an email address.",
  );

/**
 * PUT /api/v1/contacts/:id/details — { name?, notes?, email? }
 *
 * The owner's own words about a person: what to call them, the notes the
 * receptionist reads before it answers them, and the address they can be
 * written to. Owner or operator, through three definer doors that each
 * record an event, so the profile can say who changed what. Nothing here is
 * ever sent to the customer.
 *
 * The address is judged HERE, by the one normalizer (normalizeEmail), so the
 * refusal names which kind of not-an-address it was; the door (00125) holds
 * the stored shape and the one-per-workspace rule, and its refusal for a
 * second person with the same address is already in the owner's words.
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

    const out: { contact_id: string; name?: string | null; notes?: string | null; email?: string | null } = {
      contact_id: id,
    };
    if (hasName) {
      const { data, error: doorErr } = await ctx.supabase.rpc("set_person_name", {
        p_contact_id: id,
        p_name: name ?? "",
      });
      if (doorErr) throw new AppError("validation", doorErr.message);
      out.name = ((data ?? {}) as { name?: string | null }).name ?? null;
    }
    if (hasNotes) {
      const { data, error: doorErr } = await ctx.supabase.rpc("set_person_notes", {
        p_contact_id: id,
        p_notes: notes ?? "",
      });
      if (doorErr) throw new AppError("validation", doorErr.message);
      out.notes = ((data ?? {}) as { notes?: string | null }).notes ?? null;
    }
    if (input.email !== undefined) {
      const typed = input.email.trim();
      const email = typed ? normalizeEmail(typed) : null;
      if (typed && !email) throw new AppError("validation", whyNotAnEmail(typed) ?? "That is not an email address.");
      const { data, error: doorErr } = await ctx.supabase.rpc("set_person_email", {
        p_contact_id: id,
        p_email: email ?? "",
      });
      // 23505 is the door's own word for "another person here already has that address".
      if (doorErr) throw new AppError(doorErr.code === "23505" ? "conflict" : "validation", doorErr.message);
      out.email = ((data ?? {}) as { email?: string | null }).email ?? null;
    }
    return out;
  },
});
