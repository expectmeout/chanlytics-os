import { AppError, CONSENT_RESET_SOURCE, CONSENT_SOURCES } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { jsonBody, requireUuid } from "@/server/request-guards";
import { recordDecision } from "@/server/verbs";
import { takeRate } from "@/server/rate-limit";

const STATES = ["opted_in", "opted_out", "unknown"] as const;

/**
 * PUT /api/v1/contacts/:id/consent — { consent, source?, note? }
 *
 * The customer's answer about marketing messages, recorded by the person who
 * heard it. "opted_in" and "opted_out" need a source that says how — in
 * person, on the phone, on a form, or in their own message; "unknown" is the
 * reset to "not asked" and carries no source. Owner or operator: the front
 * desk is where the answer is usually given. The door is one definer
 * function that writes the three consent columns together and keeps the
 * event; the ledger row here says who recorded it and how.
 */
export const PUT = withRoute(async (req, ctx) => {
  await takeRate(ctx.userId, "consent");
  const id = requireUuid(ctx.params.id, "contact");
  const body = (await jsonBody(req)) as { consent?: unknown; source?: unknown; note?: unknown } | null;
  const consent = body?.consent;
  if (typeof consent !== "string" || !(STATES as readonly string[]).includes(consent)) {
    throw new AppError("validation", "Consent must be one of: opted_in, opted_out, unknown.");
  }
  const source = consent === "unknown" ? CONSENT_RESET_SOURCE : body?.source;
  if (typeof source !== "string" || (consent !== "unknown" && !CONSENT_SOURCES.some((s) => s.id === source))) {
    throw new AppError("validation", "Say how they told you: in person, on the phone, on a form, or in their own message.");
  }
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;

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

  const { data, error: doorErr } = await ctx.supabase.rpc("set_contact_consent", {
    p_contact_id: id,
    p_consent: consent,
    p_source: source,
    ...(note ? { p_note: note } : {}),
  });
  if (doorErr) throw new AppError("validation", doorErr.message);
  const r = (data ?? {}) as { previous?: string | null; updated_at?: string | null; dnc?: boolean };

  const decisionId = await recordDecision(ctx, contact.tenant_id, "contact", id, "consent_change", {
    consent, source, note, previous: r.previous ?? null,
  });
  return { contact_id: id, consent, dnc: !!r.dnc, source, updated_at: r.updated_at ?? null, decision_id: decisionId };
});
