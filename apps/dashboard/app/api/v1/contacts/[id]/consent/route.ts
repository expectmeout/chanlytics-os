import { z } from "zod";
import { AppError, CONSENT_RESET_SOURCE, CONSENT_SOURCES, CONSENT_STATES } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope, recordDecision } from "@/server/verbs";

const Body = z.object({
  consent: z.enum(CONSENT_STATES as unknown as [string, ...string[]], { message: "Consent must be one of: opted_in, opted_out, unknown." }),
  source: z.string().optional(),
  note: z.string().optional(),
});

/**
 * PUT /api/v1/contacts/:id/consent — { consent, source?, note? }
 *
 * The customer's CONVERSATIONAL answer -- messages about their own visit, and a
 * reply when they write -- recorded by the person who heard it. Not offers: those
 * are a separate answer with their own door, ../marketing-consent/route.ts, since
 * 00095 split the two because the carriers require them collected separately.
 * "opted_in" and "opted_out" need a source that says how — in person, on the
 * phone, on a form, or in their own message; "unknown" is the reset to "not
 * asked" and carries no source. Owner or operator: the front desk is where the
 * answer is usually given. The door is one definer function that writes the
 * three consent columns together and keeps the event; the ledger row here says
 * who recorded it and how.
 *
 * The contact is the row (contactScope in verbs.ts): read under RLS, so one
 * the caller cannot see is a 404 rather than a leak, and the role is decided
 * against the contact's tenant, never one from the body.
 */
export const PUT = write({
  scope: contactScope,
  role: "operator",
  rate: "consent",
  input: Body,
  handle: async ({ ctx, row: contact, input: body }) => {
    const id = contact.id;
    const consent = body.consent;
    const source = consent === "unknown" ? CONSENT_RESET_SOURCE : body?.source;
    if (typeof source !== "string" || (consent !== "unknown" && !CONSENT_SOURCES.some((s) => s.id === source))) {
      throw new AppError("validation", "Say how they told you: in person, on the phone, on a form, or in their own message.");
    }
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;

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
  },
});
