/**
 * May we contact this person?
 *
 * One predicate, because this rule was hand-inlined in five places — the
 * webhook's consent gate, the reply route, the send job, the voice booking-link
 * function and the view model — and a rule about not contacting people who
 * asked to be left alone is the last one that should drift. Five copies is five
 * chances for the next send path to check only `consent` and miss `dnc`.
 *
 * Both columns matter and either alone is decisive:
 *   consent  the state machine the customer drives — 'unknown' | 'opted_in'
 *            | 'opted_out', written by ingest when they text STOP or START.
 *   dnc      the operator-settable override, for a request made by phone, in
 *            person, or by a regulator.
 *
 * Absence is NOT an opt-out. Both fields are optional here because a caller may
 * be holding a row selected before these columns were projected, and reading a
 * missing value as a block would silence every contact the moment somebody
 * forgot a column in a SELECT.
 */
export interface ConsentBearing {
  consent?: string | null;
  dnc?: boolean | null;
}

export function isOptedOutContact(c: ConsentBearing): boolean {
  return c.consent === "opted_out" || c.dnc === true;
}

/** The customer-facing reason, used wherever a refusal is explained. */
export const OPT_OUT_REFUSAL = "This customer asked to stop receiving messages. They can text START to opt back in.";

/* -------------------------------------------------------------------------- *
 * Two questions, two answers.
 *
 * A person can be asked two different things, and the carriers require them to
 * be asked separately (error 30913, and CTIA §5.1: "express written consent to
 * SPECIFICALLY receive marketing messages"). Until now this product asked once
 * and spent the answer everywhere, which over-blocked a genuine appointment
 * reminder and under-blocked a promotional send from the voice path.
 *
 *   conversational  replying to them, and messages about their own visit.
 *                   Implied when they write first; express when they text START.
 *   marketing       offers, news, re-engagement. NEVER implied.
 *
 * `dnc` and `consent === 'opted_out'` remain absolute: STOP means stop, on both.
 * The reverse is not symmetric and must not be made so -- declining offers is
 * not a request to stop hearing about your own appointment.
 * -------------------------------------------------------------------------- */

export type SendPurpose = "conversational" | "marketing";

export interface PurposeBearing extends ConsentBearing {
  marketing_consent?: string | null;
}

/**
 * May a message of this purpose go to this person?
 *
 * `proactive` is the existing distinction, kept: answering somebody who wrote to
 * you needs only that they have not asked you to stop, while starting a
 * conversation needs their recorded yes.
 *
 * Marketing needs its own yes on top, and it FAILS CLOSED -- a row selected
 * without the column reads as `undefined`, which is not `'opted_in'`, so a
 * forgotten SELECT withholds an offer rather than sending one. That asymmetry
 * is deliberate and is the opposite of `isOptedOutContact`'s, which fails open
 * for the same reason in the other direction: a missing column must never
 * silence a reply, and must never authorise a promotion.
 */
/** Why the predicate said no: a closed set, so a door cannot admit a reason that has no words. */
export type PurposeRefusal = "opted_out" | "no_marketing_consent" | "not_opted_in";

export function mayMessageFor(
  c: PurposeBearing,
  purpose: SendPurpose,
  opts: { proactive?: boolean } = {},
): { ok: true; reason: null } | { ok: false; reason: PurposeRefusal } {
  if (isOptedOutContact(c)) return { ok: false, reason: "opted_out" };
  if (purpose === "marketing") {
    return c.marketing_consent === "opted_in"
      ? { ok: true, reason: null }
      : { ok: false, reason: "no_marketing_consent" };
  }
  if (opts.proactive && c.consent !== "opted_in") return { ok: false, reason: "not_opted_in" };
  return { ok: true, reason: null };
}

/** Why a send was withheld, in the operator's words. */
export const PURPOSE_REFUSALS: Record<string, string> = {
  opted_out: OPT_OUT_REFUSAL,
  not_opted_in: "This customer has not said yes to messages yet.",
  no_marketing_consent: "This customer has not said yes to OFFERS. Appointment messages are fine; promotions are not.",
  // The texting line's carrier registration covers replies and appointment
  // messages and nothing else -- an informational campaign, filed that way
  // after the fourth refusal (30896, 11 Sep 2026). A promotion by text would
  // go out under a consent the carriers were never told about.
  sms_carries_no_promotions:
    "Offers and news do not go by text: the line is registered with the carriers for replies and appointment messages only. This customer hears about offers on WhatsApp, once they have said yes to them there.",
  // Email's three, at the wire (deliver.ts). Replies only until promotions by
  // email are a release of their own; a suppression is a fact about the address.
  email_marketing_disabled:
    "Offers and news do not go by email yet. This customer hears about offers on WhatsApp, once they have said yes to them there.",
  email_suppressed:
    "Email to this address has stopped: it bounced for good, or the person marked a message as spam. Correct the address on their page, or reach them another way.",
  recipient_changed:
    "This person's email address changed after the reply was written, so it was not sent. Write it again and it goes to the address on file now.",
};

/**
 * Said once on the Broadcasts page, where an owner picks an offer to send.
 * The refusal above is per customer, at the wire; this is the rule, for the
 * page, so a customer who only ever texted being absent from an offer's count
 * reads as the rule it is and not as a bug.
 */
export const OFFERS_BY_WHATSAPP_NOTE =
  "Offers and news go by WhatsApp only. The text line is registered with the carriers for replies and appointment messages, so nothing promotional is sent by text; someone who has only ever texted you hears about offers once they say yes on WhatsApp.";

/**
 * One change to one of the two answers, as the ledger recorded it.
 *
 * The events row is the proof: which question, what was said, how, by whom,
 * and -- for an answer the customer texted -- the channel, the provider's own
 * id of the message and the customer's words (00110). "When did she say yes,
 * to what, and how do we know" is answered from these and nothing else; the
 * profile's timeline and the workspace export both read this shape.
 */
export interface ConsentChange {
  id: string;
  contact_id: string | null;
  at: string;
  /** Which question: messages about their visit, or offers. */
  purpose: "conversational" | "marketing";
  consent: string | null;
  previous: string | null;
  /** How it was given: in person, on the phone, a signed form, their own message; "operator" is the reset. */
  source: string | null;
  /** The member who recorded it (their user id), or null when the customer's own message did. */
  by: string | null;
  note: string | null;
  /** For an answer the customer texted: where it came from, which message, and what they wrote. */
  channel: string | null;
  message_external_id: string | null;
  words: string | null;
}

/** An events row of kind contact.consent_changed, as the doors write it (00043, 00013, 00095, 00110). */
export function consentChangeOf(e: {
  id: string;
  subject_id: string | null;
  created_at: string;
  data: unknown;
}): ConsentChange {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const str = (k: string): string | null =>
    typeof d[k] === "string" && (d[k] as string) !== "" ? (d[k] as string) : null;
  return {
    id: e.id,
    contact_id: e.subject_id,
    at: e.created_at,
    purpose: d.purpose === "marketing" ? "marketing" : "conversational",
    consent: str("consent"),
    previous: str("previous"),
    source: str("source"),
    by: str("by"),
    note: str("note"),
    channel: str("channel"),
    message_external_id: str("message_external_id"),
    words: str("words"),
  };
}

/**
 * What kind of message a WhatsApp template is, from the category META assigned
 * it — which is the authority, not what the workspace asked for, and which Meta
 * can change on a live template.
 *
 * FAILS CLOSED, and this is the whole subtlety. `templates.category` is NULL for
 * exactly the rows most likely to matter: `booking_link` was seeded by hand
 * before the column existed, any workspace that has never run a template sync
 * has NULL throughout, and the mapper returns null for anything Meta names that
 * we do not recognise. Written the obvious way -- `category === 'marketing'` --
 * the gate would let every one of those through as if it were transactional.
 * So only the two categories that are POSITIVELY not marketing count as
 * conversational, and everything else, NULL included, is treated as marketing.
 */
export function purposeOfTemplate(category: string | null | undefined): SendPurpose {
  return category === "utility" || category === "authentication" ? "conversational" : "marketing";
}

/**
 * What kind of message a playbook sends, from the class it already declares.
 *
 * `booking` is a reminder about an appointment the customer made. `reengage` and
 * `campaign` are promotional by definition -- reaching somebody who has gone
 * quiet, or running an offer. Unknown classes are marketing, for the same
 * fail-closed reason as templates.
 */
export function purposeOfPlaybook(policyClass: string | null | undefined): SendPurpose {
  return policyClass === "booking" ? "conversational" : "marketing";
}
