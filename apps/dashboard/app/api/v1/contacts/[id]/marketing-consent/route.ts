import { z } from "zod";
import {
  AppError,
  CONSENT_RESET_SOURCE,
  CONSENT_SOURCES,
  CONSENT_STATES,
  offersYesRefusal,
  ownMessageRefusal,
} from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope, recordDecision } from "@/server/verbs";

const Body = z.object({
  consent: z.enum(CONSENT_STATES as unknown as [string, ...string[]], {
    message: "Consent must be one of: opted_in, opted_out, unknown.",
  }),
  source: z.string().optional(),
  note: z.string().optional(),
  message_id: z.string().uuid({ message: "Choose one of their messages." }).optional(),
});

/**
 * PUT /api/v1/contacts/:id/marketing-consent — { consent, source?, note?, message_id? }
 *
 * THE SECOND DOOR, and the reason this file exists. Migration 00095 split
 * consent into two answers and wrote `set_marketing_consent` for "ONE function,
 * two callers ... a text from the customer and a person at the desk recording a
 * form the customer signed". Only the first caller was ever built: the edge's
 * ingest, when somebody texts YES OFFERS. There was no door at all for the
 * second, so a salon holding thirty signed consent slips had no way to record
 * them — and both controls that looked like they did wrote the OTHER column,
 * leaving the owner in a loop where the broadcast composer refused the audience
 * and pointed at the button that had just failed to fix it.
 *
 * It is a sibling of ../consent/route.ts and deliberately shaped the same way:
 * the same states, the same four sources, the same 200-character note, the same
 * RLS-scoped read (contactScope) so a contact the caller cannot see is a 404
 * rather than a leak, the same operator role, the same decision ledger. Two
 * routes rather than one with a `purpose` parameter, because the two answers
 * have different rules underneath — the conversational door derives `dnc` from
 * an opt-out, and this one must never touch it: declining offers is not a
 * request to stop hearing about your own appointment.
 *
 * The RPC takes the tenant explicitly (it is also called with no session, by the
 * edge), so the tenant passed here is the one the contact was READ from under
 * RLS, never one from the request body.
 *
 * "In their own message" names the message (00137), as at its sibling: the
 * door judges `message_id` and reads the words itself. The route hands in no
 * evidence of its own -- a session that did would be writing the proof.
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
      throw new AppError(
        "validation",
        "Say how they told you: in person, on the phone, on a form, or in their own message.",
      );
    }
    // A yes to OFFERS is written or it is not recorded. The database refuses a spoken
    // one as well (00100); asking here first hands the person a sentence instead of
    // the database's. A NO is never narrowed: "no more offers" said at the desk is
    // honoured as it was said.
    if (consent === "opted_in") {
      const refusal = offersYesRefusal(source);
      if (refusal) throw new AppError("validation", refusal);
    }
    const messageId = body.message_id ?? null;
    const ownMessage = ownMessageRefusal(source, messageId);
    if (ownMessage) throw new AppError("validation", ownMessage);
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;

    const { data, error: doorErr } = await ctx.supabase.rpc("set_marketing_consent", {
      p_tenant_id: contact.tenant_id,
      p_contact_id: id,
      p_consent: consent,
      p_source: source,
      ...(note ? { p_note: note } : {}),
      ...(messageId ? { p_message_id: messageId } : {}),
    });
    if (doorErr) throw new AppError("validation", doorErr.message);
    const r = (data ?? {}) as { marketing_consent?: string | null; marketing_consent_updated_at?: string | null };

    // The ledger row says who recorded it and how, and names the purpose — so one
    // query over `events` answers "what has this person agreed to, and when".
    const decisionId = await recordDecision(ctx, contact.tenant_id, "contact", id, "consent_change", {
      purpose: "marketing",
      consent,
      source,
      note,
      previous: contact.marketing_consent ?? null,
      ...(messageId ? { message_id: messageId } : {}),
    });
    return {
      contact_id: id,
      purpose: "marketing" as const,
      consent: r.marketing_consent ?? consent,
      source,
      updated_at: r.marketing_consent_updated_at ?? null,
      decision_id: decisionId,
    };
  },
});
