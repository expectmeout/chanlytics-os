import { AppError } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { jsonBody, requireUuid } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";

/**
 * PUT /api/v1/contacts/:id/details — { name?, notes? }
 *
 * The owner's own words about a person: what to call them, and the notes
 * the receptionist reads before it answers them. Either field alone; an
 * empty string clears it. Owner or operator, through two definer doors
 * that each record an event, so the profile can say who changed what.
 * Nothing here is ever sent to the customer.
 */
export const PUT = withRoute(async (req, ctx) => {
  await takeRate(ctx.userId, "person_edit");
  const id = requireUuid(ctx.params.id, "contact");
  const body = (await jsonBody(req)) as { name?: unknown; notes?: unknown } | null;
  const hasName = typeof body?.name === "string";
  const hasNotes = typeof body?.notes === "string";
  if (!hasName && !hasNotes) throw new AppError("validation", "Send a name, notes, or both.");
  const name = hasName ? (body!.name as string).trim().slice(0, 80) : null;
  const notes = hasNotes ? (body!.notes as string).trim().slice(0, 600) : null;

  // RLS scopes this read, so a contact the caller cannot see is a 404 rather
  // than a leak; the role is then decided against the contact's tenant.
  const { data: contact, error } = await ctx.supabase
    .from("contacts")
    .select("id, tenant_id, erased_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!contact || contact.erased_at) throw new AppError("not_found", "Contact not found.", 404);
  const member = await memberContext(ctx, contact.tenant_id);
  requireRole(member, "operator");

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
});
