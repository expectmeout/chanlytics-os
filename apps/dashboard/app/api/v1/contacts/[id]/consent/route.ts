import { ConsentAnswerBody } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { recordVisitConsent } from "@/server/people/consent";

/**
 * PUT /api/v1/contacts/:id/consent — { consent, source?, note?, message_id? }
 *
 * The customer's CONVERSATIONAL answer -- messages about their own visit, and a
 * reply when they write -- recorded by the person who heard it. Not offers: those
 * are a separate answer with their own door, ../marketing-consent/route.ts, since
 * 00095 split the two because the carriers require them collected separately.
 * "opted_in" and "opted_out" need a source that says how — in person, on the
 * phone, on a form, or in their own message; "unknown" is the reset to "not
 * asked" and carries no source. Owner or operator: the front desk is where the
 * answer is usually given.
 *
 * "In their own message" names the message (00137): `message_id`, one they
 * sent. The door judges it -- theirs, inbound, with words in it -- and copies
 * its words into the evidence, since only the database can see the message.
 *
 * The contact is the row (contactScope in verbs.ts): read under RLS, so one
 * the caller cannot see is a 404 rather than a leak, and the role is decided
 * against the contact's tenant, never one from the body.
 *
 * The handle is recordVisitConsent in src/server/people/consent.ts: the route is its declaration (who may, how
 * often), the verb is what it does: the answer, its event and the history line that says who recorded it, in one write
 * (00356 record_consent).
 */
export const PUT = write({
  scope: contactScope,
  role: "operator",
  rate: "consent",
  input: ConsentAnswerBody,
  handle: ({ ctx, row, input }) => recordVisitConsent(ctx, row, input),
});
