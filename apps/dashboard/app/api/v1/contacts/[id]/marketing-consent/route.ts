import { z } from "zod";
import { CONSENT_STATES } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { recordOffersConsent } from "@/server/people/consent";

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
 *
 * The handle is recordOffersConsent in src/server/people/consent.ts: the route is its declaration (who may, how
 * often), the verb is what it does: judged first in a person's words (a yes to offers is written), then the answer,
 * its event and the history line in one write (00356 record_consent).
 */
export const PUT = write({
  scope: contactScope,
  role: "operator",
  rate: "consent",
  input: Body,
  handle: ({ ctx, row, input }) => recordOffersConsent(ctx, row, input),
});
